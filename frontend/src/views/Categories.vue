<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import api from '../api'
import { useAppStore } from '../stores/app'

// 分类管理：只显示记账过程中用户自建的分类（随记账增加而增长）
// Excel 预置科目是统计口径/语音归类的系统底座，不在此展示、不参与管理
const store = useAppStore()
const showNew = ref(false)
const newForm = ref({ name: '', direction: 'expense', tag: 'flexible' })

// 板块中文名（沿用 Excel 口径）
const tagNames: Record<string, string> = {
  fixed: '固定收入',
  variable: '浮动收入',
  rigid: '刚性支出',
  flexible: '弹性支出',
  earmark: '备用金计提',
  investment: '投资科目',
  mortgage: '房贷',
  loan: '贷款',
  fixedasset: '资产科目',
}

onMounted(() => {
  store.categories = []
  store.loadCategories()
})

const groups = computed(() => {
  const g: Record<string, typeof store.categories> = {}
  for (const c of store.categories) {
    // 隐藏 Excel 预置科目：它们是系统底座，不是用户管理的分类
    if (c.isBuiltin) continue
    const key = `${c.direction}:${c.tag}`
    ;(g[key] = g[key] || []).push(c)
  }
  // 排序：收入→支出→其他
  const order = (k: string) =>
    k.startsWith('income') ? 0 : k.startsWith('expense') ? 1 : 2
  return Object.entries(g).sort((a, b) => order(a[0]) - order(b[0]))
})

async function createCat() {
  const name = newForm.value.name.trim()
  if (!name) return showToast('请输入分类名')
  try {
    const { data } = await api.post('/categories', {
      name,
      direction: newForm.value.direction,
      tag: newForm.value.tag,
    })
    store.categories.push(data)
    showNew.value = false
    newForm.value.name = ''
    showToast('已添加')
  } catch (e: any) {
    showToast(e.response?.data?.message || '添加失败')
  }
}

async function renameCat(c: any) {
  const input = prompt('修改分类名', c.name)
  if (input === null) return
  const name = input.trim()
  if (!name || name === c.name) return
  try {
    await api.put(`/categories/${c.id}`, { name })
    c.name = name
    showToast('已改名')
  } catch (e: any) {
    showToast(e.response?.data?.message || '改名失败')
  }
}

async function removeCat(c: any) {
  if (c.isBuiltin) return showToast('预置科目不可删除')
  try {
    await showConfirmDialog({ title: '删除分类', message: `删除"${c.name}"？有流水的分类无法删除。` })
    await api.delete(`/categories/${c.id}`)
    store.categories = store.categories.filter((x) => x.id !== c.id)
    showToast('已删除')
  } catch (e: any) {
    if (e?.response) showToast(e.response.data?.message || '删除失败')
  }
}

async function moveCat(c: any, dir: -1 | 1) {
  const g = groups.value.find(([, list]) => list.includes(c))?.[1] || []
  const arr = [...g].sort((a, b) => a.sortNo - b.sortNo)
  const idx = arr.indexOf(c)
  const swap = arr[idx + dir]
  if (!swap) return
  try {
    await Promise.all([
      api.put(`/categories/${c.id}`, { sortNo: swap.sortNo }),
      api.put(`/categories/${swap.id}`, { sortNo: c.sortNo }),
    ])
    const t = c.sortNo
    c.sortNo = swap.sortNo
    swap.sortNo = t
  } catch {
    showToast('调整失败')
  }
}
</script>

<template>
  <div class="cats-page">
    <van-nav-bar title="分类管理" left-arrow @click-left="$router.back()" />

    <div v-if="!groups.length" class="ab-card empty-cats">
      <van-icon name="apps-o" size="34" color="#c9cdd4" />
      <p>还没有自定义分类</p>
      <span>预置科目是系统统计口径，不在这里显示；记一笔时新建的分类会自动出现在这里。</span>
    </div>

    <div v-for="[key, list] in groups" :key="key" class="ab-card">
      <div class="g-title">
        {{ tagNames[key.split(':')[1]] || key }}
        <span class="g-dir">{{ key.startsWith('income') ? '收入' : '支出/其他' }}</span>
      </div>
      <van-swipe-cell v-for="c in [...list].sort((a, b) => a.sortNo - b.sortNo)" :key="c.id">
        <div class="c-row">
          <van-icon :name="c.icon || 'bill-o'" class="c-icon" />
          <span class="c-name">{{ c.name }}</span>
          <van-tag v-if="c.isBuiltin" plain size="medium">预置</van-tag>
          <span class="c-ops">
            <van-icon name="arrow-up" @click="moveCat(c, -1)" />
            <van-icon name="arrow-down" @click="moveCat(c, 1)" />
          </span>
        </div>
        <template #right>
          <van-button square type="primary" text="改名" @click="renameCat(c)" />
          <van-button square type="danger" text="删除" :disabled="c.isBuiltin" @click="removeCat(c)" />
        </template>
      </van-swipe-cell>
    </div>

    <div class="add-area">
      <van-button type="primary" block round icon="plus" @click="showNew = true">
        新增分类
      </van-button>
    </div>

    <!-- 新增弹层 -->
    <van-dialog
      v-model:show="showNew"
      title="新增分类"
      show-cancel-button
      :before-close="(action: string) => { if (action === 'confirm') { createCat(); return false } return true }"
    >
      <div style="padding: 10px 4px">
        <van-field v-model="newForm.name" label="名称" placeholder="如：宠物开销" maxlength="20" />
        <van-field label="方向">
          <template #input>
            <van-radio-group v-model="newForm.direction" direction="horizontal">
              <van-radio name="expense">支出</van-radio>
              <van-radio name="income">收入</van-radio>
            </van-radio-group>
          </template>
        </van-field>
        <van-field label="板块">
          <template #input>
            <van-radio-group v-model="newForm.tag" direction="horizontal" style="flex-wrap: wrap; gap: 6px">
              <van-radio v-if="newForm.direction === 'income'" name="fixed">固定收入</van-radio>
              <van-radio v-if="newForm.direction === 'income'" name="variable">浮动收入</van-radio>
              <van-radio v-if="newForm.direction === 'expense'" name="rigid">刚性支出</van-radio>
              <van-radio v-if="newForm.direction === 'expense'" name="flexible">弹性支出</van-radio>
            </van-radio-group>
          </template>
        </van-field>
      </div>
    </van-dialog>
  </div>
</template>

<style scoped>
.g-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ab-primary);
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.g-dir {
  font-size: 11px;
  color: var(--ab-text-3);
  font-weight: 400;
}
.empty-cats {
  text-align: center;
  padding: 28px 20px;
}
.empty-cats p {
  margin: 10px 0 4px;
  font-size: 15px;
  color: var(--ab-text-2);
}
.empty-cats span {
  font-size: 12px;
  color: var(--ab-text-3);
  line-height: 1.6;
}
.c-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--ab-border);
}
.c-row:last-child {
  border-bottom: none;
}
.c-icon {
  font-size: 20px;
  color: var(--ab-primary);
}
.c-name {
  flex: 1;
  font-size: 15px;
}
.c-ops {
  display: flex;
  gap: 12px;
  color: var(--ab-text-3);
  font-size: 16px;
}
.add-area {
  padding: 12px;
}
</style>
