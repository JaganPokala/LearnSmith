import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const DEFAULTS = { database: true, generation: true, tts: false, video: false, auth: false };

let cached = null;

function load() {
  if (!cached) {
    cached = api
      .get('/api/health')
      .then((res) => ({ ...DEFAULTS, ...(res?.features ?? {}) }))
      .catch(() => DEFAULTS);
  }

  return cached;
}

export function useFeatures() {
  const [features, setFeatures] = useState(DEFAULTS);

  useEffect(() => {
    let cancelled = false;

    load().then((next) => {
      if (!cancelled) setFeatures(next);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return features;
}
