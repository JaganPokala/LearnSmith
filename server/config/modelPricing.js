// Standard text pricing, verified 2026-11-06. Estimates exclude taxes,
// account-specific discounts, tools, audio, and other service tiers.
// https://developers.openai.com/api/docs/models/gpt-4.1-mini
const miniPricing = Object.freeze({
  version: '2026-11-06',
  currency: 'USD',
  serviceTier: 'default',
  inputPerMillion: 0.40,
  cachedInputPerMillion: 0.10,
  outputPerMillion: 1.60,
  source: 'https://developers.openai.com/api/docs/models/gpt-4.1-mini',
});

export const MODEL_PRICING = Object.freeze({
  'gpt-4.1-mini': miniPricing,
  'gpt-4.1-mini-2025-04-14': miniPricing,
});
