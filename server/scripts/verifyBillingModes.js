import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { billingAccountModel } from '../models/BillingAccount.js';
import { billingEventModel } from '../models/BillingEvent.js';
import { createBillingService } from '../services/billingService.js';
import { getEntitlement } from '../services/entitlementService.js';

dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });
const creator = `billing-modes:${randomUUID()}`;
const eventId = `modes_${randomUUID()}`;
const subscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;
const now = Math.floor(Date.now() / 1000);
const hmac = (body, secret) => createHmac('sha256', secret).update(body).digest('hex');

async function verify() {
  assert.ok(process.env.TEST_MONGO_URI);
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: 'learnsmith_generation_test', serverSelectionTimeoutMS: 8000 });
  try {
    const Test = billingAccountModel('test');
    const Live = billingAccountModel('live');
    await Promise.all([Test.init(), Live.init()]);
    await Test.create({ creator, subscriptionId, status: 'active', verifiedAt: new Date(), paidFrom: new Date((now - 100) * 1000), paidThrough: new Date((now + 1000) * 1000) });
    assert.equal((await getEntitlement({ creator, identityType: 'user', mode: 'test' })).tier, 'pro');
    assert.equal((await getEntitlement({ creator, identityType: 'user', mode: 'live' })).tier, 'free');
    const settings = { enabled: true, mode: 'live', keyId: 'rzp_live_fixture', keySecret: 'fake-live-secret', webhookSecret: 'fake-live-webhook-secret', planId: 'plan_livefixture' };
    const sub = { id: subscriptionId, plan_id: settings.planId, quantity: 1, total_count: 12, status: 'created' };
    let paid = false;
    let creates = 0;
    const provider = {
      fetchPlan: async () => ({ id: settings.planId, period: 'monthly', interval: 1, item: { amount: 5000, currency: 'INR' } }),
      createSubscription: async () => { creates += 1; return { ...sub }; },
      fetchSubscription: async () => ({ ...sub }),
      fetchInvoices: async () => ({ count: paid ? 1 : 0, items: paid ? [{ id: 'inv_fixture', subscription_id: subscriptionId, payment_id: 'pay_fixture', status: 'paid', currency: 'INR', amount: 5000, amount_paid: 5000, amount_due: 0, partial_payment: false, billing_start: now - 100, billing_end: now + 1000 }] : [] }),
      fetchPayment: async () => ({ id: 'pay_fixture', invoice_id: 'inv_fixture', status: 'captured', amount: 5000, currency: 'INR', amount_refunded: 0 }),
      cancelSubscription: async () => { sub.status = 'cancelled'; return { ...sub }; },
    };
    const service = createBillingService({ settings, provider });
    assert.equal((await service.read(creator)).tier, 'free');
    const result = await service.checkout(creator);
    assert.equal(result.checkout.mode, 'live');
    assert.equal(result.account.tier, 'free');
    await service.checkout(creator);
    assert.equal(creates, 1);
    assert.equal(await Test.countDocuments({ creator }), 1);
    assert.equal(await Live.countDocuments({ creator }), 1);
    sub.status = 'active';
    assert.equal((await service.sync(creator)).tier, 'free');
    paid = true;
    const callback = { razorpay_subscription_id: subscriptionId, razorpay_payment_id: 'pay_fixture', razorpay_signature: hmac(`pay_fixture|${subscriptionId}`, settings.keySecret) };
    await assert.rejects(service.verify(creator, { ...callback, razorpay_signature: hmac(`pay_fixture|${subscriptionId}`, 'fake-test-secret') }), { code: 'payment_signature_invalid' });
    assert.equal((await service.verify(creator, callback)).tier, 'pro');
    assert.equal((await getEntitlement({ creator, identityType: 'user', mode: 'live' })).tier, 'pro');
    const raw = Buffer.from(JSON.stringify({ event: 'subscription.charged', payload: { subscription: { entity: { id: subscriptionId } } } }));
    await billingEventModel('test').create({ eventId, event: 'subscription.charged', subscriptionId, processedAt: new Date() });
    await assert.rejects(service.webhook(raw, hmac(raw, 'fake-test-webhook'), eventId), { code: 'webhook_signature_invalid' });
    assert.equal((await service.webhook(raw, hmac(raw, settings.webhookSecret), eventId)).processed, true);
    assert.equal((await service.webhook(raw, hmac(raw, settings.webhookSecret), eventId)).replayed, true);
    assert.equal((await service.sync(creator, { cancel: true })).status, 'cancelled');
    assert.equal((await Test.findOne({ creator })).status, 'active');
    assert.equal((await service.read(creator)).tier, 'pro');
    console.log('PASS: Fake live checkout, verified paid access, webhook replay, and cancellation remain isolated from test records for the same owner and IDs.');
  } finally {
    for (const mode of ['test', 'live']) {
      await billingAccountModel(mode).deleteMany({ creator });
      await billingEventModel(mode).deleteMany({ eventId });
    }
    await mongoose.disconnect();
  }
}
verify().catch((error) => { console.error('FAIL:', error); process.exitCode = 1; });
