<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import api from '../api'

// 统计页：趋势折线 + 分类环形图（刚性/弹性双视角）+ 排行 + 成员对比 + 健康指标
const month = ref(new Date().toISOString().slice(0, 7))
const summary = ref<any>(null)
const bs = ref<any>(null)
const catRows = ref<any[]>([])
const memberRows = ref<any[]>([])
const trendRows = ref<any[]>([])

onMounted(load)
async function load() {
  const [s, b, l, t] = await Promise.all([
    api.get('/transactions/summary', { params: { month: month.value } }),
    api.get('/reports/balance-sheet'),
    api.get('/transactions', { params: { month: month.value, pageSize: 500 } }),
    api.get('/transactions/trend?months=6'),
  ])
  summary.value = s.data
  bs.value = b.data
  trendRows.value = t.data.months || []
  const items: any[] = []
  Object.values(l.data.byDay || {}).forEach((arr: any) => items.push(...arr))
  const byCat = new Map<string, { value: number; tag: string }>()
  const byMember = new Map<string, number>()
  for (const it of items) {
    if (it.type === 'income' || it.type === 'invest_income') continue
    const cname = it.category?.name || '未分类'
    const cur = byCat.get(cname) || { value: 0, tag: it.category?.tag || 'flexible' }
    cur.value += it.amount
    byCat.set(cname, cur)
    byMember.set(it.member?.name || '未知', (byMember.get(it.member?.name || '未知') || 0) + it.amount)
  }
  catRows.value = [...byCat.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b2) => b2.value - a.value)
  memberRows.value = [...byMember.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b2) => b2.value - a.value)
}

function fmt(n: number) {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
function rate(n: number, d: number) {
  if (!d) return '—'
  return ((n / d) * 100).toFixed(1) + '%'
}

// ---------- 趋势折线图（Canvas 自绘） ----------
const trendCanvas = ref<HTMLCanvasElement>()
function drawTrend() {
  const cv = trendCanvas.value
  if (!cv || !trendRows.value.length) return
  const dpr = window.devicePixelRatio || 1
  const W = cv.clientWidth || 320
  const H = 160
  cv.width = W * dpr
  cv.height = H * dpr
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, W, H)

  const data = trendRows.value
  const max = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 1)
  const padL = 8, padR = 8, padT = 14, padB = 22
  const cw = (W - padL - padR) / data.length
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB)

  // 网格线
  ctx.strokeStyle = '#e5e6eb'
  ctx.lineWidth = 0.5
  for (let i = 0; i <= 2; i++) {
    const gy = padT + (i / 2) * (H - padT - padB)
    ctx.beginPath()
    ctx.moveTo(padL, gy)
    ctx.lineTo(W - padR, gy)
    ctx.stroke()
  }

  // 两条折线
  const drawLine = (key: 'income' | 'expense', color: string, fill?: string) => {
    ctx.beginPath()
    data.forEach((d, i) => {
      const x = padL + cw * i + cw / 2
      i === 0 ? ctx.moveTo(x, y(d[key])) : ctx.lineTo(x, y(d[key]))
    })
    if (fill) {
      ctx.save()
      ctx.lineTo(padL + cw * (data.length - 1) + cw / 2, H - padB)
      ctx.lineTo(padL + cw / 2, H - padB)
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
      ctx.restore()
      ctx.beginPath()
      data.forEach((d, i) => {
        const x = padL + cw * i + cw / 2
        i === 0 ? ctx.moveTo(x, y(d[key])) : ctx.lineTo(x, y(d[key]))
      })
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.stroke()
    // 数据点
    data.forEach((d, i) => {
      const x = padL + cw * i + cw / 2
      ctx.beginPath()
      ctx.arc(x, y(d[key]), 2.5, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    })
  }
  drawLine('income', '#e5484d', 'rgba(229,72,77,0.06)')
  drawLine('expense', '#1677ff', 'rgba(22,119,255,0.06)')

  // 月份标签
  ctx.fillStyle = '#86909c'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  data.forEach((d, i) => {
    const x = padL + cw * i + cw / 2
    ctx.fillText(d.month.slice(5) + '月', x, H - 6)
  })
}
watch(trendRows, () => setTimeout(drawTrend, 50))

// ---------- 分类环形图 ----------
const pieMode = ref<'cat' | 'tag'>('cat') // cat 分类视角 / tag 刚性弹性视角
const pieColors = ['#1677ff', '#4096ff', '#69b1ff', '#91caff', '#bae0ff', '#00a870', '#36cfc9', '#ff9a2e', '#ffc069', '#e5484d']
const pieData = computed(() => {
  if (pieMode.value === 'tag') {
    const rigid = catRows.value.filter((r) => r.tag === 'rigid' || r.tag === 'earmark').reduce((s, r) => s + r.value, 0)
    const flexible = catRows.value.filter((r) => r.tag === 'flexible').reduce((s, r) => s + r.value, 0)
    return [
      { name: '刚性支出', value: rigid },
      { name: '弹性支出', value: flexible },
    ].filter((x) => x.value > 0)
  }
  return catRows.value.slice(0, 8).map((r) => ({ name: r.name, value: r.value }))
})
const pieTotal = computed(() => pieData.value.reduce((s, x) => s + x.value, 0))
const pieCanvas = ref<HTMLCanvasElement>()
function drawPie() {
  const cv = pieCanvas.value
  if (!cv || !pieData.value.length) return
  const dpr = window.devicePixelRatio || 1
  const size = 150
  cv.width = size * dpr
  cv.height = size * dpr
  cv.style.width = size + 'px'
  cv.style.height = size + 'px'
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, size, size)
  const cx = size / 2, cy = size / 2, R = 66, r = 42
  let angle = -Math.PI / 2
  pieData.value.forEach((d, i) => {
    const a2 = angle + (d.value / pieTotal.value) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(cx, cy, R, angle, a2)
    ctx.arc(cx, cy, r, a2, angle, true)
    ctx.closePath()
    ctx.fillStyle = pieColors[i % pieColors.length]
    ctx.fill()
    angle = a2
  })
  // 中心总数
  ctx.fillStyle = '#1f2329'
  ctx.font = '600 15px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(fmt(pieTotal.value), cx, cy - 6)
  ctx.fillStyle = '#86909c'
  ctx.font = '10px sans-serif'
  ctx.fillText('总支出', cx, cy + 12)
}
watch([pieData, pieMode], () => setTimeout(drawPie, 50), { deep: true })

