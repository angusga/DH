<template>
  <div class="map-container">
    <div id="cesiumContainer" class="map"></div>

    <!-- 导航控制面板 -->
    <div class="control-panel" v-if="showPanel">
      <div class="panel-header">
        <h3>Cesium 导航演示</h3>
        <button @click="closePanel" class="close-btn">×</button>
      </div>

      <div class="panel-content">
        <div class="form-group">
          <label>起点：</label>
          <div v-if="selectedStartPoint" class="point-info">
            管线{{ selectedStartPoint.polyLineId }} - 点{{ selectedStartPoint.plPointId }}
          </div>
          <div v-else class="point-info text-muted">点击地图上的起点标记</div>
        </div>

        <div class="form-group">
          <label>终点：</label>
          <div v-if="selectedEndPoint" class="point-info">
            管线{{ selectedEndPoint.polyLineId }} - 点{{ selectedEndPoint.plPointId }}
          </div>
          <div v-else class="point-info text-muted">点击地图上的终点标记</div>
        </div>

        <button
          @click="startNavigation"
          class="nav-btn"
          :disabled="!selectedStartPoint || !selectedEndPoint"
        >
          开始导航（演示）
        </button>

        <div v-if="navigationResult" class="nav-result">
          <div class="distance-info">
            <strong>距离：</strong>{{ navigationResult.distanceStr }}
          </div>
          <div class="point-count">
            <strong>路径点数：</strong>{{ navigationResult.path.length }}
          </div>
        </div>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <button @click="togglePanel" class="tool-btn">导航面板</button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { cesiumConfig } from '../config/cesium'

// Cesium 基本配置
Cesium.Ion.defaultAccessToken = cesiumConfig.ionToken

const viewerRef = ref(null)
const showPanel = ref(true)

// 管线与导航相关数据（复用 AMap 版本的数据结构）
const polyLinePoints = ref([])
const polyLines = ref({})
const polyLineConnections = ref({}) // 管线连接关系
const selectedStartPoint = ref(null)
const selectedEndPoint = ref(null)
const navigationResult = ref(null)

const lineEntities = ref([])
const pointEntities = ref([])
const routeEntity = ref(null)

onMounted(async () => {
  await initCesium()
  await loadGeoJsonData()
  // 线数据加载完成后构建管线连接关系
  buildPolyLineConnections()
  displayPolyLines()
})

onUnmounted(() => {
  if (viewerRef.value) {
    viewerRef.value.destroy()
    viewerRef.value = null
  }
})

async function initCesium() {
  const viewer = new Cesium.Viewer('cesiumContainer', {
    animation: false,
    timeline: false,
    baseLayerPicker: true,
    geocoder: false,
    sceneModePicker: true,
    navigationHelpButton: false,
    infoBox: false,
    homeButton: true,
    fullscreenButton: false
  })

  // 切到 2D 或 Columbus View，更接近 AMap 的体验
  viewer.scene.mode = Cesium.SceneMode.SCENE2D

  viewerRef.value = viewer
}

function isValidCoordinate(lon, lat) {
  return (
    typeof lon === 'number' &&
    typeof lat === 'number' &&
    !isNaN(lon) &&
    !isNaN(lat) &&
    isFinite(lon) &&
    isFinite(lat) &&
    lon >= -180 &&
    lon <= 180 &&
    lat >= -90 &&
    lat <= 90
  )
}

