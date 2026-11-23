<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { showToast } from 'vant'
import api from '../api'
import VoiceInput from '../components/VoiceInput.vue'

// 明细首页：顶部月度汇总卡 + 按日分组的流水列表 + 语音记账入口
const month = ref(new Date().toISOString().slice(0, 7))
const summary = ref<any>(null)
const byDay = ref<Record<string, any[]>>({})
const total = ref(0)
const loading = ref(false)
const showPicker = ref(false)
const showVoice = ref(false)

// 月份选择器：近 24 个月
const monthColumns = computed(() => {
  const arr: string[] = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return arr
})

async function load() {
  loading.value = true
  try {
    const [s, l] = await Promise.all([
      api.get('/transactions/summary', { params: { month: month.value } }),
      api.get('/transactions', { params: { month: month.value } }),
    ])
    summary.value = s.data
    byDay.value = l.data.byDay
    total.value = l.data.total
  } finally {
    loading.value = false
  }
}
onMounted(load)

const days = computed(() => Object.keys(byDay.value).sort().reverse())

function dayOut(d: string) {
  return byDay.value[d]
    ?.filter((t) => t.type !== 'income' && t.type !== 'invest_income')
    .reduce((s, t) => s + t.amount, 0) ?? 0
}
function dayIn(d: string) {
  return byDay.value[d]
    ?.filter((t) => t.type === 'income' || t.type === 'invest_income')
    .reduce((s, t) => s + t.amount, 0) ?? 0
}
function fmt(n: number) {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function weekday(d: string) {
  return '周' + '日一二三四五六'[new Date(d + 'T00:00:00').getDay()]
}

async function delTx(id: string) {
  try {
    await api.delete(`/transactions/${id}`)
    await load()
  } catch (e: any) {
    showToast(e.response?.data?.message || '删除失败')
  }
}
</script>

<template>
  <div class="home">
    <!-- 月度汇总卡（Excel 利润表口径） -->
    <div class="ab-hero">
      <div class="hero-month" @click="showPicker = true">
        {{ month }} <van-icon name="arrow-down" />
      </div>
      <div class="hero-balance">
        <div class="lbl">本月结余</div>
        <div class="val ab-num">{{ fmt(summary?.balance ?? 0) }}</div>
      </div>
      <div class="hero-row">
        <div>
          <div class="lbl">收入 {{ summary?.totalIncome ? (summary.totalIncome > 0 ? (summary.fixedIncome / summary.totalIncome * 100).toFixed(0) + '%固定' : '') : '' }}</div>
          <div class="v ab-num">{{ fmt(summary?.totalIncome ?? 0) }}</div>
        </div>
        <div>
          <div class="lbl">支出</div>
          <div class="v ab-num">{{ fmt(summary?.totalExpense ?? 0) }}</div>
        </div>
        <div>
          <div class="lbl">备用金计提</div>
          <div class="v ab-num">{{ fmt(summary?.earmark ?? 0) }}</div>
        </div>
      </div>
    </div>

    <!-- 流水列表（按日分组） -->
    <van-empty v-if="!loading && total === 0" description="本月还没有记账" />
    <div v-for="d in days" :key="d" class="day-group">
      <div class="day-head">
        <span>{{ d.slice(5) }}日 · {{ weekday(d) }}</span>
        <span class="day-sum">
          <span v-if="dayIn(d)" class="ab-in">+{{ fmt(dayIn(d)) }}</span>
          <span v-if="dayOut(d)" class="ab-out" style="margin-left: 8px">−{{ fmt(dayOut(d)) }}</span>
        </span>
      </div>
      <van-swipe-cell v-for="t in byDay[d]" :key="t.id">
        <div class="tx-row">
          <div class="tx-icon" :class="t.type === 'income' || t.type === 'invest_income' ? 'in' : 'out'">
            <van-icon :name="t.category?.icon || 'bill-o'" />
          </div>
          <div class="tx-main">
            <div class="tx-name">
              {{ t.category?.name }}
              <van-tag v-if="t.source === 'voice'" size="medium" plain type="primary">语音</van-tag>
            </div>
            <div class="tx-sub">
              {{ t.member?.name }}<template v-if="t.note"> · {{ t.note }}</template>
            </div>
          </div>
          <div class="tx-amt ab-num" :class="t.type === 'income' || t.type === 'invest_income' ? 'ab-in' : 'ab-out'">
            {{ t.type === 'income' || t.type === 'invest_income' ? '+' : '−' }}{{ fmt(t.amount) }}
          </div>
        </div>
        <template #right>
          <van-button square type="danger" text="删除" class="del-btn" @click="delTx(t.id)" />
        </template>
      </van-swipe-cell>
    </div>

    <van-popup v-model:show="showPicker" position="bottom" round>
      <van-picker
        :columns="monthColumns.map((m) => ({ text: m, value: m }))"
        @confirm="(opt: any) => { month = opt.value || opt.text; showPicker = false; load() }"
        @cancel="showPicker = false"
      />
    </van-popup>

    <!-- 悬浮语音按钮（明细页快捷入口；中央＋号仍走手动记一笔） -->
    <div class="voice-fab" @click="showVoice = true">
      <van-icon name="volume-o" />
    </div>
    <VoiceInput v-model:show="showVoice" @saved="load" />
  </div>
</template>

<style scoped>
.hero-month {
  font-size: 13px;
  opacity: 0.9;
  cursor: pointer;
}
.hero-balance {
  margin: 8px 0 4px;
}
.hero-balance .val {
  font-size: 34px;
}
.hero-balance .lbl,
.hero-row .lbl {
  font-size: 12px;
  opacity: 0.85;
}
.hero-row {
  display: flex;
  gap: 24px;
  margin-top: 10px;
}
.hero-row .v {
  font-size: 16px;
}
.day-group {
  margin-bottom: 4px;
}
.day-head {
  display: flex;
  justify-content: space-between;
  padding: 10px 16px 4px;
  font-size: 12px;
  color: var(--ab-text-3);
}
.day-sum {
  font-size: 12px;
}
.tx-row {
  display: flex;
  align-items: center;
  background: #fff;
  padding: 10px 14px;
  border-bottom: 1px solid var(--ab-border);
}
.tx-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  margin-right: 10px;
}
.tx-icon.in {
  background: #ffece8;
  color: var(--ab-income);
}
.tx-icon.out {
  background: var(--ab-primary-light);
  color: var(--ab-primary);
}
.tx-main {
  flex: 1;
  min-width: 0;
}
.tx-name {
  font-size: 15px;
  color: #1f2329;
}
.tx-sub {
  font-size: 12px;
  color: var(--ab-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tx-amt {
  font-size: 16px;
}
.del-btn {
  height: 100%;
}
.voice-fab {
  position: fixed;
  right: 16px;
  bottom: 96px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1677ff, #0958d9);
  color: #fff;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 18px rgba(9, 88, 217, 0.4);
  z-index: 10;
  cursor: pointer;
}
</style>
