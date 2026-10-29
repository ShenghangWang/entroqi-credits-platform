// Reuses the existing company account-mail Resend adapter's fixed endpoint,
// idempotency, bounded transport and sanitized failure behavior for OTP mail.
export interface OwnerMail { to: string; text: string; kind: 'enroll' | 'recover' | 'changed'; id: string }
export type OwnerMailSender = (mail: OwnerMail) => Promise<void>;
export function createOwnerMailSender(transport: typeof fetch = fetch): OwnerMailSender | undefined {
  const key = process.env.CREDITS_RECOVERY_MAIL_API_KEY, from = process.env.CREDITS_RECOVERY_MAIL_FROM;
  if (!key && !from) return undefined;
  if (process.env.CREDITS_RECOVERY_MAIL_PROVIDER !== 'resend' || !key || /[\r\n]/.test(key) || !from || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) throw new Error('Invalid owner mail configuration');
  return async mail => {
    try {
      const response = await transport('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'Idempotency-Key': 'credits-owner-' + mail.id },
        body: JSON.stringify({ from, to: [mail.to], subject: mail.kind === 'changed' ? 'Entroqi 公司所有者登录凭证已重置' : 'Entroqi 公司所有者邮箱验证码', text: mail.text }),
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error('delivery unavailable');
    } catch { throw new Error('Owner email delivery unavailable'); }
  };
}
