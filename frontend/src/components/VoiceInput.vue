<script setup lang="ts">
import { ref } from 'vue'
import { showToast } from 'vant'
import api from '../api'
import { useAppStore } from '../stores/app'

// 语音记账弹层：按住录音（或文字输入）→ AI 解析 → 待确认清单 → 确认入账
const props = defineProps<{ show: boolean }>()
const emit = defineEmits(['update:show', 'saved'])

const store = useAppStore()

// ---------- 录音 ----------
const recording = ref(false)
const loading = ref(false) // 上传/解析中
const parseError = ref('')
let mediaRecorder: MediaRecorder | null = null
let chunks: Blob[] = []

async function startRecord() {
  parseError.value = ''
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : ''
    mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    chunks = []
    mediaRecorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
      uploadAndParse(blob)
    }
    mediaRecorder.start()
    recording.value = true
  } catch (e: any) {
    // 麦克风权限失败 → 引导用文字输入
    parseError.value =
      e.name === 'NotAllowedError'
        ? '麦克风权限被拒绝，请用下方文字输入'
        : '无法启动录音，请用下方文字输入'
  }
}

function stopRecord() {
  if (mediaRecorder && recording.value) {
    mediaRecorder.stop()
    recording.value = false
    loading.value = true
  }
}

// ---------- 文字输入（ASR 降级路径） ----------
const textInput = ref('')
async function parseText() {
  const t = textInput.value.trim()
  if (!t) return showToast('请说出或输入记账内容')
  loading.value = true
  parseError.value = ''
  try {
    await doParse(t)
  } finally {
    loading.value = false
  }
}

// ---------- 上传录音 → 转写 → 解析 ----------
async function uploadAndParse(blob: Blob) {
  loading.value = true
  try {
    const form = new FormData()
    form.append('audio', blob, 'record.webm')
    const { data } = await api.post('/voice/transcribe', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    })
    transcript.value = data.text
    await doParse(data.text)
  } catch (e: any) {
    parseError.value =
      e.response?.data?.message || '语音处理失败，请用文字输入重试'
  } finally {
    loading.value = false
  }
}

// ---------- 待确认清单 ----------
const transcript = ref('')
const items = ref<any[]>([])
const showList = ref(false)

async function doParse(text: string) {
  const { data } = await api.post('/voice/parse', { text }, { timeout: 60000 })
  transcript.value = data.transcript
  items.value = data.items.map((it: any) => ({ ...it, removed: false }))
  showList.value = true
  // 预加载分类（编辑时选分类用）
  store.loadCategories()
}

function removeItem(i: number) {
  items.value[i].removed = true
}

// 点改金额
function editAmount(i: number) {
  const cur = String(items.value[i].amount)
  const input = prompt('修改金额', cur)
  if (input !== null) {
    const v = parseFloat(input)
    if (v > 0) items.value[i].amount = v
    else showToast('金额需大于 0')
  }
}

// 点选分类
const editingIdx = ref(-1)
function catsFor(idx: number) {
  const it = items.value[idx]
  return it?.type === 'income' ? store.incomeCategories : store.expenseCategories
}
function pickCat(idx: number, c: any) {
  items.value[idx].categoryName = c.name
  items.value[idx].categoryId = c.id
  items.value[idx].needCreate = false
  editingIdx.value = -1
}
// 手输新分类名
function inputNewCat(idx: number) {
  const name = prompt('新分类名', items.value[idx].categoryName)
  if (name && name.trim()) {
    items.value[idx].categoryName = name.trim()
    items.value[idx].categoryId = null
    items.value[idx].needCreate = true
    editingIdx.value = -1
  }
}

