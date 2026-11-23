<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAppStore } from '../stores/app'
import api from '../api'

// 手动记一笔：参考鲨鱼记账布局
// 日期 + 类型切换（支出/收入/投资/还贷） + 大金额 + 分类宫格（分页，末尾可新建） + 备注 + 键盘
const router = useRouter()
const store = useAppStore()

type TxType = 'expense' | 'income' | 'invest' | 'loan'
const type = ref<TxType>('expense')
const amountStr = ref('')
const note = ref('')
const date = ref(new Date().toISOString().slice(0, 10))
const showCalendar = ref(false)
const saving = ref(false)

// 还贷本息拆分
const showSplit = ref(false)
const splitInterest = ref('')
const splitPrincipal = ref('')

onMounted(() => store.loadCategories())

// 类型 → 后端 type 映射与科目 direction
const typeMeta: Record<TxType, { label: string; api: string; dir: string }> = {
  expense: { label: '支出', api: 'expense', dir: 'expense' },
  income: { label: '收入', api: 'income', dir: 'income' },
  invest: { label: '投资', api: 'invest_buy', dir: 'invest' },
  loan: { label: '还贷', api: 'loan_repay', dir: 'debt' },
}
const meta = computed(() => typeMeta[type.value])

const cats = computed(() => {
  const list = store.categories.filter((c) => c.direction === meta.value.dir)
  return list.sort((a, b) => a.sortNo - b.sortNo)
})

// 分类宫格分页（每页 7 个 + 1 个新建格：4 列 × 2 行）
const PAGE_SIZE = 7
const pages = computed(() => {
  const p: typeof cats.value[] = []
  for (let i = 0; i < cats.value.length; i += PAGE_SIZE) {
    p.push(cats.value.slice(i, i + PAGE_SIZE))
  }
  return p.length ? p : [[]]
})
const selectedCat = ref<string | null>(null)

function switchType(t: TxType) {
  type.value = t
  selectedCat.value = null
}

// ---------- 新建分类 ----------
const showNewCat = ref(false)
const newCatName = ref('')
function openNewCat() {
  newCatName.value = ''
  showNewCat.value = true
}

// van-dialog before-close：确认时走新建，失败保持弹窗打开
async function newCatBeforeClose(action: string): Promise<boolean> {
  if (action !== 'confirm') return true
  const name = newCatName.value.trim()
  if (!name) {
    showToast('请输入分类名')
    return false
  }
  const tagMap: Record<TxType, string> = {
    expense: 'flexible',
    income: 'variable',
    invest: 'investment',
    loan: 'loan',
  }
  try {
    const { data } = await api.post('/categories', {
      name,
      direction: meta.value.dir,
      tag: tagMap[type.value],
    })
    store.categories.push(data)
    selectedCat.value = data.id
    showToast('已新建并选中')
    return true
  } catch (e: any) {
    showToast(e.response?.data?.message || '新建失败')
    return false
  }
}

// ---------- 键盘 ----------
function pressKey(k: string) {
  if (k === 'del') {
    amountStr.value = amountStr.value.slice(0, -1)
    return
  }
  if (k === '.') {
    if (amountStr.value.includes('.')) return
    if (!amountStr.value) amountStr.value = '0.'
    else amountStr.value += '.'
    return
  }
  const dec = amountStr.value.split('.')[1]
  if (dec !== undefined && dec.length >= 2) return
  if (amountStr.value === '0') amountStr.value = k
  else amountStr.value += k
}

const amount = computed(() => parseFloat(amountStr.value) || 0)

// 拆分校验：利息+本金 = 总额
const splitOk = computed(() => {
  if (type.value !== 'loan') return true
  const i = parseFloat(splitInterest.value) || 0
  const p = parseFloat(splitPrincipal.value) || 0
  return amount.value > 0 && Math.abs(i + p - amount.value) < 0.01
})

