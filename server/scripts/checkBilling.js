import { config, features } from '../config/env.js';
import { createRazorpayClient } from '../services/razorpayClient.js';
import { validateProviderPlan } from '../services/billingValidation.js';
import { validBillingKey } from '../config/billingMode.js';

// Read-only diagnosis. Never print keys, secrets, provider payloads, or create
// plans/subscriptions. Run setup:billing separately to create the test plan.
async function check() {
  const problems = [];
  if (!config.AUTH0_ISSUER || !config.AUTH0_AUDIENCE) problems.push('Configure Auth0 issuer and audience for signed-in billing.');
  if (!validBillingKey(config.RAZORPAY_MODE, config.RAZORPAY_KEY_ID)) problems.push('Set RAZORPAY_MODE to test or live and supply a matching key ID.');
  if (!config.RAZORPAY_KEY_SECRET) problems.push('Set RAZORPAY_KEY_SECRET.');
  if (!/^plan_[A-Za-z0-9]+$/.test(config.RAZORPAY_PLAN_ID ?? '')) problems.push(config.RAZORPAY_MODE === 'test' ? 'Missing test plan: run npm run setup:billing from server/.' : 'Set the live INR 50/month plan ID from the Razorpay dashboard.');
  if (!(config.RAZORPAY_WEBHOOK_SECRET?.length >= 24)) problems.push('Set a webhook secret of at least 24 characters.');
  if (problems.length) throw new Error(problems.join('\n'));

  const client = createRazorpayClient();
  validateProviderPlan(await client.fetchPlan(config.RAZORPAY_PLAN_ID), config.RAZORPAY_PLAN_ID);
  console.log(`PASS: Credentials accepted; INR 50/month ${config.RAZORPAY_MODE} plan verified; required local settings present.`);
  try {
    const response = await fetch(`http://127.0.0.1:${config.PORT}/api/health`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error('health');
    const health = await response.json();
    const session = await fetch(`http://127.0.0.1:${config.PORT}/api/session`, { method: 'POST', signal: AbortSignal.timeout(2000) });
    const cookie = session.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const planResponse = await fetch(`http://127.0.0.1:${config.PORT}/api/billing/plan`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(2000) });
    const plan = await planResponse.json();
    if (features.billing && (!health.features?.billing || plan.mode !== config.RAZORPAY_MODE)) {
      console.error('The running backend has stale settings. Restart it to enable checkout.');
      process.exitCode = 1;
    } else {
      console.log('PASS: Running backend reports billing enabled.');
    }
  } catch {
    console.log('Local backend is not reachable. Start it before opening /billing.');
  }
  console.log(`Webhook delivery is separate: configure a public HTTPS endpoint and the matching secret in the Razorpay ${config.RAZORPAY_MODE} dashboard.`);
}

check().catch((error) => {
  console.error('Billing check failed:', error.message);
  if (error.providerStatus === 401) console.error('Razorpay rejected the API credentials. Check that the key ID and secret are a matching pair.');
  else if (error.providerStatus) console.error(`Provider HTTP ${error.providerStatus}; check the configured plan in the selected dashboard mode.`);
  process.exitCode = 1;
});
