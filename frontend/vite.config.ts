import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// 说明：不用 unplugin 按需导入 vant——按需样式发现会触发 vite 二次依赖优化，
// 其临时目录清理在受控沙箱下会被批量删除保护拦截。改为 main.ts 整包注册，
// 生产构建仍可 tree-shake（vant sideEffects: false），只是开发期预打包稍大。
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // 开发环境代理到本地 API，避免 CORS；生产由后端直接托管静态资源
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
