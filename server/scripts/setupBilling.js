import { readFileSync, writeFileSync } from 'node:fs';
import { config } from '../config/env.js';
import { billingConfig, PRO_PLAN } from '../config/billing.js';
import { createRazorpayClient } from '../services/razorpayClient.js';
import { validateProviderPlan } from '../services/billingValidation.js';

// Creates/reuses a test product plan. It does not create a customer subscription,
// request a payment, or expose API secrets in terminal output.
async function setup() {
  if (!config.envFileLoaded) throw new Error('This helper updates the local root .env. Configure hosted environments manually.');
  if (billingConfig.mode !== 'test' || !/^rzp_test_[A-Za-z0-9]+$/.test(billingConfig.keyId ?? '') || !billingConfig.keySecret) {
    throw new Error('Save RAZORPAY_KEY_ID (rzp_test_...) and RAZORPAY_KEY_SECRET in the root .env first.');
  }
  const client = createRazorpayClient();
  let plan;
  if (billingConfig.planId) {
    plan = await client.fetchPlan(billingConfig.planId);
  } else {
    plan = await client.createPlan();
  }
  if (typeof plan?.id !== 'string' || !/^plan_[A-Za-z0-9]+$/.test(plan.id)) throw new Error('The provider returned an invalid plan.');
  validateProviderPlan(plan, plan.id);
  let text = readFileSync(config.envFilePath, 'utf8');
  const field = /^RAZORPAY_PLAN_ID=[^\r\n]*/m;
  const line = `RAZORPAY_PLAN_ID=${plan.id}`;
  if (field.test(text)) text = text.replace(field, line);
  else text += `${text.includes('\r\n') ? '\r\n' : '\n'}${line}\n`;
  writeFileSync(config.envFilePath, text);
  console.log('Verified LearnSmith Pro test plan: INR 50/month. Plan ID saved in the root .env.');
  console.log('No customer subscription or payment was created. Restart the backend to reload configuration.');
}
setup().catch((error) => { console.error('Billing setup failed:', error.message, error.providerStatus ? `(provider HTTP ${error.providerStatus})` : ''); process.exitCode = 1; });
