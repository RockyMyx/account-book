import axios from 'axios'

// API 客户端：自动携带设备令牌；开发环境走 vite 代理 /api → 3001
const api = axios.create({
  baseURL: import.meta.env.DEV ? '/api' : '/api',
  timeout: 15000,
})

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('ab_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// 401 = 令牌失效（被撤销/过期/成员被移除）→ 回绑定页
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ab_token')
      localStorage.removeItem('ab_member')
      window.location.href = '/bind'
    }
    return Promise.reject(err)
  },
)

export default api