const catMax = computed(() => Math.max(...catRows.value.map((r) => r.value), 1))

// ---------- 健康指标 ----------
const health = computed(() => {
  const s = summary.value
  const b = bs.value
  if (!s || !b) return []
  const liquid = b.currentAssets?.total + b.financialAssets?.total || 0
  const monthlyRigid = s.rigidExpense || 0
  return [
    { name: '结余率', value: rate(s.balance, s.totalIncome), ref: '≥ 20% 健康', ok: s.totalIncome > 0 && s.balance / s.totalIncome >= 0.2 },
    { name: '负债率', value: rate(b.liabilities?.total, b.totalAssets), ref: '< 50% 为宜', ok: b.totalAssets > 0 && b.liabilities?.total / b.totalAssets < 0.5 },
    { name: '应急覆盖', value: monthlyRigid > 0 ? (liquid / monthlyRigid).toFixed(1) + ' 个月' : '—', ref: '3~6 个月', ok: monthlyRigid > 0 && liquid / monthlyRigid >= 3 },
    { name: '资产配置', value: `流动 ${rate(b.currentAssets?.total, b.totalAssets)} · 金融 ${rate(b.financialAssets?.total, b.totalAssets)} · 固定 ${rate(b.fixedAssets?.total, b.totalAssets)}`, ref: '展示参考', ok: true },
  ]
})
</script>

