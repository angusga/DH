<template>
  <div id="app">
    <header class="app-header">
      <div class="app-title">井位地图导航系统</div>
      <nav class="nav-links">
        <router-link to="/" class="nav-link" active-class="active-link" exact>高德地图</router-link>
        <router-link to="/cesium" class="nav-link" active-class="active-link">Cesium 演示</router-link>
      </nav>
    </header>
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  width: 100%;
  height: 100vh;
  font-family: 'Microsoft YaHei', Arial, sans-serif;
  display: flex;
  flex-direction: column;
}

.app-header {
  height: 48px;
  padding: 0 16px;
  background: #001529;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.app-title {
  font-size: 16px;
  font-weight: 500;
}

.nav-links {
  display: flex;
  gap: 12px;
}

.nav-link {
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  font-size: 14px;
}

.nav-link:hover {
  color: #fff;
}

.active-link {
  color: #40a9ff;
}

.app-main {
  flex: 1;
}
</style>

