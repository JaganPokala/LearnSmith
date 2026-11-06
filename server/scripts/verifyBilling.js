import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { once } from 'node:events';
import mongoose from 'mongoose';
import express from 'express';
import dotenv from 'dotenv';
import BillingAccount from '../models/BillingAccount.js';
import BillingEvent from '../models/BillingEvent.js';
import DailyUsage from '../models/DailyUsage.js';
import { createBillingService } from '../services/billingService.js';
import { createBillingRouter, createBillingWebhook } from '../routes/billing.js';
import { consumeDailyQuota } from '../services/usageService.js';
import { getEntitlement } from '../services/entitlementService.js';
import { getUsage } from '../controllers/usageController.js';
import { ApiError, errorHandler } from '../middlewares/errorHandler.js';
import { createRazorpayClient } from '../services/razorpayClient.js';

dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });
const owner = `billing-test:${randomUUID()}`;
const stranger = `${owner}:other`;
const owners = [owner, stranger, `${owner}:unknown`, `${owner}:bad-plan`];
const eventPrefix = `billing_${randomUUID().replaceAll('-', '')}`;
const settings = { enabled: true, mode: 'test', keyId: 'rzp_test_fixture', keySecret: 'test-key-secret',
  webhookSecret: 'test-webhook-secret-at-least-24-characters', planId: 'plan_fixture' };
let instant = new Date();
const start = Math.floor(instant.getTime() / 1000) - 60;
const end = start + 30 * 86400;
const subscription = { id: 'sub_' + randomUUID().replaceAll('-', ''), plan_id: settings.planId,
  quantity: 1, total_count: 12, status: 'created' };
const invoice = { id: 'inv_fixture', subscription_id: subscription.id, payment_id: 'pay_fixture',
  status: 'paid', amount: 5000, amount_paid: 5000, amount_due: 0, currency: 'INR',
  partial_payment: false, billing_start: start, billing_end: end };
let invoices = [];
let payment = { id: 'pay_fixture', invoice_id: invoice.id, status: 'captured', amount: 5000, currency: 'INR', amount_refunded: 0 };
let createCalls = 0;
let readCalls = 0;
let cancelCalls = 0;
const provider = {
  fetchPlan: async () => ({ id: settings.planId, period: 'monthly', interval: 1, item: { amount: 5000, currency: 'INR' } }),
  createSubscription: async () => { createCalls += 1; return { ...subscription }; },
  fetchSubscription: async () => { readCalls += 1; return { ...subscription }; },
  fetchInvoices: async () => ({ count: invoices.length, items: structuredClone(invoices) }),
  fetchPayment: async () => ({ ...payment }),
  cancelSubscription: async () => { cancelCalls += 1; subscription.status = 'cancelled'; return { ...subscription }; },
};
const service = createBillingService({ settings, provider, now: () => new Date(instant) });
const sign = (body, secret = settings.webhookSecret) => createHmac('sha256', secret).update(body).digest('hex');
const eventBody = (event = 'subscription.charged') => JSON.stringify({ event, payload: { subscription: { entity: { id: subscription.id, status: 'active' } } } });

