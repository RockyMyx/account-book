import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/Home.vue') },
    { path: '/add', name: 'add', component: () => import('../views/AddTx.vue') },
    { path: '/reports', name: 'reports', component: () => import('../views/Reports.vue') },
    { path: '/stats', name: 'stats', component: () => import('../views/Stats.vue') },
    { path: '/family', name: 'family', component: () => import('../views/Family.vue') },
    { path: '/categories', name: 'categories', component: () => import('../views/Categories.vue') },
    { path: '/bind', name: 'bind', component: () => import('../views/Bind.vue') },
  ],
})

// 全局路由守卫：未绑定设备（无令牌）一律去绑定页
router.beforeEach((to) => {
  const token = localStorage.getItem('ab_token')
  if (!token && to.name !== 'bind') return { name: 'bind' }
  if (token && to.name === 'bind') return { name: 'home' }
})

export default router
