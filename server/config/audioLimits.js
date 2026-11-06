// Bounds keep one narration from turning into an unbounded series of paid calls.
export const AUDIO_LIMITS = Object.freeze({
  sourceChars: 12_000,
  translatedChars: 12_000,
  chunkChars: 4096,
  chunks: 4,
  bytes: 8 * 1024 * 1024,
  leaseMs: 5 * 60 * 1000,
});