async function save() {
  if (!amount.value) return showToast('请输入金额')
  if (!selectedCat.value) return showToast('请选择分类')
  if (type.value === 'loan' && !splitOk.value) {
    return showToast('利息+本金需等于还款总额')
  }
  try {
    saving.value = true
    await api.post('/transactions', {
      date: date.value,
      type: meta.value.api,
      amount: amount.value,
      categoryId: selectedCat.value,
      note: note.value || undefined,
      source: 'manual',
      splits:
        type.value === 'loan'
          ? [
              { part: 'interest', amount: parseFloat(splitInterest.value) || 0 },
              { part: 'principal', amount: parseFloat(splitPrincipal.value) || 0 },
            ]
          : undefined,
    })
    showToast('已记入')
    router.push('/')
  } catch (e: any) {
    showToast(e.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function fmtDate(d: string) {
  const today = new Date().toISOString().slice(0, 10)
  if (d === today) return '今天'
  return `${d.slice(5).replace('-', '月')}日`
}
</script>

<template>
  <div class="add-page">
    <!-- 顶部：日期 + 类型切换 -->
    <div class="top-bar">
      <div class="date" @click="showCalendar = true">
        <van-icon name="calendar-o" /> {{ fmtDate(date) }}
      </div>
      <div class="seg">
        <span
          v-for="(v, k) in typeMeta"
          :key="k"
          :class="{ on: type === k }"
          @click="switchType(k as TxType)"
        >
          {{ v.label }}
        </span>
      </div>
    </div>

    <!-- 大金额显示 -->
    <div class="amount-display">
      <span class="currency">￥</span>
      <span class="num ab-num">{{ amountStr || '0' }}</span>
      <span v-if="type === 'loan' && amount > 0" class="split-link" @click="showSplit = true">
        本息拆分
      </span>
    </div>

    <!-- 分类宫格（分页 + 末尾新建格） -->
    <div class="cats">
      <van-swipe :loop="false" :show-indicators="pages.length > 1">
        <van-swipe-item v-for="(page, pi) in pages" :key="pi">
          <div class="grid">
            <div
              v-for="c in page"
              :key="c.id"
              class="cell"
              :class="{ sel: selectedCat === c.id }"
              @click="selectedCat = c.id"
            >
              <div class="cell-icon">
                <van-icon :name="c.icon || 'bill-o'" />
              </div>
              <div class="cell-name">{{ c.name }}</div>
            </div>
            <!-- 新建分类格 -->
            <div class="cell" @click="openNewCat">
              <div class="cell-icon new"><van-icon name="plus" /></div>
              <div class="cell-name">新建</div>
            </div>
          </div>
        </van-swipe-item>
      </van-swipe>
    </div>

    <!-- 备注 -->
    <div class="note-row">
      <van-field v-model="note" placeholder="点击填写备注" maxlength="100" />
    </div>

    <!-- 键盘 -->
    <div class="keyboard">
      <div class="keys">
        <div v-for="k in ['1','2','3','4','5','6','7','8','9','.','0','del']" :key="k" class="key" @click="pressKey(k)">
          <van-icon v-if="k === 'del'" name="delete-o" />
          <template v-else>{{ k }}</template>
        </div>
      </div>
      <van-button
        type="primary"
        class="save-btn"
        :disabled="!amount || !selectedCat || !splitOk"
        :loading="saving"
        @click="save"
      >
        保 存
      </van-button>
    </div>

    <!-- 日历 -->
    <van-calendar
      v-model:show="showCalendar"
      :min-date="new Date(Date.now() - 365 * 86400000)"
      :max-date="new Date()"
      @confirm="(d: Date) => { date = d.toISOString().slice(0, 10); showCalendar = false }"
    />

    <!-- 新建分类弹窗 -->
    <van-dialog
      v-model:show="showNewCat"
      title="新建分类"
      show-cancel-button
      :before-close="newCatBeforeClose"
    >
      <van-field
        v-model="newCatName"
        :placeholder="`新的${meta.label}分类名（如：宠物开销）`"
        maxlength="20"
        style="margin: 10px 0"
      />
      <div class="dialog-tip">创建后自动选中，家人都能用</div>
    </van-dialog>

    <!-- 本息拆分弹窗 -->
    <van-dialog
      v-model:show="showSplit"
      title="月供拆分（利息 / 本金）"
      show-cancel-button
    >
      <div style="padding: 10px 16px">
        <van-field v-model="splitInterest" type="number" label="利息" placeholder="进刚性支出">
          <template #right-icon><span>元</span></template>
        </van-field>
        <van-field v-model="splitPrincipal" type="number" label="本金" placeholder="减少负债余额">
          <template #right-icon><span>元</span></template>
        </van-field>
        <div class="dialog-tip" :style="{ color: splitOk ? '' : 'var(--ab-income)' }">
          利息 + 本金 = 还款总额 ￥{{ amount.toFixed(2) }}
          <template v-if="amount > 0 && !splitOk">（当前不符）</template>
        </div>
      </div>
    </van-dialog>
  </div>
</template>

<style scoped>
.add-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #fff;
}
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px 0;
}
.date {
  color: var(--ab-text-2);
  font-size: 14px;
  cursor: pointer;
}
.seg span {
  padding: 4px 10px;
  font-size: 14px;
  color: var(--ab-text-3);
}
.seg span.on {
  color: var(--ab-primary);
  font-weight: 600;
  border-bottom: 2px solid var(--ab-primary);
}
.amount-display {
  text-align: right;
  padding: 18px 20px 8px;
  font-size: 40px;
  color: #1f2329;
}
.currency {
  font-size: 22px;
  margin-right: 4px;
}
.split-link {
  font-size: 13px;
  color: var(--ab-primary);
  margin-left: 12px;
  vertical-align: middle;
  cursor: pointer;
}
.cats {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding-bottom: 8px;
}
.cell {
  text-align: center;
  padding: 8px 2px;
  border-radius: 10px;
  cursor: pointer;
}
.cell.sel .cell-icon {
  background: var(--ab-primary);
  color: #fff;
}
.cell.sel .cell-name {
  color: var(--ab-primary);
  font-weight: 600;
}
.cell-icon {
  width: 46px;
  height: 46px;
  margin: 0 auto 4px;
  border-radius: 50%;
  background: var(--ab-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: var(--ab-text-2);
  transition: all 0.15s;
}
.cell-icon.new {
  background: var(--ab-primary-light);
  color: var(--ab-primary);
}
.cell-name {
  font-size: 12px;
  color: var(--ab-text-2);
}
.note-row {
  border-top: 1px solid var(--ab-border);
}
.keyboard {
  display: flex;
  border-top: 1px solid var(--ab-border);
}
.keys {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}
.key {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  border-right: 1px solid var(--ab-border);
  border-bottom: 1px solid var(--ab-border);
  cursor: pointer;
  user-select: none;
}
.save-btn {
  width: 100px;
  border-radius: 0;
}
.dialog-tip {
  font-size: 12px;
  color: var(--ab-text-3);
  padding: 4px 16px 12px;
}
</style>
