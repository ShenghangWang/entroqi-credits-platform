import { companyApplications } from '../company/registry.js';

export interface PlatformOperator { id: string; displayName?: string; token: string; applications: string[]; role?: 'developer' | 'admin' | 'agent'; subject?: string; pricingPermissions?: ('read'|'write'|'publish')[] }
export function parsePlatformOperators(raw: string): PlatformOperator[] {
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw new Error('Invalid platform operators JSON'); }
  if (!Array.isArray(input) || input.length > 16) throw new Error('Invalid platform operators');
  const ids = new Set<string>(), tokens = new Set<string>();
  for (const row of input as PlatformOperator[]) {
    if (!row || Object.keys(row).some(key => !['applications', 'id', 'displayName', 'token', 'role', 'subject', 'pricingPermissions'].includes(key)) ||
      typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(row.id) || ids.has(row.id) ||
      row.displayName !== undefined && (typeof row.displayName !== 'string' || !row.displayName.trim() || row.displayName.length>80 || [...row.displayName].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)) ||
      typeof row.token !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(row.token) || tokens.has(row.token) ||
      !Array.isArray(row.applications) || !row.applications.length || new Set(row.applications).size !== row.applications.length ||
      row.applications.some(code => !companyApplications.some(app => app.application === code)) ||
      row.role !== undefined && !['developer', 'admin', 'agent'].includes(row.role) ||
      row.subject !== undefined && (typeof row.subject !== 'string' || !/^[A-Za-z0-9_-]{1,191}$/.test(row.subject)) || row.role === 'agent' && !row.subject || row.pricingPermissions !== undefined && (!Array.isArray(row.pricingPermissions) || !row.pricingPermissions.includes('read') || new Set(row.pricingPermissions).size!==row.pricingPermissions.length || row.pricingPermissions.some(permission=>!['read','write','publish'].includes(permission)) || row.role==='agent')) throw new Error('Invalid platform operator');
    ids.add(row.id); tokens.add(row.token);
  }
  return input as PlatformOperator[];
}
