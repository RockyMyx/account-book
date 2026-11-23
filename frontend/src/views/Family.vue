<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import { useRouter } from 'vue-router'
import api from '../api'
import { useAppStore } from '../stores/app'

// 家庭页：成员与设备管理 + 我的资料 + 分类管理入口
const router = useRouter()
const store = useAppStore()
const overview = ref<any>(null)
const newCode = ref('')

const myRole = computed(() => overview.value?.myRole || 'member')
const isAdmin = computed(() => myRole.value === 'admin')

onMounted(load)

async function load() {
  const { data } = await api.get('/family/overview')
  overview.value = data
}

// ---------- 我的资料 ----------
const showProfile = ref(false)
const profileForm = ref({ name: '', avatar: '' })
const avatars = ['👨', '👩', '👴', '👵', '🧑', '👧', '👦', '🐱', '🐶', '🌟', '🍀', '💰']

function openProfile() {
  const me = overview.value?.members?.find((m: any) => m.id === overview.value.myMemberId)
  profileForm.value = { name: me?.name || '', avatar: me?.avatar || '' }
  showProfile.value = true
}
async function saveProfile() {
  try {
    const me = overview.value?.members?.find((m: any) => m.id === overview.value.myMemberId)
    const payload: any = {}
    if (profileForm.value.name !== me?.name) payload.name = profileForm.value.name
    if (profileForm.value.avatar !== me?.avatar) payload.avatar = profileForm.value.avatar
    if (!Object.keys(payload).length) {
      showProfile.value = false
      return
    }
    await api.put('/family/profile', payload)
    showToast('已保存')
    showProfile.value = false
    await load()
  } catch (e: any) {
    showToast(e.response?.data?.message || '保存失败')
  }
}

// ---------- 管理员操作 ----------
async function revokeDevice(deviceId: string) {
  try {
    await showConfirmDialog({ title: '解绑设备', message: '该设备需重新输家庭码才能进入，确定解绑？' })
    await api.post('/auth/revoke-device', { deviceId })
    await load()
  } catch (e: any) {
    if (e?.response) showToast(e.response.data?.message || '操作失败')
  }
}

async function setRole(id: string, name: string, role: string) {
  const label = role === 'admin' ? '管理员（可管理成员、重置家庭码）' : '普通成员（记账、看报表）'
  try {
    await showConfirmDialog({ title: `把 ${name} 设为`, message: label })
    await api.put(`/family/members/${id}/role`, { role })
    showToast('已设置')
    await load()
  } catch (e: any) {
    if (e?.response) showToast(e.response.data?.message || '操作失败')
  }
}

async function removeMember(id: string, name: string) {
  try {
    await showConfirmDialog({ title: '移除成员', message: `移除 ${name} 后其设备全部失效，历史流水保留。确定？` })
    await api.delete(`/family/members/${id}`)
    await load()
  } catch (e: any) {
    if (e?.response) showToast(e.response.data?.message || '操作失败')
  }
}

async function resetCode() {
  try {
    await showConfirmDialog({ title: '重置家庭码', message: '重置后旧码作废，已绑定设备不受影响。' })
    const { data } = await api.post('/auth/reset-code')
    newCode.value = data.familyCode
    await load()
  } catch (e: any) {
    if (e?.response) showToast(e.response.data?.message || '操作失败')
  }
}