async function loadGeoJsonData() {
  try {
    // 改为读取线数据的 GeoJSON
    const response = await fetch('/dlcs.geojson')
    const geojson = await response.json()

    const points = []
    geojson.features.forEach((feature, featureIndex) => {
      if (!feature.geometry) return

      const geometry = feature.geometry
      const props = feature.properties || {}

      const lineId =
        props.PolyLineID ??
        props.lineId ??
        props.LINE_ID ??
        feature.id ??
        `line_${featureIndex}`

      if (geometry.type === 'LineString') {
        const coords = geometry.coordinates || []
        coords.forEach((coord, idx) => {
          const lon = coord[0]
          const lat = coord[1]

          if (!isValidCoordinate(lon, lat)) {
            console.warn('无效坐标(LineString):', lineId, idx, lon, lat)
            return
          }

          points.push({
            id: `${lineId}_${idx}`,
            polyLineId: lineId,
            plPointId: idx,
            longitude: Number(lon),
            latitude: Number(lat),
            info: props.PLPointInf
          })
        })
      } else if (geometry.type === 'Point') {
        // 兼容旧的点数据格式
        const lon = geometry.coordinates[0]
        const lat = geometry.coordinates[1]

        if (!isValidCoordinate(lon, lat)) {
          console.warn('无效坐标(Point):', props.ID, lon, lat)
          return
        }

        points.push({
          id: props.ID ?? `pt_${featureIndex}`,
          polyLineId: props.PolyLineID ?? lineId,
          plPointId: props.PLPointID ?? 0,
          longitude: Number(lon),
          latitude: Number(lat),
          info: props.PLPointInf
        })
      }
    })

    polyLinePoints.value = points

    // 按 PolyLineID 分组
    polyLines.value = {}
    polyLinePoints.value.forEach(point => {
      if (!polyLines.value[point.polyLineId]) {
        polyLines.value[point.polyLineId] = []
      }
      polyLines.value[point.polyLineId].push(point)
    })

    // 按 PLPointID 排序
    Object.keys(polyLines.value).forEach(lineId => {
      polyLines.value[lineId].sort((a, b) => a.plPointId - b.plPointId)
    })
  } catch (e) {
    console.error('加载 geojson 失败:', e)
  }
}

function displayPolyLines() {
  const viewer = viewerRef.value
  if (!viewer) return

  // 清空旧实体
  lineEntities.value.forEach(e => viewer.entities.remove(e))
  pointEntities.value.forEach(e => viewer.entities.remove(e))
  lineEntities.value = []
  pointEntities.value = []

  const allPositions = []

  Object.keys(polyLines.value).forEach(lineId => {
    const points = polyLines.value[lineId]
    if (!points || points.length < 2) return

    const coords = []
    points.forEach(p => {
      if (isValidCoordinate(p.longitude, p.latitude)) {
        coords.push(p.longitude, p.latitude)
        const pos = Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude)
        allPositions.push(pos)
      }
    })

    if (coords.length < 4) return

    // 管线 polyline
    const polylineEntity = viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(coords),
        width: 3,
        material: Cesium.Color.fromCssColorString('#3366FF').withAlpha(0.8)
      }
    })
    lineEntities.value.push(polylineEntity)

    // 起终点标记
    const startPoint = points[0]
    const endPoint = points[points.length - 1]

    const startEntity = createEndpointBillboard(startPoint, 'start')
    const endEntity =
      startPoint.id === endPoint.id
        ? null
        : createEndpointBillboard(endPoint, 'end')

    if (startEntity) pointEntities.value.push(startEntity)
    if (endEntity) pointEntities.value.push(endEntity)
  })

  // 视野适配
  if (allPositions.length > 0) {
    const viewer = viewerRef.value
    const boundingSphere = Cesium.BoundingSphere.fromPoints(allPositions)
    viewer.camera.flyToBoundingSphere(boundingSphere, {
      duration: 1.0
    })
  }
}

