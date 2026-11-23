<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import api from '../api'

// 三张表页：利润表 / 资产负债表 / 现金流量表 + 勾稽校验 + 估值登记入口
const tab = ref<'pl' | 'bs' | 'cf'>('pl')
const month = ref(new Date().toISOString().slice(0, 10).slice(0, 7))
const pl = ref<any>(null)
const bs = ref<any>(null)
const cf = ref<any>(null)
const recon = ref<any>(null)

onMounted(loadAll)

async function loadAll() {
  const [a, b, c, d] = await Promise.all([
    api.get('/transactions/summary', { params: { month: month.value } }),
    api.get('/reports/balance-sheet'),
    api.get('/reports/cash-flow', { params: { month: month.value } }),
    api.get('/reports/reconcile', { params: { month: month.value } }),
  ])
  pl.value = a.data
  bs.value = b.data
  cf.value = c.data
  recon.value = d.data
}

function fmt(n: number) {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function rate(n: number, d: number) {
  if (!d) return '—'
  return ((n / d) * 100).toFixed(1) + '%'
}

// ---------- 估值登记 ----------
const showVal = ref(false)
const valForm = ref({ itemType: 'cash', itemName: '', value: '', valueDate: new Date().toISOString().slice(0, 10) })
const itemTypeNames: Record<string, string> = {
  cash: '现金及活期存款',
  deposit: '定期存款',
  fund: '债券理财/股票基金',
  house: '房产',
  car: '车辆',
  debt: '负债余额（正数）',
}
const valuations = ref<any[]>([])

function openVal() {
  valForm.value = { itemType: 'cash', itemName: '', value: '', valueDate: new Date().toISOString().slice(0, 10) }
  loadValuations()
  showVal.value = true
}
async function loadValuations() {
  const { data } = await api.get('/valuations')
  valuations.value = data.items
}
async function saveValuation() {
  const v = parseFloat(valForm.value.value)
  if (!valForm.value.itemName.trim()) return showToast('请填写登记名')
  if (!(v >= 0)) return showToast('请填写金额')
  try {
    await api.post('/valuations', {
      itemType: valForm.value.itemType,
      itemName: valForm.value.itemName.trim(),
      value: v,
      valueDate: valForm.value.valueDate,
    })
    showToast('已登记')
    valForm.value.itemName = ''
    valForm.value.value = ''
    await loadValuations()
    await loadAll()
  } catch (e: any) {
    showToast(e.response?.data?.message || '登记失败')
  }
}
async function delValuation(id: string) {
  try {
    await showConfirmDialog({ title: '删除登记', message: '删除后该资产/负债估值不再参与报表计算。' })
    await api.delete(`/valuations/${id}`)
    await loadValuations()
    await loadAll()
  } catch (e: any) {
    if (e?.response) showToast(e.response.data?.message || '删除失败')
  }
}
</script>

<template>
  <div class="report-page">
    <!-- 顶部：月份 + 估值登记入口 -->
    <div class="bar">
      <van-field v-model="month" placeholder="YYYY-MM" class="month-input" @blur="loadAll" />
      <van-button size="small" plain type="primary" icon="edit" @click="openVal">
        估值登记
      </van-button>
    </div>

    <van-tabs v-model:active="tab" sticky>
      <!-- ============ 利润表 ============ -->
      <van-tab title="利润表" name="pl">
        <div class="ab-card">
          <h4>家庭收支与投资结余表 · {{ month }}</h4>
          <div class="sec">一、收入</div>
          <div class="row sub"><span>固定收入小计</span><b class="ab-num ab-in">{{ fmt(pl?.fixedIncome ?? 0) }}</b></div>
          <div class="row sub"><span>浮动收入小计</span><b class="ab-num ab-in">{{ fmt(pl?.variableIncome ?? 0) }}</b></div>
          <div class="row total"><span>总收入合计</span><b class="ab-num ab-in">{{ fmt(pl?.totalIncome ?? 0) }}</b></div>

          <div class="sec">二、支出</div>
          <div class="row sub"><span>刚性支出小计</span><b class="ab-num ab-out">{{ fmt(pl?.rigidExpense ?? 0) }}</b></div>
          <div class="row sub"><span>弹性支出小计</span><b class="ab-num ab-out">{{ fmt(pl?.flexibleExpense ?? 0) }}</b></div>
          <div class="row sub"><span>应急备用金计提</span><b class="ab-num ab-out">{{ fmt(pl?.earmark ?? 0) }}</b></div>
          <div class="row total"><span>总支出合计</span><b class="ab-num ab-out">{{ fmt(pl?.totalExpense ?? 0) }}</b></div>

          <div class="sec">三、结余与投资</div>
          <div class="row total"><span>月度收支结余</span><b class="ab-num ab-balance">{{ fmt(pl?.balance ?? 0) }}</b></div>
          <div class="row sub"><span>投资流出（资产转移）</span><b class="ab-num">{{ fmt(pl?.investOut ?? 0) }}</b></div>
          <div class="row sub"><span>还贷本金（减负债）</span><b class="ab-num">{{ fmt(pl?.loanPrincipal ?? 0) }}</b></div>
          <div class="row sub"><span>结余率</span><b class="ab-num">{{ rate(pl?.balance ?? 0, pl?.totalIncome ?? 0) }}</b></div>
        </div>
      </van-tab>

      <!-- ============ 资产负债表 ============ -->
      <van-tab title="资产负债表" name="bs">
        <div class="ab-card">
          <h4>家庭资产负债表</h4>
          <div class="asof">以最近登记估值为准（{{ bs?.asOf }}）</div>

          <div class="sec">资产</div>
          <div class="row sub"><span>流动资产（现金及活期）</span><b class="ab-num">{{ fmt(bs?.currentAssets?.total ?? 0) }}</b></div>
          <div class="row tiny" v-for="l in bs?.currentAssets?.lines" :key="l.name"><span>{{ l.name }}</span><span>{{ fmt(l.value) }}</span></div>
          <div class="row sub"><span>金融资产（存款+投资）</span><b class="ab-num">{{ fmt(bs?.financialAssets?.total ?? 0) }}</b></div>
          <div class="row tiny" v-for="l in bs?.financialAssets?.lines" :key="l.name"><span>{{ l.name }}</span><span>{{ fmt(l.value) }}</span></div>
          <div class="row sub"><span>固定资产（房产车辆）</span><b class="ab-num">{{ fmt(bs?.fixedAssets?.total ?? 0) }}</b></div>
          <div class="row tiny" v-for="l in bs?.fixedAssets?.lines" :key="l.name"><span>{{ l.name }}</span><span>{{ fmt(l.value) }}</span></div>
          <div class="row total"><span>总资产合计</span><b class="ab-num">{{ fmt(bs?.totalAssets ?? 0) }}</b></div>

          <div class="sec">负债</div>
          <div class="row sub" v-for="l in bs?.liabilities?.lines" :key="l.name"><span>{{ l.name }}</span><b class="ab-num">{{ fmt(l.value) }}</b></div>
          <div class="row total"><span>总负债合计</span><b class="ab-num">{{ fmt(bs?.liabilities?.total ?? 0) }}</b></div>

          <div class="networth">
            <div class="lbl">家庭净资产</div>
            <div class="val ab-num">{{ fmt(bs?.netWorth ?? 0) }}</div>
          </div>
        </div>
      </van-tab>

      <!-- ============ 现金流量表 ============ -->
      <van-tab title="现金流量表" name="cf">
        <div class="ab-card">
          <h4>家庭月度现金流 · {{ month }}</h4>
          <div v-if="cf && !cf.anchored" class="warn-tip">
            还没登记过现金估值，期初/期末为流水推算。到"估值登记"补一次现金余额更准。
          </div>

          <div class="sec">流入</div>
          <div class="row sub"><span>收入</span><b class="ab-num ab-in">{{ fmt(cf?.inflow?.income ?? 0) }}</b></div>
          <div class="row sub"><span>理财收益</span><b class="ab-num ab-in">{{ fmt(cf?.inflow?.investIncome ?? 0) }}</b></div>
          <div class="row sub"><span>投资赎回</span><b class="ab-num ab-in">{{ fmt(cf?.inflow?.investSell ?? 0) }}</b></div>
          <div class="row sub"><span>借款到账</span><b class="ab-num ab-in">{{ fmt(cf?.inflow?.loanDisburse ?? 0) }}</b></div>
          <div class="row total"><span>流入合计</span><b class="ab-num ab-in">{{ fmt(cf?.inflow?.total ?? 0) }}</b></div>

          <div class="sec">流出</div>
          <div class="row sub"><span>消费支出</span><b class="ab-num ab-out">{{ fmt(cf?.outflow?.expense ?? 0) }}</b></div>
          <div class="row sub"><span>投资买入</span><b class="ab-num ab-out">{{ fmt(cf?.outflow?.investBuy ?? 0) }}</b></div>
          <div class="row sub"><span>还贷（本息）</span><b class="ab-num ab-out">{{ fmt(cf?.outflow?.loanRepay ?? 0) }}</b></div>
          <div class="row sub"><span>资产购置</span><b class="ab-num ab-out">{{ fmt(cf?.outflow?.assetBuy ?? 0) }}</b></div>
          <div class="row total"><span>流出合计</span><b class="ab-num ab-out">{{ fmt(cf?.outflow?.total ?? 0) }}</b></div>

          <div class="sec">净流量与余额</div>
          <div class="row sub"><span>月度净现金流</span><b class="ab-num" :class="(cf?.netFlow ?? 0) >= 0 ? 'ab-in' : 'ab-out'">{{ fmt(cf?.netFlow ?? 0) }}</b></div>
          <div class="row sub"><span>期初现金</span><b class="ab-num">{{ fmt(cf?.openingCash ?? 0) }}</b></div>
          <div class="row total"><span>期末现金</span><b class="ab-num">{{ fmt(cf?.closingCash ?? 0) }}</b></div>
          <div class="row tiny"><span>备用金计提（非现金流）</span><span>{{ fmt(cf?.outflow?.earmark ?? 0) }}</span></div>
        </div>
      </van-tab>
    </van-tabs>

    <!-- 勾稽校验 -->
    <div class="ab-card">
      <h4>勾稽校验（自动）</h4>
      <div v-for="c in recon?.checks" :key="c.name" class="recon-row">
        <van-icon :name="c.pass ? 'checked' : 'warning-o'" :color="c.pass ? '#00a870' : '#ff9a2e'" />
        <div class="r-main">
          <div class="r-name">{{ c.name }}</div>
          <div class="r-detail">{{ c.detail }}</div>
        </div>
      </div>
    </div>

    <!-- 估值登记弹层 -->
    <van-popup v-model:show="showVal" position="bottom" round :style="{ maxHeight: '80%' }">
      <div class="val-popup">
        <h4>资产 / 负债估值登记</h4>
        <p class="val-tip">现金、存款、投资市值、房价、负债余额——定期登记，三张表以最近估值为准。</p>
        <van-field label="类型">
          <template #input>
            <van-radio-group v-model="valForm.itemType" direction="horizontal" style="flex-wrap: wrap; gap: 6px">
              <van-radio v-for="(label, key) in itemTypeNames" :key="key" :name="key" shape="dot" style="margin-bottom: 4px">{{ label }}</van-radio>
            </van-radio-group>
          </template>
        </van-field>
        <van-field v-model="valForm.itemName" label="登记名" placeholder="如：招行活期 / 房贷余额" maxlength="50" />
        <van-field v-model="valForm.value" type="number" label="金额(元)" placeholder="负债填正数">
          <template #right-icon><span>元</span></template>
        </van-field>
        <van-field v-model="valForm.valueDate" label="日期" placeholder="YYYY-MM-DD" />
        <van-button type="primary" block round style="margin-top: 12px" @click="saveValuation">登记</van-button>

        <div v-if="valuations.length" class="val-list">
          <div class="sec" style="padding-left: 0">当前登记项（最新值）</div>
          <van-swipe-cell v-for="v in valuations" :key="v.id">
            <div class="val-row">
              <div class="v-main">
                <div>{{ v.itemName }} <van-tag plain size="medium">{{ itemTypeNames[v.itemType] || v.itemType }}</van-tag></div>
                <div class="v-sub">{{ v.valueDate }} · {{ fmt(v.value) }} 元</div>
              </div>
            </div>
            <template #right>
              <van-button square type="danger" text="删除" @click="delValuation(v.id)" />
            </template>
          </van-swipe-cell>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  gap: 8px;
  padding: 8px 12px 0;
  align-items: center;
}
.month-input {
  flex: 1;
  background: #fff;
  border-radius: 8px;
}
h4 {
  margin: 2px 0 6px;
}
.asof {
  font-size: 12px;
  color: var(--ab-text-3);
  margin-bottom: 8px;
}
.sec {
  font-size: 13px;
  color: var(--ab-primary);
  font-weight: 600;
  margin: 14px 0 4px;
  padding-left: 2px;
}
.row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 14px;
  color: var(--ab-text-2);
}
.row b {
  font-weight: 600;
}
.row.sub span:first-child {
  padding-left: 10px;
}
.row.tiny {
  font-size: 12px;
  color: var(--ab-text-3);
  padding: 2px 0 2px 22px;
}
.row.total {
  border-top: 1px solid var(--ab-border);
  margin-top: 4px;
  padding-top: 10px;
  font-size: 15px;
  color: #1f2329;
}
.networth {
  margin-top: 16px;
  background: linear-gradient(135deg, #1677ff, #0958d9);
  border-radius: 12px;
  color: #fff;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.networth .val {
  font-size: 24px;
}
.warn-tip {
  background: var(--ab-warn-bg);
  color: var(--ab-warn);
  font-size: 12px;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 6px;
}
.recon-row {
  display: flex;
  gap: 10px;
  padding: 8px 0;
  align-items: flex-start;
}
.recon-row .van-icon {
  margin-top: 2px;
}
.r-name {
  font-size: 14px;
  color: #1f2329;
}
.r-detail {
  font-size: 12px;
  color: var(--ab-text-3);
  margin-top: 2px;
}
.val-popup {
  padding: 16px;
}
.val-tip {
  font-size: 12px;
  color: var(--ab-text-3);
  margin: 0 0 10px;
}
.val-list {
  margin-top: 16px;
}
.val-row {
  display: flex;
  align-items: center;
  background: var(--ab-bg);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 6px;
}
.v-main {
  flex: 1;
  font-size: 14px;
}
.v-sub {
  font-size: 12px;
  color: var(--ab-text-3);
  margin-top: 2px;
}
</style>
