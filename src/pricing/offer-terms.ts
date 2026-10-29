import { BadRequestError } from '../domain/errors.js';
export interface OfferTerms {
  schemaVersion: 1;
  model: 'monthly' | 'version_license';
  licensedVersion: string | null;
  trial: { enabled: boolean; days: number };
  renewal: 'manual';
}
/** Business settings are immutable terms of a price revision, never global
 * switches applied retroactively to an existing customer's accepted contract. */
export function validateOfferTerms(value: unknown, billingType: string): OfferTerms {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestError('Choose the product billing and trial terms');
  const row=value as OfferTerms;
  if (Object.keys(row).sort().join(',')!=='licensedVersion,model,renewal,schemaVersion,trial' || row.schemaVersion!==1 ||
      !['monthly','version_license'].includes(row.model) || row.renewal!=='manual' ||
      billingType!==(row.model==='monthly'?'monthly':'one_time') ||
      (row.model==='monthly' ? row.licensedVersion!==null : typeof row.licensedVersion!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(row.licensedVersion)) ||
      !row.trial || typeof row.trial!=='object' || Object.keys(row.trial).sort().join(',')!=='days,enabled' || typeof row.trial.enabled!=='boolean' ||
      !Number.isInteger(row.trial.days) || (row.trial.enabled ? row.trial.days<1 || row.trial.days>365 : row.trial.days!==0)) throw new BadRequestError('Invalid version license, monthly or free-trial settings');
  return structuredClone(row);
}