function createEndpointBillboard(point, type) {
  const viewer = viewerRef.value
  if (!viewer) return null

  if (!isValidCoordinate(point.longitude, point.latitude)) return null

  const color = type === 'start' ? Cesium.Color.GREEN : Cesium.Color.RED

  const entity = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude),
    point: {
      pixelSize: 10,
      color,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2
    },
    properties: {
      type: type === 'start' ? 'startEndpoint' : 'endEndpoint',
      pointData: point
    }
  })

  // 点击事件：使用 ScreenSpaceEventHandler 做拾取
  if (!viewer._cnpcClickHandler) {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction(click => {
      const picked = viewer.scene.pick(click.position)
      if (Cesium.defined(picked) && picked.id && picked.id.properties) {
        const props = picked.id.properties
        const pType = props.type && props.type.getValue()
        const pData = props.pointData && props.pointData.getValue()

        if (pType === 'startEndpoint') {
          selectPoint(pData, 'start')
        } else if (pType === 'endEndpoint') {
          selectPoint(pData, 'end')
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
    viewer._cnpcClickHandler = handler
  }

  return entity
}

function togglePanel() {
  showPanel.value = !showPanel.value
}

function closePanel() {
  showPanel.value = false
}

// Haversine 距离
function calculateDistance(lon1, lat1, lon2, lat2) {
  const R = 6378137
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// 构建管线连接关系（通过端点连接）
function buildPolyLineConnections() {
  polyLineConnections.value = {}
  const connectionThreshold = 10 // 10米内认为连接

  const lineIds = Object.keys(polyLines.value)

  // 初始化连接关系
  lineIds.forEach(lineId => {
    polyLineConnections.value[lineId] = []
  })

  // 找到每条管线的起点和终点
  const lineEndpoints = {}
  lineIds.forEach(lineId => {
    const points = polyLines.value[lineId]
    if (points.length > 0) {
      const start = points[0]
      const end = points[points.length - 1]
      lineEndpoints[lineId] = {
        start: { lon: start.longitude, lat: start.latitude },
        end: { lon: end.longitude, lat: end.latitude }
      }
    }
  })

  // 检查哪些管线是连接的
  for (let i = 0; i < lineIds.length; i++) {
    const lineId1 = lineIds[i]
    const ep1 = lineEndpoints[lineId1]
    if (!ep1) continue

    for (let j = i + 1; j < lineIds.length; j++) {
      const lineId2 = lineIds[j]
      const ep2 = lineEndpoints[lineId2]
      if (!ep2) continue

      const dist1 = calculateDistance(ep1.start.lon, ep1.start.lat, ep2.start.lon, ep2.start.lat)
      const dist2 = calculateDistance(ep1.start.lon, ep1.start.lat, ep2.end.lon, ep2.end.lat)
      const dist3 = calculateDistance(ep1.end.lon, ep1.end.lat, ep2.start.lon, ep2.start.lat)
      const dist4 = calculateDistance(ep1.end.lon, ep1.end.lat, ep2.end.lon, ep2.end.lat)

      if (
        dist1 < connectionThreshold ||
        dist2 < connectionThreshold ||
        dist3 < connectionThreshold ||
        dist4 < connectionThreshold
      ) {
        if (!polyLineConnections.value[lineId1].includes(lineId2)) {
          polyLineConnections.value[lineId1].push(lineId2)
        }
        if (!polyLineConnections.value[lineId2].includes(lineId1)) {
          polyLineConnections.value[lineId2].push(lineId1)
        }
      }
    }
  }
}

// 计算管线的长度
function calculatePolyLineLength(lineId) {
  const points = polyLines.value[lineId]
  if (!points || points.length < 2) return 0

  let length = 0
  for (let i = 0; i < points.length - 1; i++) {
    length += calculateDistance(
      points[i].longitude,
      points[i].latitude,
      points[i + 1].longitude,
      points[i + 1].latitude
    )
  }
  return length
}

// Dijkstra算法计算最短路径（管线为节点）
function dijkstraShortestPath(startLineId, endLineId) {
  const INF = 1e10
  const lineIds = Object.keys(polyLines.value)
  const n = lineIds.length

  const dist = {}
  const prev = {}
  const visited = {}

  lineIds.forEach(id => {
    dist[id] = INF
    prev[id] = null
    visited[id] = false
  })

  dist[startLineId] = 0

  for (let i = 0; i < n; i++) {
    let u = null
    let minDist = INF
    lineIds.forEach(id => {
      if (!visited[id] && dist[id] < minDist) {
        minDist = dist[id]
        u = id
      }
    })

    if (u === null || u === endLineId) break
    visited[u] = true

    const neighbors = polyLineConnections.value[u] || []
    neighbors.forEach(v => {
      if (!visited[v]) {
        const edgeLength = calculatePolyLineLength(v)
        const alt = dist[u] + edgeLength
        if (alt < dist[v]) {
          dist[v] = alt
          prev[v] = u
        }
      }
    })
  }

  const path = []
  let current = endLineId
  while (current !== null) {
    path.unshift(current)
    current = prev[current]
  }

  return {
    path,
    distance: dist[endLineId] === INF ? null : dist[endLineId]
  }
}

// 获取管线上的点序列（从point1到point2）
function getPointsOnLine(lineId, point1, point2) {
  const linePoints = polyLines.value[lineId]
  if (!linePoints || linePoints.length === 0) return []

  const index1 = linePoints.findIndex(p => p.id === point1.id)
  const index2 = linePoints.findIndex(p => p.id === point2.id)

  if (index1 === -1 || index2 === -1) return []

  const points = []
  if (index1 <= index2) {
    for (let i = index1; i <= index2; i++) {
      points.push({
        longitude: linePoints[i].longitude,
        latitude: linePoints[i].latitude
      })
    }
  } else {
    for (let i = index1; i >= index2; i--) {
      points.push({
        longitude: linePoints[i].longitude,
        latitude: linePoints[i].latitude
      })
    }
  }

  return points
}

// 找到两条管线的连接点
function findConnectionPoint(lineId1, lineId2) {
  const line1 = polyLines.value[lineId1]
  const line2 = polyLines.value[lineId2]

  if (!line1 || !line2 || line1.length === 0 || line2.length === 0) {
    return null
  }

  const threshold = 10 // 10米
  const endpoints1 = [line1[0], line1[line1.length - 1]]
  const endpoints2 = [line2[0], line2[line2.length - 1]]

  let minDist = Infinity
  let bestConnection = null

  for (const ep1 of endpoints1) {
    for (const ep2 of endpoints2) {
      const dist = calculateDistance(ep1.longitude, ep1.latitude, ep2.longitude, ep2.latitude)
      if (dist < threshold && dist < minDist) {
        minDist = dist
        bestConnection = {
          point1: ep1,
          point2: ep2,
          line1Endpoint: ep1 === line1[0] ? 'start' : 'end',
          line2Endpoint: ep2 === line2[0] ? 'start' : 'end',
          distance: dist
        }
      }
    }
  }

  return bestConnection
}

// 起点终点选择
function selectPoint(point, type) {
  if (type === 'start') {
    selectedStartPoint.value = point
  } else {
    selectedEndPoint.value = point
  }

  if (selectedStartPoint.value && selectedEndPoint.value) {
    calculateRoute()
  }
}

// 严格沿管线网络计算路径（和高德版本一致）
function calculateRoute() {
  if (!selectedStartPoint.value || !selectedEndPoint.value) return

  const start = selectedStartPoint.value
  const end = selectedEndPoint.value

  let path = []
  let distance = 0

  if (start.polyLineId === end.polyLineId) {
    // 起终点在同一条管线
    path = getPointsOnLine(start.polyLineId, start, end)

    for (let i = 0; i < path.length - 1; i++) {
      distance += calculateDistance(
        path[i].longitude,
        path[i].latitude,
        path[i + 1].longitude,
        path[i + 1].latitude
      )
    }
  } else {
    // 不同管线，使用Dijkstra算法找最短路径
    const result = dijkstraShortestPath(start.polyLineId, end.polyLineId)

    if (result.distance === null || result.path.length === 0) {
      // 和高德版一样，找不到管线网络路径时才退回直线
      path = [
        { longitude: start.longitude, latitude: start.latitude },
        { longitude: end.longitude, latitude: end.latitude }
      ]
      distance = calculateDistance(start.longitude, start.latitude, end.longitude, end.latitude)
    } else {
      path = []

      // 1. 从起点到起点所在管线的连接点
      const startLinePoints = polyLines.value[start.polyLineId]
      const startIndex = startLinePoints.findIndex(p => p.id === start.id)

      if (startIndex >= 0) {
        const nextLineId = result.path.length > 1 ? result.path[1] : end.polyLineId
        const connection = findConnectionPoint(start.polyLineId, nextLineId)

        if (connection) {
          const connectionPoint = connection.point1
          const connectionIndex = startLinePoints.findIndex(p => p.id === connectionPoint.id)

          if (connectionIndex >= 0) {
            if (startIndex <= connectionIndex) {
              for (let i = startIndex; i <= connectionIndex; i++) {
                path.push({
                  longitude: startLinePoints[i].longitude,
                  latitude: startLinePoints[i].latitude
                })
              }
            } else {
              for (let i = startIndex; i >= connectionIndex; i--) {
                path.push({
                  longitude: startLinePoints[i].longitude,
                  latitude: startLinePoints[i].latitude
                })
              }
            }
          }
        } else {
          const distToStart = calculateDistance(
            start.longitude,
            start.latitude,
            startLinePoints[0].longitude,
            startLinePoints[0].latitude
          )
          const distToEnd = calculateDistance(
            start.longitude,
            start.latitude,
            startLinePoints[startLinePoints.length - 1].longitude,
            startLinePoints[startLinePoints.length - 1].latitude
          )

          if (distToStart < distToEnd) {
            for (let i = startIndex; i >= 0; i--) {
              path.push({
                longitude: startLinePoints[i].longitude,
                latitude: startLinePoints[i].latitude
              })
            }
          } else {
            for (let i = startIndex; i < startLinePoints.length; i++) {
              path.push({
                longitude: startLinePoints[i].longitude,
                latitude: startLinePoints[i].latitude
              })
            }
          }
        }
      }

      // 2. 中间各条管线
      for (let i = 1; i < result.path.length - 1; i++) {
        const lineId = result.path[i]
        const linePoints = polyLines.value[lineId]

        if (linePoints && linePoints.length > 0) {
          const prevLineId = result.path[i - 1]
          const nextLineId = result.path[i + 1]

          const prevConnection = findConnectionPoint(prevLineId, lineId)
          const nextConnection = findConnectionPoint(lineId, nextLineId)

          if (prevConnection && nextConnection) {
            const prevPoint = prevConnection.point2
            const nextPoint = nextConnection.point1

            const prevIndex = linePoints.findIndex(p => p.id === prevPoint.id)
            const nextIndex = linePoints.findIndex(p => p.id === nextPoint.id)

            if (prevIndex >= 0 && nextIndex >= 0) {
              if (prevIndex <= nextIndex) {
                for (let j = prevIndex; j <= nextIndex; j++) {
                  path.push({
                    longitude: linePoints[j].longitude,
                    latitude: linePoints[j].latitude
                  })
                }
              } else {
                for (let j = prevIndex; j >= nextIndex; j--) {
                  path.push({
                    longitude: linePoints[j].longitude,
                    latitude: linePoints[j].latitude
                  })
                }
              }
            }
          } else {
            linePoints.forEach(p => {
              path.push({
                longitude: p.longitude,
                latitude: p.latitude
              })
            })
          }
        }
      }

      // 3. 终点所在管线，从连接点到终点
      const endLinePoints = polyLines.value[end.polyLineId]
      const endIndex = endLinePoints.findIndex(p => p.id === end.id)

      if (endIndex >= 0 && result.path.length > 1) {
        const prevLineId = result.path[result.path.length - 2]
        const connection = findConnectionPoint(prevLineId, end.polyLineId)

        if (connection) {
          const connectionPoint = connection.point2
          const connectionIndex = endLinePoints.findIndex(p => p.id === connectionPoint.id)

          if (connectionIndex >= 0) {
            if (connectionIndex <= endIndex) {
              for (let i = connectionIndex; i <= endIndex; i++) {
                path.push({
                  longitude: endLinePoints[i].longitude,
                  latitude: endLinePoints[i].latitude
                })
              }
            } else {
              for (let i = connectionIndex; i >= endIndex; i--) {
                path.push({
                  longitude: endLinePoints[i].longitude,
                  latitude: endLinePoints[i].latitude
                })
              }
            }
          }
        } else {
          const distToStart = calculateDistance(
            end.longitude,
            end.latitude,
            endLinePoints[0].longitude,
            endLinePoints[0].latitude
          )
          const distToEnd = calculateDistance(
            end.longitude,
            end.latitude,
            endLinePoints[endLinePoints.length - 1].longitude,
            endLinePoints[endLinePoints.length - 1].latitude
          )

          if (distToStart < distToEnd) {
            for (let i = 0; i <= endIndex; i++) {
              path.push({
                longitude: endLinePoints[i].longitude,
                latitude: endLinePoints[i].latitude
              })
            }
          } else {
            for (let i = endLinePoints.length - 1; i >= endIndex; i--) {
              path.push({
                longitude: endLinePoints[i].longitude,
                latitude: endLinePoints[i].latitude
              })
            }
          }
        }
      }

      for (let i = 0; i < path.length - 1; i++) {
        distance += calculateDistance(
          path[i].longitude,
          path[i].latitude,
          path[i + 1].longitude,
          path[i + 1].latitude
        )
      }
    }
  }

  navigationResult.value = {
    path,
    distance,
    distanceStr:
      distance < 2000
        ? `${distance.toFixed(2)}m`
        : `${(distance / 1000).toFixed(2)}km`,
    pathPointCount: path.length
  }

  drawRoute(path)
}

function drawRoute(path) {
  const viewer = viewerRef.value
  if (!viewer) return

  // 清除旧路径
  if (routeEntity.value) {
    viewer.entities.remove(routeEntity.value)
    routeEntity.value = null
  }

  const coords = []
  path.forEach(p => {
    if (isValidCoordinate(p.longitude, p.latitude)) {
      coords.push(p.longitude, p.latitude)
    }
  })

  if (coords.length < 4) return

  routeEntity.value = viewer.entities.add({
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArray(coords),
      width: 6,
      material: Cesium.Color.fromCssColorString('#FF6600')
    }
  })

  viewer.flyTo(routeEntity.value, { duration: 1.0 })
}

function startNavigation() {
  if (!selectedStartPoint.value || !selectedEndPoint.value) {
    alert('请先选择起点和终点')
    return
  }
  calculateRoute()
}
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100vh;
  position: relative;
}

.map {
  width: 100%;
  height: 100%;
}

.control-panel {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 350px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid #eee;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
}

.panel-content {
  padding: 15px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
}

.point-info {
  font-size: 12px;
  color: #666;
  padding: 5px;
  background: #f5f5f5;
  border-radius: 4px;
}

.text-muted {
  color: #999;
  font-style: italic;
}

.nav-btn {
  width: 100%;
  padding: 10px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.nav-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.nav-result {
  margin-top: 15px;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 4px;
}

.distance-info {
  font-size: 14px;
}

.point-count {
  margin-top: 10px;
  font-size: 14px;
}

.toolbar {
  position: absolute;
  bottom: 30px;
  left: 20px;
  display: flex;
  gap: 10px;
  z-index: 1000;
}

.tool-btn {
  padding: 10px 20px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.tool-btn:hover {
  background: #f5f5f5;
}
</style>