async function confirmApply() {
  const live = items.value.filter((it) => !it.removed && it.amount > 0)
  if (!live.length) return showToast('没有可入账的条目')
  loading.value = true
  try {
    const { data } = await api.post('/voice/apply', {
      transcript: transcript.value,
      items: live.map((it) => ({
        type: it.type,
        amount: it.amount,
        categoryName: it.categoryName,
        note: it.note,
        date: it.date,
        confidence: it.confidence,
        transcript: transcript.value,
      })),
    })
    showToast(`已记入 ${data.created} 笔`)
    emit('saved')
    close()
  } catch (e: any) {
    showToast(e.response?.data?.message || '入账失败')
  } finally {
    loading.value = false
  }
}

function close() {
  emit('update:show', false)
  // 重置
  showList.value = false
  items.value = []
  transcript.value = ''
  textInput.value = ''
  parseError.value = ''
}
</script>

<template>
  <van-popup
    :show="props.show"
    @update:show="emit('update:show', $event)"
    position="bottom"
    round
    :style="{ maxHeight: '88%' }"
    :close-on-click-overlay="!loading"
  >
    <div class="voice-popup">
      <!-- 阶段一：录音 / 文字输入 -->
      <template v-if="!showList">
        <h4>语音记账</h4>
        <div class="mic-area">
          <div
            class="mic-btn"
            :class="{ rec: recording }"
            @touchstart.prevent="startRecord"
            @touchend.prevent="stopRecord"
            @mousedown="startRecord"
            @mouseup="stopRecord"
            @mouseleave="recording && stopRecord()"
          >
            <van-icon name="volume-o" />
          </div>
          <div class="mic-tip">
            {{ recording ? '松开结束' : '按住说话（如：午饭35，地铁3块）' }}
          </div>
          <div v-if="loading" class="loading-row">
            <van-loading size="20" /> {{ loading ? '正在识别…' : '' }}
          </div>
        </div>

        <!-- 文字输入（ASR 降级 & 平时打字也快） -->
        <div class="text-fallback">
          <van-field
            v-model="textInput"
            type="textarea"
            rows="2"
            autosize
            placeholder="也可以直接打字：午饭35 地铁3 工资两万"
            maxlength="500"
          />
          <van-button size="small" type="primary" plain :loading="loading" @click="parseText">
            智能解析
          </van-button>
        </div>

        <div v-if="parseError" class="err">{{ parseError }}</div>
      </template>

      <!-- 阶段二：待确认清单 -->
      <template v-else>
        <div class="list-head">
          <div>
            <h4 style="margin: 0">待确认清单</h4>
            <div class="transcript">"{{ transcript }}"</div>
          </div>
          <van-icon name="cross" size="18" color="#86909c" @click="close" />
        </div>

        <div class="cards">
          <div
            v-for="(it, i) in items"
            :key="i"
            class="tx-card"
            :class="{
              removed: it.removed,
              warn: it.confidence < 0.8 || it.needCreate,
            }"
          >
            <div class="card-main" @click="editingIdx === i ? (editingIdx = -1) : (editingIdx = i)">
              <div class="c-left">
                <div class="c-amt ab-num" @click.stop="editAmount(i)">
                  <span :class="it.type === 'income' ? 'ab-in' : 'ab-out'">
                    {{ it.type === 'income' ? '+' : '−' }}{{ it.amount.toFixed(2) }}
                  </span>
                  <van-icon name="edit" size="12" color="#86909c" />
                </div>
                <div class="c-cat">
                  {{ it.categoryName }}
                  <van-tag v-if="it.needCreate" type="primary" plain size="medium">新分类</van-tag>
                  <van-tag v-if="it.confidence < 0.8" type="warning" plain size="medium">请核对</van-tag>
                </div>
                <div class="c-sub">{{ it.note }} · {{ it.date }}</div>
              </div>
              <van-icon
                :name="it.removed ? 'replay' : 'close'"
                size="18"
                color="#86909c"
                @click.stop="it.removed = false"
                v-if="it.removed"
              />
              <van-icon
                v-else
                name="close"
                size="18"
                color="#86909c"
                @click.stop="removeItem(i)"
              />
            </div>

            <!-- 展开的分类选择 -->
            <div v-if="editingIdx === i" class="cat-picker">
              <div class="cp-grid">
                <div
                  v-for="c in catsFor(i)"
                  :key="c.id"
                  class="cp-item"
                  :class="{ on: it.categoryName === c.name }"
                  @click="pickCat(i, c)"
                >
                  <van-icon :name="c.icon || 'bill-o'" />
                  <span>{{ c.name }}</span>
                </div>
                <div class="cp-item new" @click="inputNewCat(i)">
                  <van-icon name="edit" />
                  <span>自定义</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <van-button
          type="primary"
          block
          round
          :loading="loading"
          :disabled="!items.some((x) => !x.removed)"
          @click="confirmApply"
        >
          确认记入（{{ items.filter((x) => !x.removed).length }} 笔）
        </van-button>
      </template>
    </div>
  </van-popup>