function fmtTime(t: string) {
  return new Date(t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function logout() {
  store.logout()
  window.location.href = '/bind'
}
</script>

<template>
  <div class="family-page">
    <!-- 家庭概览 -->
    <div class="ab-card head-card">
      <div class="f-name">{{ overview?.familyName }}</div>
      <div class="f-sub">
        {{ overview?.members?.length || 0 }} 位成员 · 我是{{ myRole === 'admin' ? '管理员' : '成员' }}
      </div>
      <van-button size="small" plain type="primary" icon="edit" @click="openProfile">
        我的资料
      </van-button>
    </div>

    <!-- 成员列表 -->
    <div v-for="m in overview?.members" :key="m.id" class="ab-card">
      <div class="member-head">
        <span class="avatar">{{ m.avatar || (m.role === 'admin' ? '👑' : '🙂') }}</span>
        <span class="m-name">{{ m.name }}</span>
        <van-tag v-if="m.role === 'admin'" type="primary" plain size="medium">管理员</van-tag>
        <span class="m-actions" v-if="isAdmin && m.id !== overview.myMemberId">
          <van-button size="small" plain @click="setRole(m.id, m.name, m.role === 'admin' ? 'member' : 'admin')">
            {{ m.role === 'admin' ? '降为成员' : '设为管理员' }}
          </van-button>
          <van-button size="small" type="danger" plain @click="removeMember(m.id, m.name)">
            移除
          </van-button>
        </span>
      </div>
      <div class="joined">加入于 {{ fmtTime(m.joinedAt) }}</div>

      <!-- 绑定设备（输过家庭码的都显示；手机上显示最近登录时间） -->
      <div v-for="d in m.devices" :key="d.id" class="device-row">
        <van-icon :name="d.isMobile ? 'phone-o' : 'desktop-o'" />
        <div class="d-info">
          <div>{{ d.deviceName }} <van-tag v-if="d.isCurrent" type="success" plain size="medium">本机</van-tag></div>
          <div class="d-sub" v-if="d.isMobile">最近使用：{{ fmtTime(d.lastSeenAt) }}</div>
        </div>
        <van-button v-if="isAdmin && !d.isCurrent" size="small" plain @click="revokeDevice(d.id)">
          解绑
        </van-button>
      </div>
      <div v-if="!m.devices?.length" class="no-device">暂无绑定设备（输家庭码后出现在这里）</div>
    </div>

    <!-- 新家庭码提示 -->
    <div v-if="newCode" class="ab-card new-code">
      新家庭码：<b>{{ newCode }}</b>（请告知家人，旧码已作废）
    </div>

    <!-- 功能入口 -->
    <div class="ab-card actions">
      <van-cell title="分类管理" icon="apps-o" is-link @click="router.push('/categories')" />
      <van-cell v-if="isAdmin" title="重置家庭码" icon="replay" is-link @click="resetCode" />
      <van-cell title="退出本机绑定" icon="logout" is-link @click="logout" />
    </div>

    <!-- 我的资料弹层 -->
    <van-popup v-model:show="showProfile" position="bottom" round>
      <div class="profile-popup">
        <h4>我的资料</h4>
        <van-field v-model="profileForm.name" label="昵称" placeholder="家人看到的名字" maxlength="30" />
        <div class="avatar-row">
          <div class="a-lbl">头像</div>
          <div class="a-grid">
            <span
              v-for="a in avatars"
              :key="a"
              class="a-item"
              :class="{ on: profileForm.avatar === a }"
              @click="profileForm.avatar = a"
            >{{ a }}</span>
          </div>
        </div>
        <van-button type="primary" block round style="margin-top: 14px" @click="saveProfile">
          保存
        </van-button>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.head-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}
.f-name {
  font-size: 20px;
  font-weight: 600;
}
.f-sub {
  font-size: 13px;
  color: var(--ab-text-3);
}
.member-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.avatar {
  font-size: 26px;
}
.m-name {
  font-size: 16px;
  font-weight: 500;
  flex: 1;
  min-width: 60px;
}
.m-actions {
  display: flex;
  gap: 6px;
}
.joined {
  font-size: 12px;
  color: var(--ab-text-3);
  margin: 2px 0 6px;
}
.device-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px dashed var(--ab-border);
}
.d-info {
  flex: 1;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.d-sub {
  font-size: 12px;
  color: var(--ab-text-3);
  width: 100%;
}
.no-device {
  font-size: 12px;
  color: var(--ab-text-3);
  padding-top: 6px;
}
.new-code {
  color: var(--ab-primary);
}
.actions {
  padding: 0;
}
.profile-popup {
  padding: 16px;
}
.avatar-row {
  padding: 10px 16px;
}
.a-lbl {
  font-size: 13px;
  color: var(--ab-text-2);
  margin-bottom: 8px;
}
.a-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.a-item {
  font-size: 24px;
  text-align: center;
  padding: 6px 0;
  border-radius: 8px;
  background: var(--ab-bg);
  cursor: pointer;
}
.a-item.on {
  background: var(--ab-primary-light);
  outline: 2px solid var(--ab-primary);
}
</style>
