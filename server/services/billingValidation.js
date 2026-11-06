import { createHmac, timingSafeEqual } from 'node:crypto';
import { PRO_PLAN } from '../config/billing.js';
import { ApiError } from '../middlewares/errorHandler.js';

export function validSignature(message, signature, secret) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature) || typeof secret !== 'string' || !secret) return false;
  return timingSafeEqual(createHmac('sha256', secret).update(message).digest(), Buffer.from(signature, 'hex'));
}

export function validateProviderPlan(plan, planId) {
  if (plan?.id !== planId || plan.period !== 'monthly' || plan.interval !== 1 ||
      plan.item?.amount !== PRO_PLAN.amount || plan.item?.currency !== PRO_PLAN.currency) {
    throw new ApiError(503, 'billing_plan_mismatch', 'The subscription plan is unavailable.');
  }
}

const STATUSES = ['created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired', 'paused'];
export function validateProviderSubscription(subscription, { subscriptionId, planId }) {
  if (typeof subscription?.id !== 'string' || !/^sub_[A-Za-z0-9]+$/.test(subscription.id) || (subscriptionId && subscription.id !== subscriptionId) ||
      subscription.plan_id !== planId || subscription.quantity !== 1 || !STATUSES.includes(subscription.status) ||
      subscription.total_count !== PRO_PLAN.totalCycles) {
    throw new ApiError(502, 'billing_response_invalid', 'Could not verify the subscription details.');
  }
}

// An active mandate alone does not prove payment. Select an invoice that was
// fully paid for a monthly period covering now, then verify its captured payment.
export function selectPaidInvoice(invoices, subscriptionId, now = new Date()) {
  if (!Array.isArray(invoices?.items) || invoices.items.length > 100 || !Number.isSafeInteger(invoices.count) || invoices.count !== invoices.items.length) {
    throw new ApiError(502, 'billing_response_invalid', 'Could not verify the subscription invoices.');
  }
  const seconds = Math.floor(now.getTime() / 1000);
  return invoices.items.filter((invoice) => invoice?.subscription_id === subscriptionId &&
    /^inv_[A-Za-z0-9]+$/.test(invoice.id ?? '') && /^pay_[A-Za-z0-9]+$/.test(invoice.payment_id ?? '') &&
    invoice.status === 'paid' && invoice.currency === PRO_PLAN.currency && invoice.amount === PRO_PLAN.amount &&
    invoice.amount_paid === PRO_PLAN.amount && invoice.amount_due === 0 && !invoice.partial_payment &&
    Number.isSafeInteger(invoice.billing_start) && Number.isSafeInteger(invoice.billing_end) &&
    invoice.billing_start <= seconds && invoice.billing_end > seconds &&
    invoice.billing_end - invoice.billing_start <= 35 * 86400 && invoice.billing_end > invoice.billing_start)
    .sort((a, b) => b.billing_end - a.billing_end)[0] ?? null;
}

export function paymentCoversInvoice(payment, invoice) {
  return payment?.id === invoice.payment_id && payment.invoice_id === invoice.id &&
    payment.status === 'captured' && payment.amount === PRO_PLAN.amount && payment.currency === PRO_PLAN.currency &&
    payment.amount_refunded === 0;
}