<template>
  <div class="stats-page">
    <div class="ab-card month-bar">
      <van-field v-model="month" label="月份" placeholder="YYYY-MM" @blur="load" />
    </div>

    <!-- 收支趋势（近6月） -->
    <div class="ab-card">
      <div class="card-head">
        <h4>收支趋势</h4>
        <span class="legend">
          <i class="dot in" />收入
          <i class="dot out" />支出
        </span>
      </div>
      <canvas ref="trendCanvas" class="trend-canvas" />
      <div v-if="trendRows.length" class="trend-summary">
        <div>
          <div class="lbl">近6月收入</div>
          <div class="v ab-num ab-in">{{ fmt(trendRows.reduce((s, d) => s + d.income, 0)) }}</div>
        </div>
        <div>
          <div class="lbl">近6月支出</div>
          <div class="v ab-num ab-out">{{ fmt(trendRows.reduce((s, d) => s + d.expense, 0)) }}</div>
        </div>
        <div>
          <div class="lbl">累计结余</div>
          <div class="v ab-num ab-balance">{{ fmt(trendRows.reduce((s, d) => s + d.balance, 0)) }}</div>
        </div>
      </div>
    </div>

    <!-- 分类占比（环形图 + 排行） -->
    <div class="ab-card">
      <div class="card-head">
        <h4>支出构成 · {{ month }}</h4>
        <van-tabs v-model:active="pieMode" type="card" class="mini-tabs">
          <van-tab name="cat" title="分类" />
          <van-tab name="tag" title="刚性/弹性" />
        </van-tabs>
      </div>
      <div v-if="!pieTotal" class="empty">本月暂无支出</div>
      <div v-else class="pie-area">
        <canvas ref="pieCanvas" />
        <div class="pie-legend">
          <div v-for="(d, i) in pieData" :key="d.name" class="lg-row">
            <i class="dot" :style="{ background: pieColors[i % pieColors.length] }" />
            <span class="lg-name">{{ d.name }}</span>
            <span class="lg-pct ab-num">{{ rate(d.value, pieTotal) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 分类排行 -->
    <div class="ab-card" v-if="catRows.length">
      <h4>支出排行</h4>
      <div v-for="r in catRows.slice(0, 8)" :key="r.name" class="bar-row">
        <span class="bar-name">{{ r.name }}</span>
        <div class="bar-track">
          <div class="bar-fill" :style="{ width: (r.value / catMax) * 100 + '%' }" />
        </div>
        <span class="bar-val ab-num">{{ fmt(r.value) }}</span>
      </div>
    </div>

    <!-- 成员对比 -->
    <div class="ab-card" v-if="memberRows.length > 1">
      <h4>成员支出对比</h4>
      <div v-for="r in memberRows" :key="r.name" class="bar-row">
        <span class="bar-name">{{ r.name }}</span>
        <div class="bar-track">
          <div class="bar-fill" :style="{ width: (r.value / memberRows[0].value) * 100 + '%' }" />
        </div>
        <span class="bar-val ab-num">{{ fmt(r.value) }}</span>
      </div>
    </div>

    <!-- 健康指标 -->
    <div class="ab-card">
      <h4>财务健康指标</h4>
      <div v-for="h in health" :key="h.name" class="h-row">
        <div class="h-main">
          <div class="h-name">
            {{ h.name }}
            <van-tag :type="h.ok ? 'success' : 'warning'" plain size="medium">{{ h.ok ? '正常' : '关注' }}</van-tag>
          </div>
          <div class="h-val ab-num">{{ h.value }}</div>
        </div>
        <div class="h-ref">参考线：{{ h.ref }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.month-bar {
  padding: 0;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
h4 {
  margin: 0;
}
.legend {
  font-size: 11px;
  color: var(--ab-text-3);
  display: flex;
  align-items: center;
  gap: 4px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: inline-block;
}
.dot.in {
  background: #e5484d;
}
.dot.out {
  background: #1677ff;
  margin-left: 6px;
}
.trend-canvas {
  width: 100%;
  height: 160px;
}
.trend-summary {
  display: flex;
  justify-content: space-around;
  border-top: 1px solid var(--ab-border);
  padding-top: 10px;
  margin-top: 6px;
  text-align: center;
}
.trend-summary .lbl {
  font-size: 11px;
  color: var(--ab-text-3);
}
.trend-summary .v {
  font-size: 15px;
  margin-top: 2px;
}
.mini-tabs {
  width: auto;
}
.mini-tabs :deep(.van-tab) {
  padding: 0 10px;
  font-size: 11px;
}
.pie-area {
  display: flex;
  align-items: center;
  gap: 14px;
}
.pie-legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lg-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.lg-name {
  flex: 1;
  color: var(--ab-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lg-pct {
  color: #1f2329;
}
.empty {
  color: var(--ab-text-3);
  font-size: 13px;
  padding: 12px 0;
  text-align: center;
}
.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}
.bar-name {
  width: 80px;
  font-size: 13px;
  color: var(--ab-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar-track {
  flex: 1;
  height: 10px;
  background: var(--ab-bg);
  border-radius: 5px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 5px;
  background: linear-gradient(90deg, #1677ff, #4096ff);
}
.bar-val {
  width: 76px;
  text-align: right;
  font-size: 13px;
}
.h-row {
  padding: 8px 0;
  border-bottom: 1px dashed var(--ab-border);
}
.h-row:last-child {
  border-bottom: none;
}
.h-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.h-name {
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.h-val {
  font-size: 14px;
}
.h-ref {
  font-size: 12px;
  color: var(--ab-text-3);
  margin-top: 2px;
}
</style>
