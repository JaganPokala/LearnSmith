import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { describeError } from '../lib/errors.js';

/**
 * Hinglish narration for one lesson. Starts itself.
 *
 * WHY IT AUTO-STARTS: synthesis takes ~24s. Waiting for a click means the user
 * decides they want audio and THEN waits. Starting on mount spends those
 * seconds while they are reading the first paragraph, so by the time they look
 * for a player it is already there. The work is identical; only its position
 * relative to the reader's attention changes.
 *
 * WHY IT WAITS FIRST: flicking through five lessons should not bill five
 * syntheses. A short delay means only a lesson someone actually stopped on
 * gets one.
 *
 * WHY NOT `<audio src="/api/...">`: the browser fetches that URL natively,
 * outside lib/api.js, so it carries no Authorization header and an owned lesson
 * answers 404 — the same failure as F5. Bytes come through api.js as a Blob and
 * play from an object URL.
 *
 * @param {object} props
 * @param {string} props.lessonId
 */

/** Long enough that browsing past a lesson costs nothing. */
const START_AFTER_MS = 1200;

export default function AudioPlayer({ lessonId }) {
  // checking → generating → ready, or error at either step.
  const [status, setStatus] = useState('checking');
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  const objectUrl = useRef(null);

  // Guards a second POST. React 19 StrictMode mounts effects twice in dev, and
  // without this that is two syntheses and two bills for one lesson — the
  // server's upsert would hide it by storing one row.
  const started = useRef(false);

  // Every createObjectURL pins its Blob until revoked. 1.4MB leaked per lesson
  // visited adds up across a reading session.
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    function adopt(blob) {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      setUrl(objectUrl.current);
      setStatus('ready');
    }

    async function go() {
      // Cheap, and never generates. A hit means someone already listened to
      // this lesson and it costs nothing to serve again.
      try {
        const blob = await api.getBlob(`/api/lessons/${lessonId}/audio`);
        if (!cancelled) adopt(blob);
        return;
      } catch (err) {
        // 404 is the ordinary answer for a lesson nobody has heard yet. Any
        // other failure is real and should not be followed by a paid POST.
        if (err?.status !== 404) {
          if (!cancelled) {
            setError(err);
            setStatus('error');
          }
          return;
        }
      }

      timer = setTimeout(async () => {
        if (cancelled || started.current) return;

        started.current = true;
        setStatus('generating');

        try {
          const blob = await api.postBlob(`/api/lessons/${lessonId}/audio`);
          // Deliberately NOT checking `cancelled` before adopting is wrong the
          // other way round: if they navigated away, adopting would set state
          // on a component that is going. The server still stored it, so the
          // next visit is instant either way.
          if (!cancelled) adopt(blob);
        } catch (err) {
          if (!cancelled) {
            setError(err);
            setStatus('error');
          }
        }
      }, START_AFTER_MS);
    }

    go();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [lessonId]);

  async function retry() {
    started.current = true;
    setError(null);
    setStatus('generating');

    try {
      const blob = await api.postBlob(`/api/lessons/${lessonId}/audio`);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      setUrl(objectUrl.current);
      setStatus('ready');
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }

  // Nothing to play on paper.
  const shell = 'mb-[18px] border border-line bg-panel px-[13px] py-[11px] print:hidden';
  const label = 'font-mono text-xs uppercase tracking-[0.13em] text-glow';

  if (status === 'ready') {
    return (
      <div className={shell}>
        <div className={`mb-[7px] ${label}`}>listen · hinglish</div>

        {/* The browser's own player. Rebuilding scrub, volume, playback rate
            and keyboard control by hand lands somewhere worse. */}
        <audio controls preload="metadata" src={url} className="w-full">
          Your browser cannot play audio.
        </audio>
      </div>
    );
  }

  if (status === 'error') {
    const { title, detail, retry: retryable } = describeError(error, 'lesson');

    return (
      <div className={shell}>
        <p role="alert" className="m-0 text-sm text-danger">
          {title}
          {detail ? ` ${detail}` : ''}
        </p>

        {retryable && (
          <button
            type="button"
            onClick={retry}
            className="mt-[9px] border border-accent-line bg-accent-bg px-[13px] py-[5px] text-sm font-semibold text-glow hover:border-glow hover:bg-raised"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  // checking | generating — one quiet strip, not a call to action. There is
  // nothing for the reader to do, so it should not look like there is.
  return (
    <div className={shell} role="status" aria-live="polite">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className={label}>listen · hinglish</span>

        <span className="font-mono text-meta text-mute">
          {status === 'generating'
            ? 'translating and recording — about 25 seconds, then it is saved'
            : 'checking…'}
        </span>
      </div>

      {status === 'generating' && (
        <div className="mt-[9px] h-[2px] w-full overflow-hidden bg-line">
          <div className="h-full w-1/4 animate-slide bg-accent" />
        </div>
      )}
    </div>
  );
}