</template>

<style scoped>
.voice-popup {
  padding: 16px 16px 20px;
  max-height: 88vh;
  overflow-y: auto;
}
h4 {
  margin: 2px 0 12px;
}
.mic-area {
  text-align: center;
  padding: 12px 0 4px;
}
.mic-btn {
  width: 88px;
  height: 88px;
  margin: 0 auto;
  border-radius: 50%;
  background: linear-gradient(135deg, #1677ff, #0958d9);
  color: #fff;
  font-size: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 20px rgba(9, 88, 217, 0.35);
  user-select: none;
  touch-action: none;
  cursor: pointer;
  transition: transform 0.15s;
}
.mic-btn.rec {
  transform: scale(1.15);
  background: linear-gradient(135deg, #e5484d, #c9262b);
  animation: pulse 1.2s infinite;
}
@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(229, 72, 77, 0.4);
  }
  50% {
    box-shadow: 0 0 0 16px rgba(229, 72, 77, 0);
  }
}
.mic-tip {
  margin-top: 10px;
  font-size: 13px;
  color: var(--ab-text-3);
}
.loading-row {
  margin-top: 10px;
  display: flex;
  justify-content: center;
  gap: 8px;
  color: var(--ab-text-2);
  font-size: 13px;
  align-items: center;
}
.text-fallback {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  margin-top: 16px;
}
.text-fallback .van-field {
  flex: 1;
  background: var(--ab-bg);
  border-radius: 8px;
}
.err {
  color: var(--ab-income);
  font-size: 13px;
  margin-top: 10px;
  background: #ffece8;
  border-radius: 8px;
  padding: 8px 12px;
}
.list-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}
.transcript {
  font-size: 12px;
  color: var(--ab-text-3);
  margin-top: 4px;
}
.cards {
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tx-card {
  background: var(--ab-bg);
  border-radius: 10px;
  border: 1px solid transparent;
  padding: 10px 12px;
}
.tx-card.warn {
  border-color: var(--ab-warn);
  background: var(--ab-warn-bg);
}
.tx-card.removed {
  opacity: 0.45;
}
.card-main {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.c-amt {
  font-size: 20px;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.c-cat {
  font-size: 14px;
  color: #1f2329;
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.c-sub {
  font-size: 12px;
  color: var(--ab-text-3);
  margin-top: 2px;
}
.cat-picker {
  border-top: 1px dashed var(--ab-border);
  margin-top: 8px;
  padding-top: 8px;
}
.cp-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}
.cp-item {
  text-align: center;
  padding: 6px 2px;
  border-radius: 8px;
  font-size: 11px;
  color: var(--ab-text-2);
  cursor: pointer;
}
.cp-item .van-icon {
  display: block;
  font-size: 20px;
  margin-bottom: 2px;
}
.cp-item.on {
  color: var(--ab-primary);
  background: var(--ab-primary-light);
}
.cp-item.new {
  color: var(--ab-primary);
}
</style>