async function verify() {
  assert.ok(process.env.TEST_MONGO_URI, 'Set TEST_MONGO_URI first.');
  let server;
  try {
    await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: 'learnsmith_generation_test', serverSelectionTimeoutMS: 8000 });
    await Promise.all([BillingAccount.init(), BillingEvent.init(), DailyUsage.init()]);
    const app = express();
    // Same ordering as production: exact bytes and no guest/JWT requirement.
    app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), createBillingWebhook({ service }));
    app.use(express.json());
    app.use((req, res, next) => { req.creator = req.get('X-Test-Owner') ?? owner; req.identityType = req.get('X-Test-Identity') ?? 'user'; next(); });
    app.use('/api/billing', createBillingRouter({ service, settings, limiter: (req, res, next) => next() }));
    app.get('/api/usage', getUsage);
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function request(path, { method = 'GET', body, creator = owner, identityType = 'user', headers = {}, raw } = {}) {
      const response = await fetch(`${base}${path}`, { method,
        headers: { 'X-Test-Owner': creator, 'X-Test-Identity': identityType,
          ...(body === undefined && raw === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), signal: AbortSignal.timeout(20000) });
      return { status: response.status, body: await response.json(), headers: response.headers };
    }
    assert.equal((await request('/billing/plan', { identityType: 'guest' })).body.pro.amount, 5000);
    assert.equal((await request('/billing/checkout', { method: 'POST', body: {}, identityType: 'guest' })).status, 401);
    assert.equal((await request('/billing/status')).body.account.tier, 'free');
    assert.equal(await BillingAccount.countDocuments({ creator: owner }), 0);
    const checkoutResults = await Promise.all(Array.from({ length: 5 }, () => request('/billing/checkout', { method: 'POST', body: { amount: 1, creator: stranger, tier: 'pro' } })));
    assert.equal(createCalls, 1);
    assert.ok(checkoutResults.some((result) => result.status === 200));
    assert.ok(checkoutResults.every((result) => [200, 409].includes(result.status)));
    const checkout = await request('/billing/checkout', { method: 'POST', body: {} });
    assert.equal(checkout.body.checkout.subscriptionId, subscription.id);
    assert.equal(checkout.body.checkout.amount, 5000);
    assert.equal(createCalls, 1);
    assert.equal(await BillingAccount.countDocuments({ creator: stranger }), 0);
    assert.equal(JSON.stringify(checkout.body).includes(settings.keySecret), false);
    console.log('PASS: Guests cannot subscribe; checkout ownership/price are server-controlled; concurrent/repeated checkout creates one subscription and exposes no secret.');

    const callback = { razorpay_subscription_id: subscription.id, razorpay_payment_id: 'pay_fixture',
      razorpay_signature: sign(`pay_fixture|${subscription.id}`, settings.keySecret), isPro: true };
    assert.equal((await request('/billing/verify', { method: 'POST', body: { ...callback, razorpay_signature: '0'.repeat(64) } })).status, 400);
    assert.equal((await request('/billing/verify', { method: 'POST', body: callback, creator: stranger })).status, 404);
    subscription.status = 'active';
    let verified = await request('/billing/verify', { method: 'POST', body: callback });
    assert.equal(verified.body.account.tier, 'free', 'A valid checkout signature and active mandate are not proof of a paid invoice.');
    invoices = [{ ...invoice, status: 'issued', amount_paid: 0, amount_due: 5000 }];
    assert.equal((await service.sync(owner)).tier, 'free');
    invoices = [{ ...invoice }];
    payment.amount_refunded = 5000;
    assert.equal((await service.sync(owner)).tier, 'free');
    payment.amount_refunded = 0;
    verified = await request('/billing/verify', { method: 'POST', body: callback });
    assert.equal(verified.body.account.tier, 'pro');
    assert.equal((await getEntitlement({ creator: owner, identityType: 'user', now: instant })).limits.courses, 10);
    assert.equal((await getEntitlement({ creator: owner, identityType: 'guest', now: instant })).tier, 'guest');
    console.log('PASS: Signatures, ownership, full paid invoices, captured payments and refunds are checked before Pro; an active mandate alone grants nothing.');

    await DailyUsage.create({ creator: owner, day: instant.toISOString().slice(0, 10), courses: 3, lessons: 0, audio: 0 });
    const quota = await Promise.allSettled(Array.from({ length: 12 }, () => consumeDailyQuota({ creator: owner, identityType: 'user', resource: 'courses', now: instant })));
    assert.equal(quota.filter((result) => result.status === 'fulfilled').length, 7);
    assert.equal((await DailyUsage.findOne({ creator: owner })).courses, 10);
    const usage = await request('/usage');
    assert.equal(usage.body.tier, 'pro');
    assert.equal(usage.body.quota.courses.used, 10);
    assert.equal(usage.body.quota.courses.remaining, 0);
    assert.equal(usage.body.quota.lessons.limit, 50);
    assert.match(usage.headers.get('cache-control'), /no-store/);
    console.log('PASS: Upgrades preserve daily usage; concurrent Pro generation admissions stop at the higher server-side limit.');

    const raw = eventBody();
    assert.equal((await request('/billing/webhook', { method: 'POST', raw, headers: { 'X-Razorpay-Signature': 'bad', 'X-Razorpay-Event-Id': `${eventPrefix}_bad` } })).status, 400);
    const eventId = `${eventPrefix}_charged`;
    const headers = { 'X-Razorpay-Signature': sign(raw), 'X-Razorpay-Event-Id': eventId };
    assert.equal((await request('/billing/webhook', { method: 'POST', raw, headers })).status, 200);
    const readCount = readCalls;
    assert.equal((await request('/billing/webhook', { method: 'POST', raw, headers })).body.replayed, true);
    assert.equal(readCalls, readCount);
    assert.equal(await BillingEvent.countDocuments({ eventId }), 1);
    const changedBytes = raw + ' ';
    assert.equal((await request('/billing/webhook', { method: 'POST', raw: changedBytes, headers })).status, 400);
    console.log('PASS: Webhooks verify exact raw bytes without browser identity; processed event IDs deduplicate delivery.');

    const cancelled = await request('/billing/cancel', { method: 'POST', body: {} });
    assert.equal(cancelled.body.account.status, 'cancelled');
    assert.equal(cancelled.body.account.tier, 'pro');
    assert.equal(cancelCalls, 1);
    await service.sync(owner, { cancel: true });
    assert.equal(cancelCalls, 1);
    const late = eventBody('subscription.activated');
    await service.webhook(Buffer.from(late), sign(late), `${eventPrefix}_late`);
    assert.equal((await service.read(owner)).status, 'cancelled', 'Delayed activation must not overwrite current provider cancellation.');
    instant = new Date((end + 1) * 1000);
    assert.equal((await service.read(owner)).tier, 'free');
    assert.equal((await getEntitlement({ creator: owner, identityType: 'user', now: instant })).limits.courses, 3);
    subscription.status = 'pending';
    await service.sync(owner);
    assert.equal((await service.read(owner)).tier, 'free');
    console.log('PASS: Cancellation stops future billing but preserves paid time; delayed events use current state, expired access and failed renewals revert to Free.');

    let unknownCreates = 0;
    const uncertain = createBillingService({ settings, provider: { ...provider, createSubscription: async () => { unknownCreates += 1; throw new ApiError(503, 'billing_provider_unavailable', 'Simulated lost response'); } } });
    await assert.rejects(uncertain.checkout(owners[2]));
    await assert.rejects(uncertain.checkout(owners[2]), (error) => error.code === 'checkout_uncertain');
    assert.equal(unknownCreates, 1);
    const invalidPlan = createBillingService({ settings, provider: { ...provider, fetchPlan: async () => ({ id: settings.planId, period: 'monthly', interval: 1, item: { amount: 1, currency: 'INR' } }) } });
    await assert.rejects(invalidPlan.checkout(owners[3]), (error) => error.code === 'billing_plan_mismatch');
    assert.equal(createCalls, 1);
    let networkCalls = 0;
    const liveClient = createRazorpayClient({ settings: { ...settings, keyId: 'rzp_live_forbidden' }, request: async () => { networkCalls += 1; } });
    await assert.rejects(liveClient.fetchPlan(settings.planId));
    assert.equal(networkCalls, 0);
    console.log('PASS: Unknown create outcomes cannot start a duplicate mandate; wrong-priced plans and mismatched key modes fail before provider creation.');

    let enterOld;
    let releaseOld;
    const entered = new Promise((resolve) => { enterOld = resolve; });
    const released = new Promise((resolve) => { releaseOld = resolve; });
    const old = createBillingService({ settings, now: () => new Date(instant), provider: { ...provider,
      fetchInvoices: async () => { enterOld(); await released; return { count: 0, items: [] }; },
    } });
    const oldResult = old.sync(owner).then((value) => ({ value }), (error) => ({ error }));
    await entered;
    instant = new Date(instant.getTime() + 36000);
    const newStart = Math.floor(instant.getTime() / 1000) - 30;
    invoices = [{ ...invoice, billing_start: newStart, billing_end: newStart + 30 * 86400 }];
    subscription.status = 'active';
    try {
      assert.equal((await service.sync(owner)).tier, 'pro');
    } finally { releaseOld(); }
    assert.equal((await oldResult).error?.code, 'billing_sync_expired');
    assert.equal((await service.read(owner)).tier, 'pro');
    assert.equal((await service.read(owner)).paidThrough.toISOString(), new Date((newStart + 30 * 86400) * 1000).toISOString());
    console.log('PASS: An expired synchronization cannot overwrite a newer owner’s verified paid period or clear its lease.');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      await BillingEvent.deleteMany({ eventId: { $regex: `^${eventPrefix}_` } });
      await BillingAccount.deleteMany({ creator: { $in: owners } });
      await DailyUsage.deleteMany({ creator: { $in: owners } });
    }
    await mongoose.disconnect();
  }
}

verify().catch((error) => { console.error('FAIL:', error); process.exitCode = 1; });
