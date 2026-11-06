// Request-rate protection is separate from paid-generation allowances.
// These provisional values assume one backend process.
export const BURST_LIMITS = Object.freeze({
  windowMs: 60_000,
  sessionsPerIp: 60,
  generationRequestsPerIdentity: 20,
  learningWritesPerIdentity: 120,
  billingWritesPerIdentity: 10,
  billingWebhooksPerIp: 120,
});
