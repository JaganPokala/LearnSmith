import assert from 'node:assert/strict';
import { openSubscriptionCheckout } from '../src/lib/razorpayCheckout.js';

const checkout = { keyId: 'rzp_test_fixture', subscriptionId: 'sub_fixture', mode: 'test' };
let options;
let opened = 0;
let failure;
let loads = 0;
class FakeCheckout {
  constructor(value) { options = value; }
  on(event, handler) { assert.equal(event, 'payment.failed'); failure = handler; }
  open() { opened += 1; }
}
const load = async () => { loads += 1; return FakeCheckout; };

async function verify() {
  await assert.rejects(openSubscriptionCheckout({ ...checkout, keyId: 'rzp_live_forbidden' }, { load }));
  await assert.rejects(openSubscriptionCheckout({ ...checkout, subscriptionId: '//untrusted' }, { load }));
  assert.equal(loads, 0);
  let promise = openSubscriptionCheckout(checkout, { load });
  await Promise.resolve();
  assert.equal(opened, 1);
  assert.equal(options.key, checkout.keyId);
  assert.equal(options.subscription_id, checkout.subscriptionId);
  assert.equal(options.amount, undefined, 'The server-created provider subscription sets the price.');
  assert.equal(options.prefill, undefined, 'No user profile is transmitted automatically.');
  const response = { razorpay_payment_id: 'pay_fixture', razorpay_subscription_id: 'sub_fixture', razorpay_signature: 'test-signature' };
  options.handler(response);
  options.modal.ondismiss();
  assert.deepEqual(await promise, { status: 'completed', response });
  console.log('PASS: Test mode accepts only matching keys/stored subscription IDs; callbacks require server verification.');

  promise = openSubscriptionCheckout(checkout, { load });
  await Promise.resolve();
  options.modal.ondismiss();
  assert.deepEqual(await promise, { status: 'dismissed' });
  promise = openSubscriptionCheckout(checkout, { load });
  await Promise.resolve();
  failure({ error: { description: 'private provider message' } });
  options.modal.ondismiss();
  assert.deepEqual(await promise, { status: 'failed' });
  console.log('PASS: Closing or failing checkout is distinct from a completed callback and reveals no raw provider error data.');

  await assert.rejects(openSubscriptionCheckout(checkout, { load: async () => { throw new Error('Script unavailable'); } }), /Script unavailable/);
  await assert.rejects(openSubscriptionCheckout(checkout, { load: async () => class { constructor() { throw new Error('Internal SDK failure'); } } }), /Could not open checkout/);
  console.log('PASS: Script and SDK failures propagate without upgrading the account or opening another checkout automatically.');
  await assert.rejects(openSubscriptionCheckout({ ...checkout, mode: 'live' }, { load }));
  promise = openSubscriptionCheckout({ ...checkout, mode: 'live', keyId: 'rzp_live_fixture' }, { load });
  await Promise.resolve();
  assert.equal(options.key, 'rzp_live_fixture');
  assert.ok(!options.description.includes('test'));
  options.handler(response);
  assert.deepEqual(await promise, { status: 'completed', response });
  console.log('PASS: Explicit live mode accepts a live key, rejects test keys, and uses accurate checkout text with a fake SDK.');
}
verify().catch((error) => { console.error('FAIL:', error); process.exitCode = 1; });
