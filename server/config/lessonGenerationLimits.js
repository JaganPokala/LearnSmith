export const LESSON_GENERATION_LIMITS = Object.freeze({
  leaseMs: 30_000,
  renewEveryMs: 10_000,
  // Separate from crash recovery: bound a live but stuck request too.
  maxRunMs: 120_000,
});
