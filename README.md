# 井位地图导航系统 - 前端

## 技术栈
- Vue 3
- Vue Router
- Pinia
- Axios
- 高德地图 Web SDK

## 安装依赖
```bash
npm install
```

## 开发运行
```bash
npm run dev
```

## 构建生产版本
```bash
npm run build
```

## 配置说明

### 1. 配置高德地图

1. 在高德开放平台申请API Key和安全密钥：
   - 访问：https://console.amap.com/dev/key/app
   - 创建应用，获取 API Key
   - 在应用设置中配置安全密钥（securityJsCode）

2. 配置项目：
   ```bash
   # 复制配置示例文件
   cp src/config/amap.example.js src/config/amap.js
   
   # 编辑 src/config/amap.js，填入你的 API Key 和安全密钥
   ```

3. 配置白名单（重要）：
   - 在高德开放平台 -> 应用管理 -> 我的应用 -> 安全密钥
   - 添加 Web 服务域名白名单（如：localhost、你的域名）

### 2. 后端服务配置

确保后端服务运行在 `http://localhost:8080`

### 3. 安全密钥说明

高德地图要求配置安全密钥（securityJsCode）来增强安全性：
- 防止 API Key 被恶意使用
- 需要在服务端配置域名白名单
- 安全密钥与 API Key 一一对应

