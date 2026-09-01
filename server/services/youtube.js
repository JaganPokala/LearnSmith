/**
 * Turns a search query written by the model into a real, embeddable video.
 *
 * WHY THIS RUNS AT WRITE TIME, ONCE PER LESSON, AND NEVER AGAIN
 * -------------------------------------------------------------
 * `search.list` costs 100 of a 10,000 unit daily quota — 100 searches a day for
 * the whole app. Resolving when a lesson is VIEWED would spend those on repeat
 * views of the same handful of lessons. Resolving when a lesson is WRITTEN
 * spends one per lesson ever, because the id is stored in the block next to the
 * text and every later read comes from MongoDB.
 *
 * NOTHING IN HERE THROWS. A lesson that fails to find a video is a lesson with
 * a search link, which is exactly what the app does today. Failing the whole
 * generation because YouTube was unhappy would trade a 12-second, billed
 * OpenAI call for nothing.
 */

import { config, features } from '../config/env.js';
import { trace, traceError } from '../middlewares/trace.js';

const SEARCH = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS = 'https://www.googleapis.com/youtube/v3/videos';

/** Candidates per query. More than one because the top hit may not embed. */
const CANDIDATES = 5;

/** Lesson generation already costs ~10s; this must not double it. */
const TIMEOUT_MS = 8000;

/**
 * @param {string} url
 * @param {Record<string, string>} params
 * @returns {Promise<object|null>} parsed body, or null on any failure
 */
async function call(url, params) {
  const qs = new URLSearchParams({ ...params, key: config.YOUTUBE_API_KEY });

  let res;

  try {
    res = await fetch(`${url}?${qs}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    // Timeout or network. Not worth a retry inside a request the user is
    // already waiting on.
    traceError(`  youtube: ${url.split('/').pop()} unreachable (${err.name})`);
    return null;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const reason = body?.error?.errors?.[0]?.reason ?? 'unknown';

    // 403 means two completely different things and they have different fixes,
    // so the log has to say which:
    //   quotaExceeded      - out of units for the day. Resets at midnight PT.
    //                        Retrying today cannot work.
    //   accessNotConfigured - YouTube Data API v3 is not enabled on the Google
    //                        Cloud project. Looks like a bad key; is not.
    traceError(
      `  youtube: ${res.status} ${reason}` +
        (reason === 'quotaExceeded'
          ? ' - daily quota gone, resets midnight Pacific'
          : reason === 'accessNotConfigured'
            ? ' - enable "YouTube Data API v3" in Google Cloud Console'
            : ` - ${body?.error?.message ?? 'no message'}`)
    );

    return null;
  }

  return res.json();
}

/**
 * Resolve one query to an embeddable video.
 *
 * @param {string} query  the model's search phrase, e.g. "react hooks tutorial"
 * @returns {Promise<{videoId: string, title: string, channel: string}|null>}
 */
export async function resolveVideo(query) {
  // No key configured: the app keeps the behaviour it has today.
  if (!features.video) return null;

  const q = typeof query === 'string' ? query.trim() : '';

  if (!q) return null;

  const startedAt = performance.now();

  // 100 UNITS. videoEmbeddable narrows the field for free, but it is a filter,
  // not a guarantee — the status check below is what actually decides.
  const found = await call(SEARCH, {
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    safeSearch: 'moderate',
    maxResults: String(CANDIDATES),
    q,
  });

  const ids = (found?.items ?? []).map((item) => item?.id?.videoId).filter(Boolean);

  // Zero results is an ordinary outcome for a niche topic, not a failure.
  if (ids.length === 0) {
    trace(`  youtube: no results for "${q}" (${Math.round(performance.now() - startedAt)}ms)`);
    return null;
  }

  // 1 UNIT for all five at once. `search.list` cannot tell you whether a video
  // is embeddable; without this the iframe renders a black "Video unavailable"
  // box, which is worse than the search link it replaced.
  const details = await call(VIDEOS, { part: 'status,snippet', id: ids.join(',') });

  const usable = (details?.items ?? []).find(
    (item) =>
      item?.status?.embeddable === true &&
      item?.status?.privacyStatus === 'public' &&
      item?.status?.uploadStatus === 'processed'
  );

  if (!usable) {
    trace(`  youtube: ${ids.length} results for "${q}", none embeddable`);
    return null;
  }

  const ms = Math.round(performance.now() - startedAt);

  trace(`  youtube: "${q}" -> ${usable.id} (${ids.length} candidates, ${ms}ms, 101 units)`);

  return {
    videoId: usable.id,
    title: usable.snippet?.title ?? '',
    channel: usable.snippet?.channelTitle ?? '',
  };
}

/**
 * Resolve every video block in a lesson's content, returning a NEW array.
 *
 * The query is kept alongside the id: it is the fallback when resolution found
 * nothing, and the recovery path when a stored video is later deleted.
 *
 * @param {Array<object>} blocks  lesson.content
 * @returns {Promise<Array<object>>}
 */
export async function resolveVideoBlocks(blocks) {
  const list = Array.isArray(blocks) ? blocks : [];

  if (!features.video) return list;

  // Sequential, not Promise.all. Lessons carry one video block in practice, and
  // firing several searches at once is the fastest way to spend a 100-unit
  // quota on a burst nobody asked for.
  const out = [];

  for (const block of list) {
    if (block?.type !== 'video') {
      out.push(block);
      continue;
    }

    const found = await resolveVideo(block.query);

    out.push(found ? { ...block, ...found } : block);
  }

  return out;
}
