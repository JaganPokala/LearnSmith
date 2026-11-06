import { randomUUID } from 'node:crypto';
import { billingAccountModel } from '../models/BillingAccount.js';
import { billingEventModel } from '../models/BillingEvent.js';
import { validBillingKey } from '../config/billingMode.js';
import { billingConfig, PRO_PLAN } from '../config/billing.js';
import { hasPaidAccess } from './entitlementService.js';
import { createRazorpayClient } from './razorpayClient.js';
import { validSignature, validateProviderPlan, validateProviderSubscription, selectPaidInvoice, paymentCoversInvoice } from './billingValidation.js';
import { ApiError } from '../middlewares/errorHandler.js';

const TERMINAL = ['cancelled', 'completed', 'expired'];
const EVENTS = new Set(['subscription.authenticated', 'subscription.activated', 'subscription.charged',
  'subscription.completed', 'subscription.updated', 'subscription.pending', 'subscription.halted',
  'subscription.cancelled', 'subscription.paused', 'subscription.resumed']);

export function billingAccountView(account, now = new Date(), mode = billingConfig.mode) {
  return { mode, tier: hasPaidAccess(account, now, mode) ? 'pro' : 'free', status: account?.status ?? 'none',
    checkoutState: account?.checkoutState ?? 'none', paidThrough: account?.paidThrough ?? null,
    renewalStopped: TERMINAL.includes(account?.status), canCancel: Boolean(account?.subscriptionId && !TERMINAL.includes(account.status)),
    canCheckout: Boolean(account?.subscriptionId && ['created', 'authenticated'].includes(account.status)),
    verifiedAt: account?.verifiedAt ?? null };
}

