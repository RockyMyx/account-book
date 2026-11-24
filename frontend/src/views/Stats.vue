<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import api from '../api'

// 统计页四维度：总览 / 分类 / 成员 / 资产
const dims = ['总览', '分类', '成员', '资产']
const activeDim = ref(0)
const month = ref(new Date().toISOString().slice(0, 7))
const loading = ref(false)

const stats = ref<any>(null)
const summary = ref<any>(null)
const trendRows = ref<any[]>([])
const bs = ref<any>(null)
const valuations = ref<any[]>([])
const checks = ref<any[]>([])
const members = ref<any[]>([])

const PIE_COLORS = ['#1677ff', '#4096ff', '#69b1ff', '#91caff', '#bae0ff', '#00a870', '#36cfc9', '#ff9a2e', '#ffc069', '#e5484d']
const LIAB_COLORS = ['#e5484d', '#f09595']

onMounted(load)
watch(activeDim, () => nextTick(drawAll))

function shiftMonth(delta: number) {
  const [y, m] = month.value.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  month.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  load()
}

async function load() {
  loading.value = true
  try {
    const [st, su, tr, bal, val, rec, ov] = await Promise.all([
      api.get('/transactions/stats', { params: { month: month.value } }),
      api.get('/transactions/summary', { params: { month: month.value } }),
      api.get('/transactions/trend?months=6'),
      api.get('/reports/balance-sheet'),
      api.get('/valuations'),
      api.get('/reports/reconcile', { params: { month: month.value } }),
      api.get('/family/overview'),
    ])
    stats.value = st.data
    summary.value = su.data
    trendRows.value = tr.data.months || []
    bs.value = bal.data
    valuations.value = val.data.items || []
    checks.value = rec.data.checks || []
    members.value = ov.data.members || []
    await nextTick()
    drawAll()
  } finally {
    loading.value = false
  }
}

