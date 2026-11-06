import { api, ApiError } from './api.js';

export function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    const cancelled = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancelled);
      reject(new DOMException('Status check cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancelled);
      resolve();
    }, ms);
    if (signal?.aborted) cancelled();
    else signal?.addEventListener('abort', cancelled, { once: true });
  });
}

export async function watchLessonGeneration({
  lessonId, initial, onUpdate, signal,
  read = () => api.get(`/api/lessons/${lessonId}/generation`),
  wait = abortableDelay, now = Date.now, pollMs = 3000, maxWaitMs = 6 * 60_000,
}) {
  const started = now();
  let current = initial;
  while (current.generation?.state === 'generating' && !current.lesson?.isEnriched) {
    if (now() - started >= maxWaitMs) {
      throw new ApiError('Automatic status checking stopped. Check the lesson status again before retrying generation.', {
        code: 'generation_status_unavailable', status: 0,
      });
    }
    await wait(pollMs, signal);
    if (signal?.aborted) throw new DOMException('Status check cancelled', 'AbortError');
    current = await read();
    if (signal?.aborted) throw new DOMException('Status check cancelled', 'AbortError');
    onUpdate(current);
  }
  return current;
}
