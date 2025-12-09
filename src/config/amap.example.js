/**
 * 高德地图配置示例文件
 * 复制此文件为 amap.js 并填入实际的配置信息
 */
export const amapConfig = {
  // 高德地图API Key
  // 申请地址：https://console.amap.com/dev/key/app
  key: '你的高德地图API_Key',
  
  // 安全密钥（securityJsCode）
  // 申请地址：https://console.amap.com/dev/key/app
  // 在高德开放平台 -> 应用管理 -> 我的应用 -> 安全密钥 中获取
  // 安全密钥用于防止API Key被恶意使用
  securityJsCode: '你的安全密钥',
  
  // SDK版本
  version: '2.0',
  
  // 需要加载的插件
  plugins: [
    'AMap.Geolocation',  // 定位
    'AMap.Marker',      // 点标记
    'AMap.Polyline',    // 折线
    'AMap.InfoWindow'   // 信息窗体
  ]
}