function fmt(n: number) {
  return (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
function fmtWan(n: number) {
  if (!n) return '0'
  return n >= 10000 ? (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + '万' : fmt(n)
}
function pct(n: number, d: number) {
  return d > 0 ? ((n / d) * 100).toFixed(1) + '%' : '—'
}
function pctWidth(n: number, d: number) {
  return d > 0 ? (n / d) * 100 + '%' : '0%'
}

// ---------- Canvas 绘制 ----------
const trendCanvas = ref<HTMLCanvasElement>()
const expensePie = ref<HTMLCanvasElement>()
const incomePie = ref<HTMLCanvasElement>()
const memberPie = ref<HTMLCanvasElement>()
const assetPie = ref<HTMLCanvasElement>()

function drawAll() {
  drawTrend()
  drawPie(expensePie.value, stats.value?.expenseByCategory || [], '总支出', stats.value?.totalExpense || 0)
  drawPie(incomePie.value, stats.value?.incomeByCategory || [], '总收入', stats.value?.totalIncome || 0)
  drawPie(memberPie.value, memberExpenseRows.value, '总支出', stats.value?.totalExpense || 0)
  drawAssetPie()
}

function setupCanvas(cv: HTMLCanvasElement, w: number, h: number) {
  const dpr = window.devicePixelRatio || 1
  cv.width = w * dpr
  cv.height = h * dpr
  cv.style.width = w + 'px'
  cv.style.height = h + 'px'
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)
  return ctx
}

function centerText(ctx: CanvasRenderingContext2D, cx: number, cy: number, label: string, value: string) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#86909c'
  ctx.font = '10px sans-serif'
  ctx.fillText(label, cx, cy - 8)
  ctx.fillStyle = '#1f2329'
  ctx.font = '600 12px sans-serif'
  ctx.fillText(value, cx, cy + 9)
}

function drawPie(cv: HTMLCanvasElement | undefined, rows: any[], label: string, total: number) {
  if (!cv) return
  const size = 122
  const ctx = setupCanvas(cv, size, size)
  const cx = size / 2, cy = size / 2, R = 54, r = 36
  if (!rows.length || !total) {
    ctx.beginPath()
    ctx.arc(cx, cy, (R + r) / 2, 0, Math.PI * 2)
    ctx.strokeStyle = '#eef0f3'
    ctx.lineWidth = R - r
    ctx.stroke()
    centerText(ctx, cx, cy, '暂无数据', '0')
    return
  }
  let angle = -Math.PI / 2
  rows.forEach((row, i) => {
    const a2 = angle + (row.value / total) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(cx, cy, R, angle, a2)
    ctx.arc(cx, cy, r, a2, angle, true)
    ctx.closePath()
    ctx.fillStyle = PIE_COLORS[i % PIE_COLORS.length]
    ctx.fill()
    angle = a2
  })
  centerText(ctx, cx, cy, label, fmt(total))
}

function drawAssetPie() {
  const cv = assetPie.value
  if (!cv) return
  const size = 122
  const ctx = setupCanvas(cv, size, size)
  const cx = size / 2, cy = size / 2, R = 54, r = 36
  const b = bs.value
  const rows = b ? [
    { name: '流动资产', value: b.currentAssets?.total || 0, color: PIE_COLORS[0] },
    { name: '金融资产', value: b.financialAssets?.total || 0, color: PIE_COLORS[2] },
    { name: '固定资产', value: b.fixedAssets?.total || 0, color: PIE_COLORS[4] },
    { name: '负债', value: b.liabilities?.total || 0, color: LIAB_COLORS[0] },
  ].filter((x) => x.value > 0) : []
  const total = rows.reduce((s, x) => s + x.value, 0)
  if (!rows.length) {
    ctx.beginPath()
    ctx.arc(cx, cy, (R + r) / 2, 0, Math.PI * 2)
    ctx.strokeStyle = '#eef0f3'
    ctx.lineWidth = R - r
    ctx.stroke()
    centerText(ctx, cx, cy, '暂无数据', '0')
    return
  }
  let angle = -Math.PI / 2
  rows.forEach((row) => {
    const a2 = angle + (row.value / total) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(cx, cy, R, angle, a2)
    ctx.arc(cx, cy, r, a2, angle, true)
    ctx.closePath()
    ctx.fillStyle = row.color
    ctx.fill()
    angle = a2
  })
  centerText(ctx, cx, cy, '净资产', fmtWan(b?.netWorth || 0))
}

function drawTrend() {
  const cv = trendCanvas.value
  if (!cv || !trendRows.value.length) return
  const W = cv.clientWidth || 320
  const H = 130
  const ctx = setupCanvas(cv, W, H)
  const data = trendRows.value
  const max = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 1)
  const padL = 10, padR = 10, padT = 12, padB = 22
  const cw = (W - padL - padR) / data.length
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB)
  ctx.strokeStyle = '#eef0f3'
  ctx.lineWidth = 0.5
  for (let i = 0; i <= 2; i++) {
    const gy = padT + (i / 2) * (H - padT - padB)
    ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke()
  }
  const line = (key: 'income' | 'expense', color: string) => {
    ctx.beginPath()
    data.forEach((d, i) => {
      const x = padL + cw * i + cw / 2
      i === 0 ? ctx.moveTo(x, y(d[key])) : ctx.lineTo(x, y(d[key]))
    })
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.stroke()
    data.forEach((d, i) => {
      const x = padL + cw * i + cw / 2
      ctx.beginPath(); ctx.arc(x, y(d[key]), 2.5, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
    })
  }
  line('income', '#e5484d')
  line('expense', '#1677ff')
  ctx.fillStyle = '#86909c'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  data.forEach((d, i) => {
    const x = padL + cw * i + cw / 2
    ctx.fillText(d.month.slice(5) + '月', x, H - 5)
  })
}

