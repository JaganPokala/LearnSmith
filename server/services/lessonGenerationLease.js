import { ApiError } from '../middlewares/errorHandler.js';
import { LESSON_GENERATION_LIMITS } from '../config/lessonGenerationLimits.js';
import { renewLessonGeneration } from './lessonGenerationState.js';

// Heartbeats keep healthy slow work alive; ownership checks gate new stages.
// One in-flight renewal prevents timer and stage checks from racing each other.
export function startLessonGenerationLease(context, {
  renew = renewLessonGeneration,
  now = Date.now,
  schedule = setTimeout,
  unschedule = clearTimeout,
  limits = LESSON_GENERATION_LIMITS,
} = {}) {
  const deadline = now() + limits.maxRunMs;
  let stopped = false;
  let error = null;
  let renewal = null;
  let heartbeatTimer;
  let deadlineTimer;
  let rejectFailure;
  const failure = new Promise((_, reject) => { rejectFailure = reject; });
  // A caller may stop the lease without ever running work.
  failure.catch(() => {});

  function stop() {
    stopped = true;
    unschedule(heartbeatTimer);
    unschedule(deadlineTimer);
  }

  function lose(reason) {
    if (error || stopped) return;
    error = reason;
    stop();
    rejectFailure(reason);
  }

  const timeout = () => new ApiError(504, 'generation_timeout', 'This generation took too long. Check for saved content before trying again.');
  const lost = () => new ApiError(409, 'generation_claim_lost', 'This generation no longer owns the lesson. Check for the latest saved result.');

  async function check() {
    if (error) throw error;
    if (stopped) throw lost();
    if (now() >= deadline) { lose(timeout()); throw error; }
    if (!renewal) {
      const started = now();
      renewal = Promise.resolve().then(() => renew(context)).then((owned) => {
        if (stopped) return;
        if (now() >= deadline) lose(timeout());
        else if (!owned || now() - started >= limits.leaseMs) lose(lost());
      }).catch(() => {
        lose(new ApiError(503, 'generation_claim_unavailable', 'Generation ownership could not be confirmed. Check the lesson status before retrying.'));
      }).finally(() => { renewal = null; });
    }
    await renewal;
    if (error) throw error;
    if (stopped) throw lost();
  }

  function heartbeat() {
    heartbeatTimer = schedule(async () => {
      try { await check(); } catch { return; }
      if (!stopped) heartbeat();
    }, limits.renewEveryMs);
    heartbeatTimer?.unref?.();
  }

  deadlineTimer = schedule(() => lose(timeout()), limits.maxRunMs);
  deadlineTimer?.unref?.();
  heartbeat();

  return {
    check,
    run: (work) => Promise.race([Promise.resolve().then(work), failure]),
    stop,
  };
}