export function createBillingService({ settings = billingConfig, provider = createRazorpayClient({ settings }), now = () => new Date() } = {}) {
  const BillingAccount = billingAccountModel(settings.mode);
  const BillingEvent = billingEventModel(settings.mode);
  const view = (account) => billingAccountView(account, now(), settings.mode);
  function requireConfigured() {
    if (!settings.enabled || !validBillingKey(settings.mode, settings.keyId)) {
      throw new ApiError(503, 'billing_not_configured', 'Subscription checkout is unavailable on this deployment.');
    }
  }

  async function read(creator) {
    return view(await BillingAccount.findOne({ creator, mode: settings.mode }).lean());
  }

  async function ensureAccount(creator) {
    await BillingAccount.init();
    try { await BillingAccount.updateOne({ creator, mode: settings.mode }, { $setOnInsert: { creator, mode: settings.mode } }, { upsert: true, runValidators: true }); }
    catch (err) { if (!(err.code === 11000 && err.keyPattern?.creator === 1)) throw err; }
    return BillingAccount.findOne({ creator }).lean();
  }

  function checkoutView(account) {
    return { account: view(account), checkout: { keyId: settings.keyId, subscriptionId: account.subscriptionId,
      name: PRO_PLAN.name, amount: PRO_PLAN.amount, currency: PRO_PLAN.currency, totalCycles: PRO_PLAN.totalCycles, mode: settings.mode } };
  }

  async function checkout(creator) {
    requireConfigured();
    const account = await ensureAccount(creator);
    if (account.subscriptionId) {
      if (['created', 'authenticated'].includes(account.status)) return checkoutView(account);
      if (!TERMINAL.includes(account.status) || hasPaidAccess(account, now(), settings.mode)) {
        throw new ApiError(409, 'subscription_exists', 'Manage your existing subscription before starting another.');
      }
    } else if (['creating', 'unknown'].includes(account.checkoutState)) {
      // An uncertain provider response must never trigger a second mandate.
      throw new ApiError(409, 'checkout_uncertain', 'Checkout setup is not confirmed. Its status must be checked before creating another subscription.');
    }
    const attemptId = randomUUID();
    const claimed = await BillingAccount.findOneAndUpdate({ _id: account._id,
      checkoutAttemptId: account.checkoutAttemptId, subscriptionId: account.subscriptionId ?? { $exists: false },
      $or: [{ syncExpiresAt: null }, { syncExpiresAt: { $lte: now() } }],
    }, { $set: { checkoutAttemptId: attemptId, checkoutState: 'creating', status: 'creating', planId: settings.planId,
      paidFrom: null, paidThrough: null, verifiedAt: null, syncAttemptId: null, syncExpiresAt: null }, $unset: { subscriptionId: '' } },
    { returnDocument: 'after', runValidators: true });
    if (!claimed) throw new ApiError(409, 'billing_busy', 'Another subscription update is in progress. Refresh its status shortly.');
    let createStarted = false;
    try {
      validateProviderPlan(await provider.fetchPlan(settings.planId), settings.planId);
      createStarted = true;
      const subscription = await provider.createSubscription({ planId: settings.planId, attemptId, accountId: claimed._id });
      validateProviderSubscription(subscription, { planId: settings.planId });
      const saved = await BillingAccount.findOneAndUpdate({ _id: claimed._id, checkoutAttemptId: attemptId, checkoutState: 'creating' },
        { $set: { subscriptionId: subscription.id, status: subscription.status, checkoutState: 'ready' } }, { returnDocument: 'after', runValidators: true });
      if (!saved) throw new ApiError(503, 'checkout_uncertain', 'Could not confirm checkout setup. Refresh the subscription status before trying again.');
      return checkoutView(saved);
    } catch (error) {
      await BillingAccount.updateOne({ _id: claimed._id, checkoutAttemptId: attemptId, checkoutState: 'creating' },
        { $set: { checkoutState: !createStarted || error.definitiveRejection ? 'failed' : 'unknown', status: 'unknown' } });
      throw error;
    }
  }

  async function syncAccount(account, { cancel = false } = {}) {
    requireConfigured();
    if (!account?.subscriptionId) return view(account);
    if (account.mode !== settings.mode) throw new ApiError(409, 'billing_mode_mismatch', 'Subscription belongs to another billing mode.');
    const syncAttemptId = randomUUID();
    const claimed = await BillingAccount.findOneAndUpdate({ _id: account._id, subscriptionId: account.subscriptionId,
      $or: [{ syncExpiresAt: null }, { syncExpiresAt: { $lte: now() } }],
    }, { $set: { syncAttemptId, syncExpiresAt: new Date(now().getTime() + 35000) } }, { returnDocument: 'after' });
    if (!claimed) throw new ApiError(503, 'billing_busy', 'Another subscription update is in progress. Refresh its status shortly.');
    try {
      let subscription = await provider.fetchSubscription(claimed.subscriptionId);
      validateProviderSubscription(subscription, { subscriptionId: claimed.subscriptionId, planId: claimed.planId });
      const invoice = selectPaidInvoice(await provider.fetchInvoices(claimed.subscriptionId), claimed.subscriptionId, now());
      const paid = invoice && paymentCoversInvoice(await provider.fetchPayment(invoice.payment_id), invoice);
      if (cancel && !TERMINAL.includes(subscription.status)) {
        // Stop future renewals now, retaining only the already-paid interval.
        subscription = await provider.cancelSubscription(claimed.subscriptionId);
        validateProviderSubscription(subscription, { subscriptionId: claimed.subscriptionId, planId: claimed.planId });
        if (subscription.status !== 'cancelled') throw new ApiError(503, 'cancellation_unconfirmed', 'Could not confirm cancellation. Refresh the subscription status before trying again.');
      }
      const saved = await BillingAccount.findOneAndUpdate({ _id: claimed._id, subscriptionId: claimed.subscriptionId,
        syncAttemptId, syncExpiresAt: { $gt: now() } }, { $set: {
        status: subscription.status, verifiedAt: now(),
        paidFrom: paid ? new Date(invoice.billing_start * 1000) : null,
        paidThrough: paid ? new Date(invoice.billing_end * 1000) : null,
      } }, { returnDocument: 'after', runValidators: true });
      if (!saved) throw new ApiError(503, 'billing_sync_expired', 'The subscription check expired. Refresh its status again.');
      return view(saved);
    } finally {
      await BillingAccount.updateOne({ _id: claimed._id, syncAttemptId }, { $set: { syncAttemptId: null, syncExpiresAt: null } });
    }
  }

  async function sync(creator, options) {
    return syncAccount(await BillingAccount.findOne({ creator }).lean(), options);
  }

  async function verify(creator, body = {}) {
    requireConfigured();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'payment_signature_invalid', 'Invalid checkout response.');
    const account = await BillingAccount.findOne({ creator }).lean();
    if (!account?.subscriptionId) throw new ApiError(404, 'subscription_not_found', 'No subscription is available for this account.');
    if (body.razorpay_subscription_id !== account.subscriptionId || typeof body.razorpay_payment_id !== 'string' || !/^pay_[A-Za-z0-9]+$/.test(body.razorpay_payment_id) ||
      !validSignature(`${body.razorpay_payment_id}|${account.subscriptionId}`, body.razorpay_signature, settings.keySecret)) {
      throw new ApiError(400, 'payment_signature_invalid', 'Could not verify the checkout response.');
    }
    // The callback signature is not sufficient to grant paid access. Read the
    // current subscription, paid invoices and captured payment from Razorpay.
    return syncAccount(account);
  }

  async function webhook(rawBody, signature, eventId) {
    requireConfigured();
    if (!Buffer.isBuffer(rawBody) || !validSignature(rawBody, signature, settings.webhookSecret)) {
      throw new ApiError(400, 'webhook_signature_invalid', 'Invalid payment notification signature.');
    }
    let body;
    try { body = JSON.parse(rawBody.toString('utf8')); }
    catch { throw new ApiError(400, 'invalid_webhook', 'Invalid payment notification.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'invalid_webhook', 'Invalid payment notification.');
    if (!EVENTS.has(body.event)) return { ignored: true };
    const subscriptionId = body.payload?.subscription?.entity?.id;
    if (typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(eventId) || typeof subscriptionId !== 'string' || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) {
      throw new ApiError(400, 'invalid_webhook', 'Invalid payment notification identifiers.');
    }
    await BillingEvent.init();
    const existing = await BillingEvent.findOne({ eventId }).lean();
    if (existing) {
      if (existing.subscriptionId !== subscriptionId || existing.event !== body.event) throw new ApiError(400, 'webhook_event_conflict', 'Conflicting payment notification.');
      return { replayed: true };
    }
    const account = await BillingAccount.findOne({ subscriptionId }).lean();
    if (!account) return { ignored: true };
    // Event order is not trusted. Fetch current provider state under a fenced
    // lease; duplicates never add days or increment a quota counter.
    await syncAccount(account);
    try { await BillingEvent.create({ eventId, event: body.event, subscriptionId, processedAt: now() }); }
    catch (err) { if (!(err.code === 11000 && err.keyPattern?.eventId === 1)) throw err; }
    return { processed: true };
  }

  return { read, checkout, sync, verify, webhook };
}

export const billingService = createBillingService();
