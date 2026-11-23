<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../api'

// 绑定页：输 6 位家庭码 + 昵称 → 绑定设备
// 若服务端未初始化，先显示初始化表单（仅首次部署出现一次）
const mode = ref<'loading' | 'init' | 'bind'>('loading')
const familyCode = ref('')
const memberName = ref('')
const familyName = ref('')
const adminName = ref('')
const initResult = ref<{ familyCode: string } | null>(null)
const submitting = ref(false)
const errMsg = ref('')

onMounted(async () => {
  try {
    const { data } = await api.get('/auth/status')
    mode.value = data.initialized ? 'bind' : 'init'
  } catch {
    errMsg.value = '无法连接服务器，请稍后再试'
  }
})

async function doInit() {
  submitting.value = true
  errMsg.value = ''
  try {
    const { data } = await api.post('/auth/initialize', {
      familyName: familyName.value,
      adminName: adminName.value,
    })
    initResult.value = data
    // 初始化者直接以管理员身份绑定本机
    memberName.value = adminName.value
    familyCode.value = data.familyCode
    await doBind()
  } catch (e: any) {
    errMsg.value = e.response?.data?.message || '初始化失败'
  } finally {
    submitting.value = false
  }
}

async function doBind() {
  submitting.value = true
  errMsg.value = ''
  try {
    // deviceName 不传，服务端按浏览器 UA 自动命名（Chrome · Windows 等）
    const { data } = await api.post('/auth/bind', {
      familyCode: familyCode.value,
      memberName: memberName.value,
    })
    localStorage.setItem('ab_token', data.token)
    window.location.href = '/'
  } catch (e: any) {
    errMsg.value = e.response?.data?.message || '绑定失败，请检查家庭码'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="bind-page">
    <div class="logo">
      <div class="logo-circle">¥</div>
      <h2>家庭记账本</h2>
      <p class="sub">三张表管好家庭财务</p>
    </div>

    <!-- 首次初始化（仅部署后第一人看到） -->
    <div v-if="mode === 'init'" class="ab-card">
      <h3>创建家庭空间</h3>
      <van-field v-model="familyName" label="家庭名" placeholder="如：小马哥的家" maxlength="30" />
      <van-field v-model="adminName" label="你的昵称" placeholder="管理员昵称" maxlength="30" />
      <div class="tip">创建后会生成 6 位家庭码，家人用它绑定自己的手机。</div>
      <van-button type="primary" block round :loading="submitting" @click="doInit">
        创建并进入
      </van-button>
    </div>

    <!-- 初始化成功提示（正常流程一闪而过，绑定失败时停留展示码） -->
    <div v-if="initResult" class="ab-card init-result">
      家庭码：<b class="code">{{ initResult.familyCode }}</b>
      <div class="tip">请记下家庭码，家人绑定时要输入。</div>
    </div>

    <!-- 日常绑定 -->
    <div v-if="mode === 'bind'" class="ab-card">
      <van-field
        v-model="familyCode"
        label="家庭码"
        type="digit"
        maxlength="6"
        placeholder="6 位数字"
      />
      <van-field v-model="memberName" label="昵称" placeholder="你的名字" maxlength="30" />
      <van-button type="primary" block round :loading="submitting" @click="doBind">
        绑定本机
      </van-button>
      <div class="tip">绑定后这台设备免登录；换手机重新输一次家庭码即可。</div>
    </div>

    <div v-if="errMsg" class="err">{{ errMsg }}</div>
  </div>
</template>

<style scoped>
.bind-page {
  padding-top: 60px;
}
.logo {
  text-align: center;
  margin-bottom: 24px;
}
.logo-circle {
  width: 72px;
  height: 72px;
  margin: 0 auto 12px;
  border-radius: 20px;
  background: linear-gradient(135deg, #1677ff, #0958d9);
  color: #fff;
  font-size: 36px;
  line-height: 72px;
  box-shadow: 0 8px 24px rgba(9, 88, 217, 0.3);
}
h2 {
  margin: 0;
  color: #1f2329;
}
.sub {
  color: var(--ab-text-3);
  margin: 6px 0 0;
}
.tip {
  color: var(--ab-text-3);
  font-size: 12px;
  margin: 8px 2px 14px;
}
.init-result {
  text-align: center;
}
.code {
  color: var(--ab-primary);
  font-size: 22px;
  letter-spacing: 4px;
}
.err {
  color: var(--ab-income);
  text-align: center;
  margin-top: 12px;
  font-size: 13px;
}
</style>
