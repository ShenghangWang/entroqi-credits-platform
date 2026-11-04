import axios, { AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios'






type ErrorMessageRule = {
  matches: string[]
  text: string
}

const errorMessageRules: ErrorMessageRule[] = [
  {matches:['login is required'],text:'请先登录后再操作'},
  {matches:['insufficient balance','available balance is not enough'],text:'积分不足，请检查账户余额'},
  {matches:['price history changed','published price changed'],text:'方案已被其他操作员修改，请刷新并复核后重试'},
  {matches:['cost evidence has expired'],text:'成本证据已过期，请重新测算并复核'},
  {matches:['calculator retail price must match'],text:'测算售价与保存售价不一致，请重新测算'},
]

export function normalizeApiErrorMessage(message: string) {
  if (!message) return ''

  const normalized = message.toLowerCase()

  for (const rule of errorMessageRules) {
    if (rule.matches.some((item) => normalized.includes(item.toLowerCase()))) {
      return rule.text
    }
  }

  return message
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 20_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

http.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    const { response } = error
    let backendMessage = ''

    if (response) {
      const status = response.status
      const data = response.data as { message?: unknown } | undefined
      backendMessage = normalizeApiErrorMessage(
        typeof data?.message === 'string' ? data.message : '',
      )

      switch (status) {
        case 401:


          if (!['/back-office/login', '/back-office/recovery', '/back-office'].includes(window.location.pathname)) {
            window.location.href = '/back-office/login'
          }
          break
        case 403:
          console.error('没有权限访问该资源')
          break
        case 404:
          console.error('请求的资源不存在')
          break
        case 500:
          console.error('服务器内部错误')
          break
        default:
          console.error(backendMessage || '请求失败')
      }
    } else if (axios.isCancel(error)) {
      return Promise.reject(error)
    } else {
      backendMessage = '网络错误，请检查网络连接'
      console.error(backendMessage)
    }

    return Promise.reject(backendMessage ? new Error(backendMessage) : error)
  },
)

export const request = {
  get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    return http.get<T>(url, config).then(response => response.data)
  },

  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    return http.post<T>(url, data, config).then(response => response.data)
  },

  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    return http.put<T>(url, data, config).then(response => response.data)
  },

  delete: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    return http.delete<T>(url, config).then(response => response.data)
  },

  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    return http.patch<T>(url, data, config).then(response => response.data)
  },
}

export default http
