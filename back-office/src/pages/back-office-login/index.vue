<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import { request } from '@/api/http'
import OwnerRecoveryPanel from '@/components/OwnerRecoveryPanel.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isSubmitting = ref(false)
const errorText = ref('')
const showRecovery = ref(route.path === '/back-office/recovery')
watch(()=>route.path,path=>{showRecovery.value=path==='/back-office/recovery'})
const companyRecoveryUrl = ref<string | null>(null)
const ownerMailReady = ref(false)
onMounted(async () => {
  try {
    const result = await request.get<{data:{companyAccountRecoveryUrl:string|null;ownerEmailRecovery:{mailReady:boolean}}}>('/auth/recovery-options')
    companyRecoveryUrl.value = result.data.companyAccountRecoveryUrl
    ownerMailReady.value = result.data.ownerEmailRecovery.mailReady
  } catch { /* Local recovery guidance is available even during a service outage. */ }
})
const form = reactive({
  username: '',
  password: '',
})

const submitText = computed(() => {
  return isSubmitting.value ? '登录中...' : '登录积分后台'
})

async function handleSubmit() {
  isSubmitting.value = true
  errorText.value = ''

  try {
    const user = await authStore.login({
      username: form.username,
      password: form.password,
      remember: false,
    })

    if (user.role !== 'developer' && user.role !== 'admin' && user.role !== 'agent') {
      await authStore.logout(false)
      errorText.value = '该账号不是后台角色，无法进入积分后台控制台。'
      return
    }

    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/back-office')
      ? route.query.redirect
      : '/back-office'
    router.push(redirect)
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '登录失败，请检查账号和密码。'
  } finally {
    form.password = ''
    isSubmitting.value = false
  }
}
</script>

<template>
  <main class="back-office-login">
    <section class="login-brand-panel">
      <div>
        <div class="login-brand-row">
          <span class="login-brand-logo">积</span>
          <span>
            <strong>积分后台</strong>
            <small>Reusable Credits Console</small>
          </span>
        </div>
        <h1>独立积分后台控制台</h1>
        <p>
          用后台角色进入 Reusable Credits Platform Console。Simulation Platform、Simulation Atlas 和 Modern AI Atlas 共用公司账号与钱包，产品权限分别购买。
        </p>
      </div>
      <div class="login-brand-foot">
        <Icon icon="mdi:shield-check-outline" />
        <span>Company owner / Admin / Agent 权限由后台会话决定</span>
      </div>
    </section>

    <section class="login-panel" aria-label="积分后台登录">
      <div class="login-card">
        <h2>登录</h2>
        <p>输入已配置的操作员账号和私有凭证；后台角色由服务端决定。</p>

        <form class="login-form" @submit.prevent="handleSubmit">
          <label>
            <span>账号</span>
            <input v-model="form.username" autocomplete="username" placeholder="company-owner" />
          </label>
          <label>
            <span>操作员凭证</span>
            <input v-model="form.password" type="password" autocomplete="current-password" />
          </label>
          <p v-if="errorText" class="login-error">{{ errorText }}</p>
          <button type="submit" class="login-submit" :disabled="isSubmitting">
            <Icon icon="mdi:login" />
            {{ submitText }}
          </button>
        </form>

        <button type="button" class="recovery-link" :aria-expanded="showRecovery" @click="showRecovery = !showRecovery">
          忘记公司所有者凭证？
        </button>
        <section v-if="showRecovery" class="recovery-help" aria-label="公司所有者账号恢复">
          <OwnerRecoveryPanel :mail-ready="ownerMailReady" />
          <h3>备用方式：授权运维恢复</h3>
          <p>联系持有公司服务器或密钥库独立访问权限的授权运维。运维可在受保护的终端轮换公司所有者凭证，无需旧凭证。</p>
          <ol>
            <li>通过事先约定的独立渠道确认账号持有人。</li>
            <li>记录恢复原因并轮换凭证，旧凭证和已有后台会话随即失效。</li>
            <li>将新凭证保存在密码管理器中，并核查恢复审计记录。</li>
          </ol>
          <p>不要在聊天或邮件中发送旧凭证、新凭证或服务器密钥。普通公司账号的邮件找回不会授予公司所有者权限。</p>
          <a v-if="companyRecoveryUrl" :href="companyRecoveryUrl" target="_blank" rel="noopener noreferrer">找回普通公司账号密码</a>
          <RouterLink v-if="authStore.isLoggedIn" to="/back-office">返回积分后台</RouterLink>
        </section>

        <p class="login-hint">
          普通用户可自行注册公司账号；代理商机制为可选功能，不影响用户自行注册。
        </p>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
.back-office-login {
  display: grid;
  min-height: 100vh;
  grid-template-columns: minmax(380px, 42%) minmax(0, 58%);
  background: #fff;
  color: #0f172a;
}

.login-brand-panel {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  justify-content: space-between;
  background: #0f172a;
  color: #fff;
  padding: 56px;
}

.login-brand-row,
.login-brand-foot {
  display: flex;
  align-items: center;
  gap: 14px;
}

.login-brand-logo {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 8px;
  background: #2563eb;
  font-weight: 900;
}

.login-brand-row strong {
  display: block;
  font-size: 16px;
}

.login-brand-row small,
.login-brand-panel p,
.login-brand-foot {
  color: #cbd5e1;
}

.login-brand-panel h1 {
  margin: 70px 0 16px;
  max-width: 560px;
  font-size: 38px;
  line-height: 1.2;
}

.login-brand-panel p {
  max-width: 560px;
  margin: 0;
  line-height: 1.8;
}

.login-brand-foot {
  font-size: 13px;
  font-weight: 700;
}

.login-panel {
  display: grid;
  place-items: center;
  padding: 44px;
}

.login-card {
  width: min(560px, 100%);
}

.login-card h2 {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 900;
}

.login-card > p {
  margin: 0 0 24px;
  color: #64748b;
  line-height: 1.65;
}

.login-form {
  display: grid;
  gap: 12px;
}

.login-form label {
  display: grid;
  gap: 7px;
  color: #334155;
  font-size: 13px;
  font-weight: 800;
}

.login-form input {
  min-height: 44px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 12px 13px;
  font: inherit;
}

.login-error {
  margin: 0;
  border: 1px solid #fecdd3;
  border-radius: 8px;
  background: #fff1f2;
  color: #be123c;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 700;
}

.login-submit {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 8px;
  background: #1d4ed8;
  color: #fff;
  padding: 10px 13px;
  font: inherit;
  font-weight: 900;
  cursor: pointer;
}

.login-submit:disabled {
  cursor: wait;
  opacity: 0.72;
}

.login-hint {
  margin-top: 12px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
}

@media (max-width: 900px) {
  .back-office-login {
    grid-template-columns: minmax(0, 1fr);
  }

  .login-brand-panel {
    min-height: auto;
    padding: 34px;
  }

  .login-brand-panel h1 {
    margin-top: 38px;
    font-size: 30px;
  }

  .login-panel {
    padding: 18px;
  }
}
</style>

<style scoped>
.recovery-link{border:0;background:transparent;color:#2f6bff;padding:14px 0;font-weight:600;text-align:left}
.recovery-help{margin:0 0 16px;padding:16px;border:1px solid #dbe4ff;border-radius:10px;background:#f5f7ff;font-size:13px;line-height:1.7;color:#475569}
.recovery-help h3{margin:0 0 8px;color:#0f172a;font-size:16px}.recovery-help ol{padding-left:20px}.recovery-help a{display:block;margin-top:10px;color:#2f6bff}
</style>
