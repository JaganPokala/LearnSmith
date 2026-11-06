import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { describeError } from '../lib/errors.js';

// Reads on mount; only an explicit click may start paid narration.
export default function AudioPlayer({ lessonId }) {
  const [status, setStatus] = useState('checking');
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const objectUrl = useRef(null);
  const mounted = useRef(false);
  const busy = useRef(false);

  function adopt(blob) {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(blob);
    setUrl(objectUrl.current);
    setStatus('ready');
  }

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    api.getBlob(`/api/lessons/${lessonId}/audio`).then((blob) => {
      if (!cancelled) {
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(blob);
        setUrl(objectUrl.current);
        setStatus('ready');
      }
    }).catch((err) => {
      if (cancelled) return;
      if (err.code === 'audio_not_found') setStatus('idle');
      else { setError(err); setStatus('error'); }
    });
    return () => {
      cancelled = true;
      mounted.current = false;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, [lessonId]);

  async function generate() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setStatus('generating');
    try {
      let blob;
      try {
        // Another tab may already have completed the narration.
        blob = await api.getBlob(`/api/lessons/${lessonId}/audio`);
      } catch (err) {
        if (err.code !== 'audio_not_found') throw err;
        if (!mounted.current) return;
        blob = await api.postBlob(`/api/lessons/${lessonId}/audio`);
      }
      if (mounted.current) adopt(blob);
    } catch (err) {
      if (mounted.current) { setError(err); setStatus('error'); }
    } finally {
      busy.current = false;
    }
  }

  const shell = 'mb-[18px] border border-line bg-panel px-[13px] py-[11px] print:hidden';
  const label = 'font-mono text-xs uppercase tracking-[0.13em] text-glow';
  const button = 'mt-[9px] border border-accent-line bg-accent-bg px-[13px] py-[5px] text-sm font-semibold text-glow hover:border-glow hover:bg-raised';
  const explanation = status === 'error' ? describeError(error, 'lesson') : null;

  return (
    <div className={shell}>
      <div className={label}>listen · hinglish · AI voice</div>
      {status === 'ready' && (
        <audio controls preload="metadata" src={url} className="mt-[7px] w-full">
          Your browser cannot play audio.
        </audio>
      )}
      {status === 'idle' && (
        <>
          <p className="mt-[7px] text-sm text-mute">Generate once using your daily audio allowance. Saved playback uses no allowance.</p>
          <button type="button" onClick={generate} className={button}>Generate audio</button>
        </>
      )}
      {(status === 'checking' || status === 'generating') && (
        <p role="status" aria-live="polite" className="mt-[7px] text-sm text-mute">
          {status === 'checking' ? 'Checking for saved audio…' : 'Translating and recording… Longer lessons take a few minutes.'}
        </p>
      )}
      {explanation && (
        <>
          <p role="alert" className="mt-[7px] text-sm text-danger">
            {explanation.title}{explanation.detail ? ` ${explanation.detail}` : ''}
          </p>
          {explanation.retry && <button type="button" onClick={generate} className={button}>Check audio / retry</button>}
        </>
      )}
    </div>
  );
}
