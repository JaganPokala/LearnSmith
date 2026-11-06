import { ApiError } from '../middlewares/errorHandler.js';
import { billingConfig, PRO_PLAN } from '../config/billing.js';
import { validBillingKey } from '../config/billingMode.js';

export function createRazorpayClient({ settings = billingConfig, request = fetch } = {}) {
  async function call(method, path, body) {
    if (!validBillingKey(settings.mode ?? 'test', settings.keyId) || !settings.keySecret) {
      throw new ApiError(503, 'billing_not_configured', 'Subscription checkout is unavailable.');
    }
    let response;
    let data;
    try {
      response = await request(`https://api.razorpay.com/v1${path}`, {
        method, signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Basic ${Buffer.from(`${settings.keyId}:${settings.keySecret}`).toString('base64')}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      data = await response.json();
    } catch {
      // Do not retry a create request: a timeout cannot prove it was not saved.
      throw new ApiError(503, 'billing_provider_unavailable', 'Could not confirm the subscription with the payment provider.');
    }
    if (!response.ok) {
      const error = new ApiError(502, 'billing_provider_error', 'The payment provider could not complete this request.');
      error.providerStatus = response.status;
      error.definitiveRejection = response.status >= 400 && response.status < 500 && response.status !== 408;
      throw error;
    }
    return data;
  }
  function id(value, prefix) {
    if (typeof value !== 'string' || !new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value)) throw new Error('Invalid stored provider ID.');
    return encodeURIComponent(value);
  }
  return {
    listPlans: () => call('GET', '/plans?count=100'),
    createPlan: () => call('POST', '/plans', { period: PRO_PLAN.period, interval: PRO_PLAN.interval,
      item: { name: PRO_PLAN.name, amount: PRO_PLAN.amount, currency: PRO_PLAN.currency } }),
    fetchPlan: (planId) => call('GET', `/plans/${id(planId, 'plan')}`),
    createSubscription: ({ planId, attemptId, accountId }) => call('POST', '/subscriptions', {
      plan_id: planId, quantity: 1, total_count: PRO_PLAN.totalCycles, customer_notify: false,
      notes: { learnsmith_attempt: attemptId, learnsmith_account: String(accountId) },
    }),
    fetchSubscription: (subscriptionId) => call('GET', `/subscriptions/${id(subscriptionId, 'sub')}`),
    fetchInvoices: (subscriptionId) => call('GET', `/invoices?subscription_id=${id(subscriptionId, 'sub')}&count=100`),
    fetchPayment: (paymentId) => call('GET', `/payments/${id(paymentId, 'pay')}`),
    cancelSubscription: (subscriptionId) => call('POST', `/subscriptions/${id(subscriptionId, 'sub')}/cancel`, { cancel_at_cycle_end: false }),
  };
}
