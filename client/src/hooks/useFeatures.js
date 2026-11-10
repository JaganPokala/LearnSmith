import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const DEFAULTS = { database: true, generation: true, tts: false, video: false, auth: false };

const RETRY_DELAYS_MS = [2_000, 5_000];
let cached = null;

async function fetchFeatures() {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await api.getHealth();
      if (!response?.features || typeof response.features.tts !== 'boolean') {
        throw new Error('Health response is missing feature flags.');
      }
      return { ...DEFAULTS, ...response.features };
    } catch (error) {
      const retryable = error.status === 0 || error.status === 429 || error.status >= 500;
      const delay = RETRY_DELAYS_MS[attempt];
      if (!retryable || delay === undefined) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export function loadFeatures() {
  if (!cached) {
    // Share the in-flight request and cache only a successful response.
    cached = fetchFeatures().catch(() => {
      cached = null;
      return DEFAULTS;
    });
  }

  return cached;
}

export function useFeatures() {
  const [features, setFeatures] = useState(DEFAULTS);

  useEffect(() => {
    let cancelled = false;

    loadFeatures().then((next) => {
      if (!cancelled) setFeatures(next);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return features;
}
