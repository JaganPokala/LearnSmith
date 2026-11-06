import { config, features } from './env.js';
import { PRO_DAILY_LIMITS } from './usageLimits.js';

export const PRO_PLAN = Object.freeze({
  id: 'pro', name: 'LearnSmith Pro', amount: 5000, currency: 'INR',
  period: 'monthly', interval: 1, totalCycles: 12,
  dailyLimits: PRO_DAILY_LIMITS,
});

// Mode must be selected explicitly and match the key prefix.
export const billingConfig = Object.freeze({
  keyId: config.RAZORPAY_KEY_ID,
  keySecret: config.RAZORPAY_KEY_SECRET,
  planId: config.RAZORPAY_PLAN_ID,
  webhookSecret: config.RAZORPAY_WEBHOOK_SECRET,
  mode: config.RAZORPAY_MODE,
  enabled: features.billing,
});
