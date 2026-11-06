import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRazorpayClient } from '../services/razorpayClient.js';
import { validSignature, selectPaidInvoice, paymentCoversInvoice, validateProviderPlan } from '../services/billingValidation.js';
import { validBillingKey } from '../config/billingMode.js';
import { hasPaidAccess } from '../services/entitlementService.js';
import { billingAccountModel } from '../models/BillingAccount.js';

async function verify() {
  for (const mode of ['test', 'live']) {
    assert.equal(validBillingKey(mode, `rzp_${mode}_fixture`), true);
    assert.equal(validBillingKey(mode, `rzp_${mode === 'test' ? 'live' : 'test'}_fixture`), false);
    const account = new (billingAccountModel(mode))({ creator: 'fixture' });
    assert.equal(account.mode, mode);
    await account.validate();
    account.mode = mode === 'test' ? 'live' : 'test';
    await assert.rejects(account.validate(), { name: 'ValidationError' });
  }
  assert.equal(validBillingKey('unexpected', 'rzp_test_fixture'), false);
  const interval = { mode: 'test', verifiedAt: new Date(0), paidFrom: new Date(0), paidThrough: new Date('2099-01-01') };
  assert.equal(hasPaidAccess(interval, new Date(), 'live'), false);
  assert.equal(hasPaidAccess({ ...interval, mode: 'live' }, new Date(), 'test'), false);
  let liveRequests = 0;
  await createRazorpayClient({ settings: { mode: 'live', keyId: 'rzp_live_fixture', keySecret: 'fake' }, request: async () => { liveRequests += 1; return Response.json({}); } }).fetchPlan('plan_fixture');
  assert.equal(liveRequests, 1);
  await assert.rejects(createRazorpayClient({ settings: { mode: 'live', keyId: 'rzp_test_fixture', keySecret: 'fake' }, request: async () => { liveRequests += 1; } }).fetchPlan('plan_fixture'));
  assert.equal(liveRequests, 1);
  console.log('PASS: Explicit mode/key matching, isolated model validation, and entitlements reject cross-mode access. Live adapter uses fake HTTP only.');
  const raw = Buffer.from('{"event":"subscription.charged"}');
  const secret = 'fake-webhook-secret';
  const signature = createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(validSignature(raw, signature, secret), true);
  assert.equal(validSignature(Buffer.concat([raw, Buffer.from(' ')]), signature, secret), false);
  for (const malformed of [null, [], '', '0'.repeat(63), 'x'.repeat(64)]) assert.equal(validSignature(raw, malformed, secret), false);
  console.log('PASS: Exact-byte HMAC verification rejects changed payloads and malformed signatures.');

  const now = new Date('2026-11-06T12:00:00Z');
  const seconds = now.getTime() / 1000;
  const invoice = { id: 'inv_fixture', subscription_id: 'sub_fixture', payment_id: 'pay_fixture', status: 'paid', currency: 'INR',
    amount: 5000, amount_paid: 5000, amount_due: 0, partial_payment: false, billing_start: seconds - 100, billing_end: seconds + 100 };
  const page = (item) => ({ count: 1, items: [item] });
  assert.equal(selectPaidInvoice(page(invoice), 'sub_fixture', now), invoice);
  for (const patch of [{ subscription_id: 'sub_foreign' }, { status: 'issued' }, { amount: 1 }, { amount_paid: 100 },
    { currency: 'USD' }, { partial_payment: true }, { amount_due: 1 }, { billing_start: seconds + 1 },
    { billing_end: seconds }, { billing_end: seconds + 40 * 86400 }, { billing_end: null }]) {
    assert.equal(selectPaidInvoice(page({ ...invoice, ...patch }), 'sub_fixture', now), null);
  }
  assert.equal(selectPaidInvoice({ count: 1, items: [null] }, 'sub_fixture', now), null);
  assert.throws(() => selectPaidInvoice({ count: 1, items: [] }, 'sub_fixture', now));
  const payment = { id: invoice.payment_id, invoice_id: invoice.id, status: 'captured', amount: 5000, currency: 'INR', amount_refunded: 0 };
  assert.equal(paymentCoversInvoice(payment, invoice), true);
  for (const patch of [{ status: 'authorized' }, { amount_refunded: 1 }, { invoice_id: 'inv_foreign' }, { amount: 1 }, { currency: 'USD' }]) {
    assert.equal(paymentCoversInvoice({ ...payment, ...patch }, invoice), false);
  }
  assert.throws(() => validateProviderPlan({ id: 'plan_fixture', period: 'yearly', interval: 1, item: { amount: 5000, currency: 'INR' } }, 'plan_fixture'));
  console.log('PASS: Only a fully paid matching monthly interval and captured, unrefunded payment can support paid access.');

  const calls = [];
  const settings = { keyId: 'rzp_test_fixture', keySecret: 'not-a-real-secret' };
  const client = createRazorpayClient({ settings, request: async (url, options) => {
    calls.push({ url, options });
    return Response.json({ ready: true });
  } });
  await client.fetchPlan('plan_fixture');
  await client.createSubscription({ planId: 'plan_fixture', attemptId: 'attempt-1', accountId: 'account-1' });
  await client.fetchSubscription('sub_fixture');
  await client.fetchInvoices('sub_fixture');
  await client.fetchPayment('pay_fixture');
  await client.cancelSubscription('sub_fixture');
  await client.listPlans();
  await client.createPlan();
  assert.equal(calls[0].url, 'https://api.razorpay.com/v1/plans/plan_fixture');
  assert.equal(calls[0].options.headers.Authorization, `Basic ${Buffer.from('rzp_test_fixture:not-a-real-secret').toString('base64')}`);
  assert.deepEqual(JSON.parse(calls[1].options.body), { plan_id: 'plan_fixture', quantity: 1, total_count: 12, customer_notify: false,
    notes: { learnsmith_attempt: 'attempt-1', learnsmith_account: 'account-1' } });
  assert.match(calls[3].url, /invoices\?subscription_id=sub_fixture&count=100$/);
  assert.deepEqual(JSON.parse(calls[5].options.body), { cancel_at_cycle_end: false });
  assert.equal(calls[6].url, 'https://api.razorpay.com/v1/plans?count=100');
  assert.deepEqual(JSON.parse(calls[7].options.body), { period: 'monthly', interval: 1, item: { name: 'LearnSmith Pro', amount: 5000, currency: 'INR' } });
  assert.throws(() => client.fetchPlan('plan_../../foreign'));
  assert.equal(calls.length, 8);
  console.log('PASS: The bounded API adapter uses fixed Razorpay endpoints, server IDs, correct create/cancel bodies, and rejects path injection.');

  let attempts = 0;
  const timeout = createRazorpayClient({ settings, request: async () => { attempts += 1; throw new Error('private connection details'); } });
  await assert.rejects(timeout.createSubscription({ planId: 'plan_fixture', attemptId: 'one', accountId: 'one' }), (error) =>
    error.code === 'billing_provider_unavailable' && !error.message.includes('private'));
  assert.equal(attempts, 1);
  for (const status of [400, 500]) {
    const rejected = createRazorpayClient({ settings, request: async () => Response.json({ error: { description: 'private provider error' } }, { status }) });
    await assert.rejects(rejected.fetchPlan('plan_fixture'), (error) => error.definitiveRejection === (status === 400) && !error.message.includes('private'));
  }
  console.log('PASS: Provider timeouts are never retried; definite rejections and unknown outcomes stay distinct without leaking provider details.');
}
verify().catch((error) => { console.error('FAIL:', error); process.exitCode = 1; });
