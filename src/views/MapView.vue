<template>
  <div class="map-container">
    <div id="map" class="map"></div>
    
    <!-- 导航控制面板 -->
    <div class="control-panel" v-if="showPanel">
      <div class="panel-header">
        <h3>导航设置</h3>
        <button @click="closePanel" class="close-btn">×</button>
      </div>
      
      <div class="panel-content">
        <div class="form-group">
          <label>起点位置：</label>
          <div class="location-info">
            <span>经度: {{ currentLocation.longitude.toFixed(6) }}</span>
            <span>纬度: {{ currentLocation.latitude.toFixed(6) }}</span>
          </div>
        </div>
        
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
        
        <button @click="startNavigation" class="nav-btn" :disabled="!selectedStartPoint || !selectedEndPoint">
          开始导航
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
      <button @click="togglePanel" class="tool-btn">导航</button>
      <button @click="locateMe" class="tool-btn">定位</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import { amapConfig } from '../config/amap'

const map = ref(null)
const showPanel = ref(false)
const currentLocation = ref({ longitude: 83.166566, latitude: 40.81655 }) // 使用geojson数据的中心点
const polyLinePoints = ref([]) // 管线点数据
const polyLines = ref({}) // 按PolyLineID分组的管线
const polyLineConnections = ref({}) // 管线连接关系 {lineId: [连接的管线ID列表]}
const selectedStartPoint = ref(null) // 选中的起点
const selectedEndPoint = ref(null) // 选中的终点
const navigationResult = ref(null)
const routeLine = ref(null)
const markers = ref([])
const pointMarkers = ref([]) // 管线点标记

let mapInstance = null
let AMap = null

onMounted(async () => {
  // 添加全局错误处理，捕获高德地图SDK的错误
  const originalError = window.onerror
  window.onerror = function(msg, url, line, col, error) {
    // 忽略高德地图SDK的NaN错误（这些错误不影响功能）
    if (msg && msg.toString().includes('Invalid Object: LngLat(NaN, NaN)')) {
      return true // 阻止错误传播
    }
    if (msg && msg.toString().includes('Invalid Object: Pixel(NaN, NaN)')) {
      return true // 阻止错误传播
    }
    // 其他错误正常处理
    if (originalError) {
      return originalError.apply(this, arguments)
    }
    return false
  }
  
  await initMap()
  // loadGeoJsonData 会在地图加载完成后自动调用
})

onUnmounted(() => {
  if (mapInstance) {
    mapInstance.destroy()
  }
})

async function initMap() {
  try {
    // 配置安全密钥（必须在load之前设置）
    window._AMapSecurityConfig = {
      securityJsCode: amapConfig.securityJsCode
    }
    
    AMap = await AMapLoader.load({
      key: amapConfig.key,
      version: amapConfig.version,
      plugins: amapConfig.plugins,
      securityJsCode: amapConfig.securityJsCode
    })

    // 使用固定的有效坐标初始化
    const defaultLon = 83.166566
    const defaultLat = 40.81655
    
    // 确保坐标是数字类型
    currentLocation.value = { 
      longitude: defaultLon, 
      latitude: defaultLat 
    }

    // 使用最简单的配置初始化地图
    mapInstance = new AMap.Map('map', {
      zoom: 10,
      center: [defaultLon, defaultLat],
      viewMode: '2D',
      // 禁用一些可能导致问题的功能
      resizeEnable: true,
      rotateEnable: false,
      pitchEnable: false,
      // 禁用双击缩放，避免触发某些内部计算
      doubleClickZoom: false,
      // 禁用键盘操作
      keyboardEnable: false
    })

    // 添加错误处理（静默处理）
    try {
      mapInstance.on('error', (error) => {
        // 静默处理，不输出错误
      })
    } catch (e) {
      // 忽略
    }

    // 等待地图完全加载
    mapInstance.on('complete', () => {
      console.log('地图加载完成')
      // 延迟加载数据，确保地图完全稳定
      setTimeout(() => {
        loadGeoJsonData()
      }, 1000)
    })

    map.value = mapInstance
  } catch (error) {
    console.error('地图初始化失败:', error)
  }
}

