import { createRouter, createWebHistory } from 'vue-router'
import MapView from '../views/MapView.vue'
import CesiumMapView from '../views/CesiumMapView.vue'

const routes = [
  {
    path: '/',
    name: 'MapView',
    component: MapView
  },
  {
    path: '/cesium',
    name: 'CesiumMapView',
    component: CesiumMapView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router

