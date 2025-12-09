import request from './request'

/**
 * 计算导航路径
 */
export function calculateRoute(data) {
  return request({
    url: '/navigation/calculate',
    method: 'post',
    data
  })
}

/**
 * 获取所有油井
 */
export function getAllOilWells() {
  return request({
    url: '/oilwells/visible',
    method: 'get'
  })
}