// ---------- 派生数据 ----------
// 明确类型的数组，避免 v-for 索引被推断成 string|number
type CatRow = { id: string; name: string; tag: string; icon: string | null; value: number; count: number }
const expenseRows = computed<CatRow[]>(() => (stats.value?.expenseByCategory as CatRow[]) || [])
const incomeRows = computed<CatRow[]>(() => (stats.value?.incomeByCategory as CatRow[]) || [])
type MemberExpenseRow = { id: string; name: string; value: number; count: number }
const memberExpenseRows = computed<MemberExpenseRow[]>(() =>
  ((stats.value?.byMember || []) as any[])
    .map((m): MemberExpenseRow => ({ id: m.id, name: m.name, value: m.expense, count: m.count }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value),
)
const maxMemberCount = computed(() => Math.max(...(stats.value?.byMember || []).map((m: any) => m.count), 1))
const maxMemberVal = computed(() => Math.max(...(stats.value?.byMember || []).flatMap((m: any) => [m.income, m.expense]), 1))
const maxValItem = computed(() => Math.max(...valuations.value.map((v: any) => v.value), 1))
const health = computed(() => {
  const s = summary.value, b = bs.value
  if (!s || !b) return []
  const liquid = (b.currentAssets?.total || 0) + (b.financialAssets?.total || 0)
  const rigid = s.rigidExpense || 0
  return [
    { name: '结余率', value: pct(s.balance, s.totalIncome), ok: s.totalIncome > 0 && s.balance / s.totalIncome >= 0.2 },
    { name: '负债率', value: pct(b.liabilities?.total, b.totalAssets), ok: b.totalAssets > 0 && b.liabilities.total / b.totalAssets < 0.5 },
    { name: '应急覆盖', value: rigid > 0 ? (liquid / rigid).toFixed(1) + ' 个月' : '—', ok: rigid > 0 && liquid / rigid >= 3 },
  ]
})
</script>

<template>
  <div class="stats-page">
    <!-- 月份翻页 -->
    <div class="month-bar">
      <button class="arw" @click="shiftMonth(-1)">‹</button>
      <span class="month-label">{{ month }}</span>
      <button class="arw" @click="shiftMonth(1)">›</button>
    </div>

    <!-- 维度切换 -->
    <div class="dim-tabs">
      <button
        v-for="(d, i) in dims" :key="d"
        :class="['dim', { on: activeDim === i }]"
        @click="activeDim = i"
      >{{ d }}</button>
    </div>

    <div v-if="loading" class="loading">加载中…</div>

    <!-- ========== ① 总览 ========== -->
    <div v-show="activeDim === 0 && !loading">
      <div class="ab-card trio">
        <div><div class="lbl">结余</div><div class="val ab-balance">{{ fmt(summary?.balance || 0) }}</div></div>
        <div><div class="lbl">总收入</div><div class="val ab-in">{{ fmt(summary?.totalIncome || 0) }}</div></div>
        <div><div class="lbl">总支出</div><div class="val" style="color: var(--ab-primary)">{{ fmt(summary?.totalExpense || 0) }}</div></div>
      </div>
      <div class="ab-card">
        <div class="card-head"><h4>月度收支趋势</h4><span class="legend"><span class="dot in"></span>收入<span class="dot out"></span>支出</span></div>
        <canvas ref="trendCanvas" class="trend-canvas" />
        <div v-if="trendRows.length" class="trend-sum">
          <div><div class="lbl">近6月收入</div><div class="v ab-in">{{ fmt(trendRows.reduce((s, d) => s + d.income, 0)) }}</div></div>
          <div><div class="lbl">近6月支出</div><div class="v" style="color: var(--ab-primary)">{{ fmt(trendRows.reduce((s, d) => s + d.expense, 0)) }}</div></div>
        </div>
      </div>
      <div class="ab-card">
        <div class="card-head"><h4>收入来源</h4><span class="sub">总收入 {{ fmt(stats?.totalIncome || 0) }} · {{ stats?.incomeByCategory?.length || 0 }}类</span></div>
        <template v-if="stats?.incomeByCategory?.length">
          <div v-for="r in stats.incomeByCategory.slice(0, 5)" :key="r.id" class="bar-row">
            <span class="bar-name">{{ r.name }}</span>
            <div class="bar-track"><div class="bar-fill in" :style="{ width: (r.value / stats.totalIncome) * 100 + '%' }" /></div>
            <span class="bar-val ab-num">{{ fmt(r.value) }}</span>
          </div>
        </template>
        <div v-else class="empty">本月暂无收入</div>
      </div>
      <div class="ab-card">
        <div class="card-head"><h4>支出分布</h4><span class="sub">总支出 {{ fmt(stats?.totalExpense || 0) }} · {{ stats?.txCount || 0 }}笔</span></div>
        <template v-if="stats?.expenseByCategory?.length">
          <div v-for="r in stats.expenseByCategory.slice(0, 5)" :key="r.id" class="bar-row">
            <span class="bar-name">{{ r.name }}</span>
            <div class="bar-track"><div class="bar-fill out" :style="{ width: (r.value / stats.totalExpense) * 100 + '%' }" /></div>
            <span class="bar-val ab-num">{{ fmt(r.value) }}</span>
          </div>
        </template>
        <div v-else class="empty">本月暂无支出</div>
      </div>
      <div class="ab-card">
        <div class="card-head"><h4>财务健康</h4></div>
        <div v-if="health.length" class="health-row">
          <div v-for="h in health" :key="h.name" class="h-item">
            <span class="h-name">{{ h.name }}</span>
            <span class="h-val ab-num" :class="h.ok ? 'ok' : 'warn'">{{ h.value }}</span>
          </div>
        </div>
        <div v-else class="empty">暂无数据</div>
      </div>
    </div>

    <!-- ========== ② 分类 ========== -->
    <div v-show="activeDim === 1 && !loading">
      <div class="ab-card">
        <div class="card-head"><h4>支出分类统计</h4><span class="sub">总支出 {{ fmt(stats?.totalExpense || 0) }} · {{ stats?.expenseByCategory?.length || 0 }}类</span></div>
        <div class="pie-area">
          <canvas ref="expensePie" class="pie-canvas" />
          <div class="pie-rank">
            <div v-for="(r, idx) in expenseRows.slice(0, 6)" :key="r.id" class="pr-row">
              <span class="dot" :style="{ background: PIE_COLORS[idx % PIE_COLORS.length] }" ></span>
              <span class="pr-n">{{ idx + 1 }}</span><span class="pr-name">{{ r.name }}</span>
              <span class="pr-val ab-num">{{ fmt(r.value) }}</span>
            </div>
            <div v-if="!stats?.expenseByCategory?.length" class="empty">暂无支出数据</div>
          </div>
        </div>
      </div>
      <div class="ab-card">
        <div class="card-head"><h4>收入分类统计</h4><span class="sub">总收入 {{ fmt(stats?.totalIncome || 0) }} · {{ stats?.incomeByCategory?.length || 0 }}类</span></div>
        <div class="pie-area">
          <canvas ref="incomePie" class="pie-canvas" />
          <div class="pie-rank">
            <div v-for="(r, idx) in incomeRows.slice(0, 6)" :key="r.id" class="pr-row">
              <span class="dot" :style="{ background: PIE_COLORS[idx % PIE_COLORS.length] }" ></span>
              <span class="pr-n">{{ idx + 1 }}</span><span class="pr-name">{{ r.name }}</span>
              <span class="pr-val ab-num">{{ fmt(r.value) }}</span>
            </div>
            <div v-if="!stats?.incomeByCategory?.length" class="empty">暂无收入数据</div>
          </div>
        </div>
      </div>
      <div class="ab-card">
        <div class="card-head"><h4>刚性 / 弹性</h4><span class="sub">三张表口径</span></div>
        <div class="bar-row"><span class="bar-name">刚性支出</span><div class="bar-track"><div class="bar-fill out" :style="{ width: pctWidth(stats?.tagTotals?.rigid, stats?.totalExpense) }" /></div><span class="bar-val ab-num">{{ fmt(stats?.tagTotals?.rigid || 0) }}</span></div>
        <div class="bar-row"><span class="bar-name">弹性支出</span><div class="bar-track"><div class="bar-fill out2" :style="{ width: pctWidth(stats?.tagTotals?.flexible, stats?.totalExpense) }" /></div><span class="bar-val ab-num">{{ fmt(stats?.tagTotals?.flexible || 0) }}</span></div>
        <div class="bar-row"><span class="bar-name">备用金计提</span><div class="bar-track"><div class="bar-fill out3" :style="{ width: pctWidth(stats?.tagTotals?.earmark, stats?.totalExpense) }" /></div><span class="bar-val ab-num">{{ fmt(stats?.tagTotals?.earmark || 0) }}</span></div>
      </div>
      <div class="hint">分类随记账自动生成，金额为零的分类不占位；贷款仅利息计入支出。</div>
    </div>

    <!-- ========== ③ 成员 ========== -->
    <div v-show="activeDim === 2 && !loading">
      <div class="ab-card">
        <div class="card-head"><h4>成员记账数据</h4><span class="sub">本月 {{ stats?.txCount || 0 }} 笔</span></div>
        <div v-if="stats?.byMember?.length" class="bar-chart">
          <div v-for="m in stats.byMember" :key="m.id" class="bc-item">
            <div class="bc-bar-wrap"><div class="bc-bar" :style="{ height: (m.count / maxMemberCount) * 88 + 'px' }" /></div>
            <span class="bc-name">{{ m.name }}</span>
          </div>
        </div>
        <div v-else class="empty">本月暂无记账数据</div>
      </div>
      <div class="ab-card">
        <div class="card-head"><h4>成员收支对比</h4><span class="legend"><span class="dot out"></span>支出<span class="dot in"></span>收入</span></div>
        <template v-if="stats?.byMember?.length">
          <div v-for="m in stats.byMember" :key="m.id" class="member-cmp">
            <div class="mc-name">{{ m.name }}</div>
            <div class="mc-line"><span class="mc-tag">支出</span><div class="bar-track"><div class="bar-fill out" :style="{ width: (m.expense / maxMemberVal) * 100 + '%' }" /></div><span class="mc-val">{{ fmt(m.expense) }}</span></div>
            <div class="mc-line"><span class="mc-tag">收入</span><div class="bar-track"><div class="bar-fill in" :style="{ width: (m.income / maxMemberVal) * 100 + '%' }" /></div><span class="mc-val">{{ fmt(m.income) }}</span></div>
          </div>
        </template>
        <div v-else class="empty">暂无成员数据</div>
      </div>
      <div class="ab-card">
        <div class="card-head"><h4>成员支出统计</h4><span class="sub">总支出 {{ fmt(stats?.totalExpense || 0) }}</span></div>
        <div class="pie-area">
          <canvas ref="memberPie" class="pie-canvas" />
          <div class="pie-rank">
            <div v-for="(r, idx) in memberExpenseRows.slice(0, 6)" :key="r.id" class="pr-row">
              <span class="dot" :style="{ background: PIE_COLORS[idx % PIE_COLORS.length] }" ></span>
              <span class="pr-n">{{ idx + 1 }}</span><span class="pr-name">{{ r.name }}</span>
              <span class="pr-val ab-num">{{ fmt(r.value) }}</span>
            </div>
            <div v-if="!memberExpenseRows.length" class="empty">暂无支出数据</div>
          </div>
        </div>
      </div>
      <div class="hint">只统计当前家庭的活跃成员；已移除成员的历史流水不参与统计。</div>
    </div>

    <!-- ========== ④ 资产 ========== -->
    <div v-show="activeDim === 3 && !loading">
      <div class="ab-card net-card">
        <div><div class="lbl">净资产</div><div class="net-val">{{ fmt(bs?.netWorth || 0) }}</div></div>
        <div class="net-sub">资产 {{ fmt(bs?.totalAssets || 0) }}<br>负债 {{ fmt(bs?.liabilities?.total || 0) }}</div>
      </div>
      <div class="ab-card">
        <div class="card-head"><h4>资产负债账户统计</h4><span class="sub">按最新估值</span></div>
        <div class="pie-area">
          <canvas ref="assetPie" class="pie-canvas" />
          <div class="pie-rank">
            <div class="pr-row"><span class="dot" :style="{ background: PIE_COLORS[0] }" ></span><span class="pr-name">流动资产</span><span class="pr-val ab-num">{{ fmt(bs?.currentAssets?.total || 0) }}</span></div>
            <div class="pr-row"><span class="dot" :style="{ background: PIE_COLORS[2] }" ></span><span class="pr-name">金融资产</span><span class="pr-val ab-num">{{ fmt(bs?.financialAssets?.total || 0) }}</span></div>
            <div class="pr-row"><span class="dot" :style="{ background: PIE_COLORS[4] }" ></span><span class="pr-name">固定资产</span><span class="pr-val ab-num">{{ fmt(bs?.fixedAssets?.total || 0) }}</span></div>
            <div class="pr-row"><span class="dot" :style="{ background: LIAB_COLORS[0] }" ></span><span class="pr-name">负债</span><span class="pr-val ab-num">{{ fmt(bs?.liabilities?.total || 0) }}</span></div>
          </div>
        </div>
      </div>
      <div class="ab-card">
        <div class="card-head"><h4>估值明细</h4><span class="sub">{{ valuations.length }} 项</span></div>
        <template v-if="valuations.length">
          <div v-for="v in valuations" :key="v.id" class="bar-row">
            <span class="bar-name">{{ v.itemName }}</span>
            <div class="bar-track"><div class="bar-fill" :class="v.itemType === 'debt' ? 'in' : 'out'" :style="{ width: (v.value / maxValItem) * 100 + '%' }" /></div>
            <span class="bar-val ab-num">{{ fmt(v.value) }}</span>
          </div>
        </template>
        <div v-else class="empty">暂无估值登记，去「报表」页添加</div>
      </div>
      <div class="ab-card">
        <div class="card-head"><h4>勾稽校验</h4></div>
        <div v-for="c in checks" :key="c.name" class="check-row">
          <span class="check-icon" :class="c.pass ? 'pass' : 'fail'">{{ c.pass ? '✓' : '!' }}</span>
          <div><div class="check-name">{{ c.name }}</div><div class="check-detail">{{ c.detail }}</div></div>
        </div>
        <div v-if="!checks.length" class="empty">暂无校验结果</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-page { padding-bottom: 20px; }
.month-bar { display: flex; align-items: center; justify-content: center; gap: 18px; padding: 12px 0 4px; }
.arw { width: 30px; height: 30px; border: none; background: transparent; font-size: 22px; color: var(--ab-text-2); cursor: pointer; }
.month-label { font-size: 15px; font-weight: 600; }
.dim-tabs { display: flex; margin: 8px 12px 4px; background: var(--ab-card); border-radius: 10px; padding: 4px; }
.dim { flex: 1; padding: 8px 0; border: none; background: transparent; font-size: 13px; color: var(--ab-text-2); border-radius: 7px; cursor: pointer; }
.dim.on { color: var(--ab-primary); font-weight: 600; background: var(--ab-primary-light); }
.loading { text-align: center; color: var(--ab-text-3); padding: 40px; font-size: 13px; }
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.card-head h4 { margin: 0; font-size: 14px; }
.sub { font-size: 11px; color: var(--ab-text-3); }
.legend { font-size: 11px; color: var(--ab-text-3); display: flex; align-items: center; gap: 4px; }
.dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; flex: none; }
.dot.in { background: #e5484d; }
.dot.out { background: #1677ff; margin-left: 6px; }
.trio { display: flex; justify-content: space-around; text-align: center; }
.trio .lbl { font-size: 11px; color: var(--ab-text-3); }
.trio .val { font-size: 17px; margin-top: 2px; }
.trend-canvas { width: 100%; height: 130px; }
.trend-sum { display: flex; justify-content: space-around; text-align: center; border-top: 1px solid var(--ab-border); padding-top: 9px; margin-top: 4px; }
.trend-sum .lbl { font-size: 11px; color: var(--ab-text-3); }
.trend-sum .v { font-size: 14px; margin-top: 2px; }
.pie-area { display: flex; align-items: center; gap: 12px; }
.pie-canvas { flex: none; }
.pie-rank { flex: 1; min-width: 0; }
.pr-row { display: flex; align-items: center; gap: 5px; font-size: 12px; padding: 4px 0; }
.pr-n { color: var(--ab-text-3); width: 12px; }
.pr-name { flex: 1; color: var(--ab-text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pr-val { color: #1f2329; }
.bar-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.bar-name { width: 82px; font-size: 12px; color: var(--ab-text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar-track { flex: 1; height: 8px; background: var(--ab-bg); border-radius: 4px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, #1677ff, #4096ff); }
.bar-fill.in { background: linear-gradient(90deg, #e5484d, #f09595); }
.bar-fill.out2 { background: linear-gradient(90deg, #69b1ff, #91caff); }
.bar-fill.out3 { background: linear-gradient(90deg, #00a870, #36cfc9); }
.bar-val { width: 72px; text-align: right; font-size: 12px; }
.empty { color: var(--ab-text-3); font-size: 12px; padding: 18px 0; text-align: center; }
.health-row { display: flex; justify-content: space-around; }
.h-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.h-name { font-size: 11px; color: var(--ab-text-3); }
.h-val { font-size: 14px; }
.h-val.ok { color: var(--ab-balance); }
.h-val.warn { color: var(--ab-warn); }
.hint { font-size: 11px; color: #0958d9; background: var(--ab-primary-light); border-radius: 8px; padding: 9px 12px; margin: 0 12px 10px; }
.bar-chart { display: flex; align-items: flex-end; justify-content: space-around; padding-top: 6px; }
.bc-item { display: flex; flex-direction: column; align-items: center; gap: 5px; }
.bc-bar-wrap { height: 88px; display: flex; align-items: flex-end; }
.bc-bar { width: 24px; background: linear-gradient(180deg, #4096ff, #1677ff); border-radius: 4px 4px 0 0; min-height: 2px; }
.bc-name { font-size: 11px; color: var(--ab-text-3); }
.member-cmp { padding: 6px 0; border-bottom: 1px dashed var(--ab-border); }
.member-cmp:last-child { border-bottom: none; }
.mc-name { font-size: 13px; margin-bottom: 4px; }
.mc-line { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.mc-tag { width: 28px; font-size: 11px; color: var(--ab-text-3); }
.mc-val { width: 64px; text-align: right; font-size: 11px; }
.net-card { display: flex; align-items: center; justify-content: space-between; }
.net-card .lbl { font-size: 11px; color: var(--ab-text-3); }
.net-val { font-size: 22px; font-weight: 600; color: var(--ab-primary); margin-top: 2px; }
.net-sub { font-size: 11px; color: var(--ab-text-3); text-align: right; line-height: 1.8; }
.check-row { display: flex; gap: 8px; padding: 7px 0; border-bottom: 1px dashed var(--ab-border); }
.check-row:last-child { border-bottom: none; }
.check-icon { width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex: none; }
.check-icon.pass { background: #eaf8f1; color: #00a870; }
.check-icon.fail { background: var(--ab-warn-bg); color: var(--ab-warn); }
.check-name { font-size: 12px; }
.check-detail { font-size: 11px; color: var(--ab-text-3); margin-top: 2px; }
</style>