// 验证坐标是否有效
function isValidCoordinate(lon, lat) {
  return typeof lon === 'number' && typeof lat === 'number' && 
         !isNaN(lon) && !isNaN(lat) && 
         isFinite(lon) && isFinite(lat) &&
         lon >= -180 && lon <= 180 && 
         lat >= -90 && lat <= 90
}

// 从geojson文件加载数据
async function loadGeoJsonData() {
  try {
    const response = await fetch('/dld.geojson')
    const geojson = await response.json()
    
    // 解析geojson数据，过滤无效坐标
    polyLinePoints.value = geojson.features
      .map(feature => {
        const lon = feature.geometry.coordinates[0]
        const lat = feature.geometry.coordinates[1]
        
        // 验证坐标有效性
        if (!isValidCoordinate(lon, lat)) {
          console.warn('无效坐标:', feature.properties.ID, lon, lat)
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
      .filter(point => point !== null) // 过滤掉无效点
    
    // 按PolyLineID分组
    polyLines.value = {}
    polyLinePoints.value.forEach(point => {
      if (!polyLines.value[point.polyLineId]) {
        polyLines.value[point.polyLineId] = []
      }
      polyLines.value[point.polyLineId].push(point)
    })
    
    // 按PLPointID排序
    Object.keys(polyLines.value).forEach(lineId => {
      polyLines.value[lineId].sort((a, b) => a.plPointId - b.plPointId)
    })
    
    // 构建管线连接关系（通过端点连接）
    buildPolyLineConnections()
    
    // 等待地图初始化完成后再显示
    if (mapInstance && AMap) {
      // 延迟更长时间，确保地图完全渲染
      setTimeout(() => {
        try {
          displayPolyLines()
          
          // 计算中心点并调整地图视野
          if (polyLinePoints.value.length > 0) {
            const validPoints = polyLinePoints.value.filter(p => 
              isValidCoordinate(p.longitude, p.latitude)
            )
            
            if (validPoints.length > 0) {
              // 计算有效坐标范围
              let minLon = Infinity, maxLon = -Infinity
              let minLat = Infinity, maxLat = -Infinity
              
              validPoints.forEach(point => {
                const lon = Number(point.longitude)
                const lat = Number(point.latitude)
                if (isValidCoordinate(lon, lat)) {
                  minLon = Math.min(minLon, lon)
                  maxLon = Math.max(maxLon, lon)
                  minLat = Math.min(minLat, lat)
                  maxLat = Math.max(maxLat, lat)
                }
              })
              
              // 使用更安全的方式设置视野
              if (isFinite(minLon) && isFinite(maxLon) && isFinite(minLat) && isFinite(maxLat) &&
                  minLon !== Infinity && maxLon !== -Infinity && 
                  minLat !== Infinity && maxLat !== -Infinity) {
                try {
                  const centerLon = (minLon + maxLon) / 2
                  const centerLat = (minLat + maxLat) / 2
                  
                  if (isValidCoordinate(centerLon, centerLat)) {
                    // 使用 setCenter 和 setZoom 代替 setBounds，更安全
                    mapInstance.setCenter([centerLon, centerLat])
                    // 根据范围计算合适的缩放级别
                    const lonRange = maxLon - minLon
                    const latRange = maxLat - minLat
                    const maxRange = Math.max(lonRange, latRange)
                    let zoom = 10
                    if (maxRange < 0.01) zoom = 15
                    else if (maxRange < 0.1) zoom = 12
                    else if (maxRange < 1) zoom = 10
                    else zoom = 8
                    mapInstance.setZoom(zoom)
                  }
                } catch (error) {
                  console.warn('设置地图视野失败，使用默认视野:', error)
                }
              } else {
                // 如果计算失败，使用第一个有效点
                const firstPoint = validPoints[0]
                if (firstPoint) {
                  const lon = Number(firstPoint.longitude)
                  const lat = Number(firstPoint.latitude)
                  if (isValidCoordinate(lon, lat)) {
                    try {
                      mapInstance.setCenter([lon, lat])
                      mapInstance.setZoom(12)
                    } catch (error) {
                      console.warn('设置地图中心失败:', error)
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error('显示管线数据失败:', error)
        }
      }, 1500) // 延迟1.5秒确保地图完全加载
    }
    
    console.log('加载了', polyLinePoints.value.length, '个管线点')
    console.log('共有', Object.keys(polyLines.value).length, '条管线')
  } catch (error) {
    console.error('加载geojson数据失败:', error)
  }
}

// 在地图上显示管线
function displayPolyLines() {
  if (!mapInstance || !AMap) {
    console.warn('地图未初始化，无法显示管线')
    return
  }
  
  // 清除之前的标记和折线
  try {
    pointMarkers.value.forEach(marker => {
      try {
        mapInstance.remove(marker)
      } catch (e) {
        // 忽略移除错误
      }
    })
    pointMarkers.value = []
    
    // 清除所有折线
    mapInstance.clearMap()
  } catch (e) {
    console.warn('清除地图元素失败:', e)
  }
  
  let successCount = 0
  let failCount = 0
  
  // 为每条管线绘制折线
  Object.keys(polyLines.value).forEach(lineId => {
    try {
      const points = polyLines.value[lineId]
      
      // 过滤有效坐标点
      const validPoints = points.filter(p => {
        const lon = Number(p.longitude)
        const lat = Number(p.latitude)
        return isValidCoordinate(lon, lat)
      })
      
      if (validPoints.length < 2) {
        failCount++
        return
      }
      
      // 再次验证并转换坐标，确保都是有效数字
      const path = []
      for (const p of validPoints) {
        const lon = Number(p.longitude)
        const lat = Number(p.latitude)
        if (isValidCoordinate(lon, lat)) {
          path.push([lon, lat])
        }
      }
      
      if (path.length < 2) {
        failCount++
        return
      }
      
      // 绘制管线
      const polyline = new AMap.Polyline({
        path: path,
        strokeColor: '#3366FF',
        strokeOpacity: 0.8,
        strokeWeight: 3,
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 10
      })
      
      mapInstance.add(polyline)
      successCount++
      
      // 在起点和终点添加标记
      const startPoint = validPoints[0]
      const endPoint = validPoints[validPoints.length - 1]
      
      // 起点标记
      const startLon = Number(startPoint.longitude)
      const startLat = Number(startPoint.latitude)
      if (isValidCoordinate(startLon, startLat)) {
        try {
          const startMarker = new AMap.Marker({
            position: [startLon, startLat],
            title: `管线${lineId}-起点`,
            icon: new AMap.Icon({
              size: new AMap.Size(20, 20),
              image: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMTAiIGN5PSIxMCIgcj0iOCIgZmlsbD0iIzMzNjZGRiIvPjwvc3ZnPg==',
              imageSize: new AMap.Size(20, 20)
            }),
            map: mapInstance
          })
          
          pointMarkers.value.push(startMarker)
          
          startMarker.on('click', () => {
            selectPoint(startPoint, 'start')
          })
        } catch (error) {
          // 忽略标记创建错误，继续处理
        }
      }
      
      // 终点标记（只在起点和终点不同时创建）
      if (startPoint.id !== endPoint.id) {
        const endLon = Number(endPoint.longitude)
        const endLat = Number(endPoint.latitude)
        if (isValidCoordinate(endLon, endLat)) {
          try {
            const endMarker = new AMap.Marker({
              position: [endLon, endLat],
              title: `管线${lineId}-终点`,
              icon: new AMap.Icon({
                size: new AMap.Size(20, 20),
                image: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMTAiIGN5PSIxMCIgcj0iOCIgZmlsbD0iI0ZGNjAwMCIvPjwvc3ZnPg==',
                imageSize: new AMap.Size(20, 20)
              }),
              map: mapInstance
            })
            
            pointMarkers.value.push(endMarker)
            
            endMarker.on('click', () => {
              selectPoint(endPoint, 'end')
            })
          } catch (error) {
            // 忽略标记创建错误
          }
        }
      }
    } catch (error) {
      failCount++
      // 静默处理错误，避免控制台刷屏
    }
  })
  
  console.log(`管线绘制完成: 成功${successCount}条, 失败${failCount}条`)
}

// 选择起点或终点
function selectPoint(point, type) {
  // 清除之前的起点/终点标记
  if (type === 'start') {
    // 清除之前的起点标记
    markers.value = markers.value.filter(m => {
      const title = m.getTitle()
      if (title === '起点') {
        mapInstance.remove(m)
        return false
      }
      return true
    })
    selectedStartPoint.value = point
    currentLocation.value = { longitude: point.longitude, latitude: point.latitude }
  } else {
    // 清除之前的终点标记
    markers.value = markers.value.filter(m => {
      const title = m.getTitle()
      if (title === '终点') {
        mapInstance.remove(m)
        return false
      }
      return true
    })
    selectedEndPoint.value = point
  }
  
  // 高亮选中的点
  highlightPoint(point, type)
  
  // 如果起点和终点都选择了，计算路径
  if (selectedStartPoint.value && selectedEndPoint.value) {
    calculateRoute()
  }
}

// 高亮显示选中的点
function highlightPoint(point, type) {
  if (!mapInstance || !AMap) {
    console.warn('地图未初始化，无法高亮点')
    return
  }
  
  if (!isValidCoordinate(point.longitude, point.latitude)) {
    console.warn('点坐标无效，无法高亮:', point)
    return
  }
  
  try {
    const color = type === 'start' ? '#00FF00' : '#FF0000'
    const marker = new AMap.Marker({
      position: [point.longitude, point.latitude],
      title: type === 'start' ? '起点' : '终点',
      icon: new AMap.Icon({
        size: new AMap.Size(30, 30),
        image: `data:image/svg+xml;base64,${btoa(`<svg width="30" height="30" xmlns="http://www.w3.org/2000/svg"><circle cx="15" cy="15" r="12" fill="${color}" stroke="white" stroke-width="2"/></svg>`)}`,
        imageSize: new AMap.Size(30, 30)
      }),
      zIndex: 100,
      map: mapInstance
    })
    
    markers.value.push(marker)
  } catch (error) {
    console.error('高亮点失败:', error)
  }
}

function togglePanel() {
  showPanel.value = !showPanel.value
}

function closePanel() {
  showPanel.value = false
}

function locateMe() {
  if (!mapInstance || !AMap) {
    console.warn('地图未初始化')
    return
  }
  
  // 使用浏览器定位API
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lon = position.coords.longitude
        const lat = position.coords.latitude
        
        if (isValidCoordinate(lon, lat)) {
          currentLocation.value = { longitude: lon, latitude: lat }
          try {
            mapInstance.setCenter([lon, lat])
            mapInstance.setZoom(15)
          } catch (error) {
            console.error('设置地图中心失败:', error)
          }
        } else {
          console.warn('定位返回的坐标无效:', lon, lat)
          // 使用第一个有效管线点
          useFirstValidPoint()
        }
      },
      (error) => {
        console.warn('定位失败:', error)
        // 定位失败，使用第一个有效管线点
        useFirstValidPoint()
      }
    )
  } else {
    console.warn('浏览器不支持定位')
    useFirstValidPoint()
  }
}

// 使用第一个有效管线点作为中心
function useFirstValidPoint() {
  if (!mapInstance || !AMap) return
  
  if (polyLinePoints.value.length > 0) {
    const firstValidPoint = polyLinePoints.value.find(p => 
      isValidCoordinate(p.longitude, p.latitude)
    )
    if (firstValidPoint) {
      currentLocation.value = {
        longitude: firstValidPoint.longitude,
        latitude: firstValidPoint.latitude
      }
      try {
        mapInstance.setCenter([firstValidPoint.longitude, firstValidPoint.latitude])
        mapInstance.setZoom(15)
      } catch (error) {
        console.error('设置地图中心失败:', error)
      }
    }
  }
}

// 计算两点间距离（米）
function calculateDistance(lon1, lat1, lon2, lat2) {
  const R = 6378137 // 地球半径（米）
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
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
      
      // 检查端点是否接近
      const dist1 = calculateDistance(ep1.start.lon, ep1.start.lat, ep2.start.lon, ep2.start.lat)
      const dist2 = calculateDistance(ep1.start.lon, ep1.start.lat, ep2.end.lon, ep2.end.lat)
      const dist3 = calculateDistance(ep1.end.lon, ep1.end.lat, ep2.start.lon, ep2.start.lat)
      const dist4 = calculateDistance(ep1.end.lon, ep1.end.lat, ep2.end.lon, ep2.end.lat)
      
      if (dist1 < connectionThreshold || dist2 < connectionThreshold ||
          dist3 < connectionThreshold || dist4 < connectionThreshold) {
        if (!polyLineConnections.value[lineId1].includes(lineId2)) {
          polyLineConnections.value[lineId1].push(lineId2)
        }
        if (!polyLineConnections.value[lineId2].includes(lineId1)) {
          polyLineConnections.value[lineId2].push(lineId1)
        }
      }
    }
  }
  
  console.log('管线连接关系构建完成')
}

// 计算管线的长度
function calculatePolyLineLength(lineId) {
  const points = polyLines.value[lineId]
  if (!points || points.length < 2) return 0
  
  let length = 0
  for (let i = 0; i < points.length - 1; i++) {
    length += calculateDistance(
      points[i].longitude, points[i].latitude,
      points[i + 1].longitude, points[i + 1].latitude
    )
  }
  return length
}

// Dijkstra算法计算最短路径
function dijkstraShortestPath(startLineId, endLineId) {
  const INF = 1e10
  const lineIds = Object.keys(polyLines.value)
  const n = lineIds.length
  
  // 构建距离矩阵
  const dist = {}
  const prev = {}
  const visited = {}
  
  lineIds.forEach(id => {
    dist[id] = INF
    prev[id] = null
    visited[id] = false
  })
  
  dist[startLineId] = 0
  
  // 主循环
  for (let i = 0; i < n; i++) {
    // 找到未访问的距离最小的节点
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
    
    // 更新邻居节点
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
  
  // 重建路径
  const path = []
  let current = endLineId
  while (current !== null) {
    path.unshift(current)
    current = prev[current]
  }
  
  return {
    path: path,
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
      const dist = calculateDistance(
        ep1.longitude, ep1.latitude,
        ep2.longitude, ep2.latitude
      )
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

// 计算路径（沿着管线网络）
function calculateRoute() {
  if (!selectedStartPoint.value || !selectedEndPoint.value) return
  
  const start = selectedStartPoint.value
  const end = selectedEndPoint.value
  
  let path = []
  let distance = 0
  
  // 如果起点和终点在同一条管线
  if (start.polyLineId === end.polyLineId) {
    path = getPointsOnLine(start.polyLineId, start, end)
    
    // 计算总距离
    for (let i = 0; i < path.length - 1; i++) {
      distance += calculateDistance(
        path[i].longitude, path[i].latitude,
        path[i + 1].longitude, path[i + 1].latitude
      )
    }
  } else {
    // 不同管线，使用Dijkstra算法找最短路径
    const result = dijkstraShortestPath(start.polyLineId, end.polyLineId)
    
    if (result.distance === null || result.path.length === 0) {
      // 如果找不到路径，使用直线距离
      console.warn('无法找到管线路径，使用直线距离')
      path = [
        { longitude: start.longitude, latitude: start.latitude },
        { longitude: end.longitude, latitude: end.latitude }
      ]
      distance = calculateDistance(
        start.longitude, start.latitude,
        end.longitude, end.latitude
      )
    } else {
      // 沿着路径收集所有点
      path = []
      
      // 1. 从起点到起点所在管线的端点
      const startLinePoints = polyLines.value[start.polyLineId]
      const startIndex = startLinePoints.findIndex(p => p.id === start.id)
      
      if (startIndex >= 0) {
        // 找到与下一条管线的连接点
        const nextLineId = result.path.length > 1 ? result.path[1] : end.polyLineId
        const connection = findConnectionPoint(start.polyLineId, nextLineId)
        
        if (connection) {
          // 确定从起点到连接点的方向
          const connectionPoint = connection.point1
          const connectionIndex = startLinePoints.findIndex(p => 
            p.id === connectionPoint.id
          )
          
          if (connectionIndex >= 0) {
            // 从起点到连接点
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
          // 如果找不到连接点，走到最近的端点
          const distToStart = calculateDistance(
            start.longitude, start.latitude,
            startLinePoints[0].longitude, startLinePoints[0].latitude
          )
          const distToEnd = calculateDistance(
            start.longitude, start.latitude,
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
      
      // 2. 沿着路径中的每条中间管线
      for (let i = 1; i < result.path.length - 1; i++) {
        const lineId = result.path[i]
        const linePoints = polyLines.value[lineId]
        
        if (linePoints && linePoints.length > 0) {
          // 找到与前后管线的连接点
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
              // 沿着管线从prevPoint到nextPoint
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
            // 如果找不到连接点，添加整条管线
            linePoints.forEach(p => {
              path.push({
                longitude: p.longitude,
                latitude: p.latitude
              })
            })
          }
        }
      }
      
      // 3. 从终点所在管线的端点到终点
      const endLinePoints = polyLines.value[end.polyLineId]
      const endIndex = endLinePoints.findIndex(p => p.id === end.id)
      
      if (endIndex >= 0 && result.path.length > 1) {
        // 找到与上一条管线的连接点
        const prevLineId = result.path[result.path.length - 2]
        const connection = findConnectionPoint(prevLineId, end.polyLineId)
        
        if (connection) {
          const connectionPoint = connection.point2
          const connectionIndex = endLinePoints.findIndex(p => 
            p.id === connectionPoint.id
          )
          
          if (connectionIndex >= 0) {
            // 从连接点到终点
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
          // 如果找不到连接点，从最近的端点到终点
          const distToStart = calculateDistance(
            end.longitude, end.latitude,
            endLinePoints[0].longitude, endLinePoints[0].latitude
          )
          const distToEnd = calculateDistance(
            end.longitude, end.latitude,
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
      
      // 计算总距离
      for (let i = 0; i < path.length - 1; i++) {
        distance += calculateDistance(
          path[i].longitude, path[i].latitude,
          path[i + 1].longitude, path[i + 1].latitude
        )
      }
    }
  }
  
  navigationResult.value = {
    path: path,
    distance: distance,
    distanceStr: distance < 2000 ? `${distance.toFixed(2)}m` : `${(distance / 1000).toFixed(2)}km`,
    pathPointCount: path.length
  }
  
  // 绘制路线
  drawRoute(path)
}

// 绘制导航路线
function drawRoute(path) {
  if (!mapInstance || !AMap) {
    console.warn('地图未初始化，无法绘制路线')
    return
  }
  
  // 过滤有效坐标
  const validPath = path.filter(p => 
    isValidCoordinate(p.longitude, p.latitude)
  )
  
  if (validPath.length < 2) {
    console.warn('有效路径点不足，无法绘制路线')
    return
  }
  
  // 清除之前的路线
  if (routeLine.value) {
    try {
      mapInstance.remove(routeLine.value)
    } catch (e) {
      console.warn('移除旧路线失败:', e)
    }
  }
  
  try {
    // 绘制新路线
    const routePath = validPath.map(p => [p.longitude, p.latitude])
    routeLine.value = new AMap.Polyline({
      path: routePath,
      isOutline: true,
      outlineColor: '#ffeeff',
      borderWeight: 3,
      strokeColor: '#FF6600',
      strokeOpacity: 1,
      strokeWeight: 6,
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 50
    })
    
    mapInstance.add(routeLine.value)
    mapInstance.setFitView([routeLine.value])
  } catch (error) {
    console.error('绘制路线失败:', error)
  }
}

async function startNavigation() {
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

.location-info {
  display: flex;
  gap: 15px;
  font-size: 12px;
  color: #666;
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

.point-count {
  margin-top: 10px;
  font-size: 14px;
}

.well-select {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
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

