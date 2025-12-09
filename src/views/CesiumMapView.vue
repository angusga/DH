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
// 注意：这里只实现一个“简化演示版”路径计算：
//  - 如果起终点在同一条管线：沿管线走
//  - 不在同一条管线：画一条直线连接
const polyLinePoints = ref([])
const polyLines = ref({})
const selectedStartPoint = ref(null)
const selectedEndPoint = ref(null)
const navigationResult = ref(null)

const lineEntities = ref([])
const pointEntities = ref([])
const routeEntity = ref(null)

onMounted(async () => {
  await initCesium()
  await loadGeoJsonData()
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
    const response = await fetch('/dld.geojson')
    const geojson = await response.json()

    polyLinePoints.value = geojson.features
      .map(feature => {
        const lon = feature.geometry.coordinates[0]
        const lat = feature.geometry.coordinates[1]

        if (!isValidCoordinate(lon, lat)) {
          return null
        }

        return {
          id: feature.properties.ID,
          polyLineId: feature.properties.PolyLineID,
          plPointId: feature.properties.PLPointID,
          longitude: Number(lon),
          latitude: Number(lat),
          info: feature.properties.PLPointInf
        }
      })
      .filter(p => p !== null)

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

// 简化版：起点终点选择 + 简单路径
function selectPoint(point, type) {
  if (type === 'start') {
    selectedStartPoint.value = point
  } else {
    selectedEndPoint.value = point
  }

  // 自动计算一次
  if (selectedStartPoint.value && selectedEndPoint.value) {
    calculateRoute()
  }
}

function calculateRoute() {
  if (!selectedStartPoint.value || !selectedEndPoint.value) return

  const start = selectedStartPoint.value
  const end = selectedEndPoint.value

  let path = []
  let distance = 0

  if (start.polyLineId === end.polyLineId) {
    // 同一条管线：沿着管线走
    const linePoints = polyLines.value[start.polyLineId] || []
    const idx1 = linePoints.findIndex(p => p.id === start.id)
    const idx2 = linePoints.findIndex(p => p.id === end.id)

    if (idx1 !== -1 && idx2 !== -1) {
      if (idx1 <= idx2) {
        for (let i = idx1; i <= idx2; i++) {
          path.push({
            longitude: linePoints[i].longitude,
            latitude: linePoints[i].latitude
          })
        }
      } else {
        for (let i = idx1; i >= idx2; i--) {
          path.push({
            longitude: linePoints[i].longitude,
            latitude: linePoints[i].latitude
          })
        }
      }
    }
  }

  if (path.length < 2) {
    // 不在同一条管线，或上面没成功，就用直线连接（演示）
    path = [
      { longitude: start.longitude, latitude: start.latitude },
      { longitude: end.longitude, latitude: end.latitude }
    ]
  }

  // 计算距离
  for (let i = 0; i < path.length - 1; i++) {
    distance += calculateDistance(
      path[i].longitude,
      path[i].latitude,
      path[i + 1].longitude,
      path[i + 1].latitude
    )
  }

  navigationResult.value = {
    path,
    distance,
    distanceStr:
      distance < 2000
        ? `${distance.toFixed(2)}m`
        : `${(distance / 1000).toFixed(2)}km`
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