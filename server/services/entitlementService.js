import { billingAccountModel } from '../models/BillingAccount.js';
import { getDailyLimits } from '../config/usageLimits.js';
import { billingConfig } from '../config/billing.js';

export function hasPaidAccess(account, now = new Date(), mode = billingConfig.mode) {
  return ['test', 'live'].includes(mode) && account?.mode === mode && account.verifiedAt instanceof Date &&
    account.paidFrom instanceof Date && account.paidThrough instanceof Date &&
    account.paidFrom <= now && account.paidThrough > now;
}

export async function getEntitlement({ creator, identityType, now = new Date(), mode = billingConfig.mode }) {
  if (identityType === 'guest') return { tier: 'guest', limits: getDailyLimits('guest'), expiresAt: null };
  if (identityType !== 'user') throw new Error('Unknown identity type.');
  const account = await billingAccountModel(mode).findOne({ creator, mode }).select('mode paidFrom paidThrough verifiedAt').lean();
  const tier = hasPaidAccess(account, now, mode) ? 'pro' : 'free';
  return { tier, limits: getDailyLimits('user', tier), expiresAt: tier === 'pro' ? account.paidThrough : null };
}
