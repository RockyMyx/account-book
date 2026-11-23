<script setup lang="ts">
// 底部导航（5 tab）：明细 / 统计 | 中央记一笔 | 报表 / 家庭
const tabs = [
  { name: 'home', path: '/', label: '明细', icon: 'notes-o' },
  { name: 'stats', path: '/stats', label: '统计', icon: 'bar-chart-o' },
  { name: 'reports', path: '/reports', label: '报表', icon: 'balance-list-o' },
  { name: 'family', path: '/family', label: '家庭', icon: 'friends-o' },
]
</script>

<template>
  <router-view />
  <!-- 记一笔用中央凸起大按钮（记账 App 范式），不走 van-tabbar 的普通 icon 位 -->
  <van-tabbar route safe-area-inset-bottom>
    <van-tabbar-item
      v-for="t in tabs.slice(0, 2)"
      :key="t.name"
      :to="t.path"
      :icon="t.icon"
    >
      {{ t.label }}
    </van-tabbar-item>
    <van-tabbar-item class="ab-add-btn" @click="$router.push('/add')">
      <template #icon>
        <div class="ab-add-circle">＋</div>
      </template>
      记一笔
    </van-tabbar-item>
    <van-tabbar-item
      v-for="t in tabs.slice(2)"
      :key="t.name"
      :to="t.path"
      :icon="t.icon"
    >
      {{ t.label }}
    </van-tabbar-item>
  </van-tabbar>
</template>

<style scoped>
.ab-add-circle {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1677ff, #0958d9);
  color: #fff;
  font-size: 24px;
  line-height: 44px;
  text-align: center;
  margin-top: -18px;
  box-shadow: 0 4px 12px rgba(9, 88, 217, 0.35);
}
</style>
