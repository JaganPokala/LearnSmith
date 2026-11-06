// Per-lesson state, discarded on lesson/account changes. Reads are versioned:
// a slow older response must not overwrite a more recent saved result.
export function createLearningStore({ api, lessonId }) {
  const path = `/api/lessons/${lessonId}`;
  let state = { data: null, loading: true, error: null, visitError: null, loadingMore: false };
  let active = false;
  let readVersion = 0;
  let visited = false;
  const listeners = new Set();
  const update = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  async function refresh() {
    const version = ++readVersion;
    try {
      const data = await api.get(`${path}/learning`);
      if (active && version === readVersion) update({ data, loading: false, error: null, loadingMore: false });
    } catch (error) {
      if (active && version === readVersion) update({ loading: false, error, loadingMore: false });
    }
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => state,
    start() {
      active = true;
      if (!visited) {
        visited = true;
        api.postAction(`${path}/visit`).catch((visitError) => { if (active) update({ visitError }); });
      }
    },
    stop() { active = false; readVersion += 1; },
    refresh,
    async complete(completed) {
      const result = await api.put(`${path}/progress`, { completed });
      if (active && state.data) {
        // Invalidate any older history read, then publish the acknowledged save.
        readVersion += 1;
        update({ data: { ...state.data, progress: result.progress }, loadingMore: false });
        void refresh();
      }
      return result.progress;
    },
    async submit(body) {
      const result = await api.postAction(`${path}/quiz-attempts`, body);
      if (active && state.data) {
        readVersion += 1;
        const attempt = result.attempt;
        const questions = state.data.questions.map((question) => {
          if (question.questionIndex !== attempt.questionIndex || question.version !== attempt.questionVersion) return question;
          const alreadyLatest = question.latestAttempt?.submissionId === attempt.submissionId;
          return { ...question, latestAttempt: attempt,
            attemptCount: question.attemptCount + (alreadyLatest || result.replayed ? 0 : 1) };
        });
        update({ data: { ...state.data, questions,
          attempts: [attempt, ...state.data.attempts.filter((item) => item.id !== attempt.id)] }, loadingMore: false });
        // A refresh failure must not turn a successfully saved answer into a
        // failed submission. The returned grade remains usable.
        void refresh();
      }
      return result.attempt;
    },
    async loadMore() {
      const cursor = state.data?.nextCursor;
      if (!cursor || state.loadingMore) return;
      const version = readVersion;
      update({ loadingMore: true });
      try {
        const page = await api.get(`${path}/learning?before=${encodeURIComponent(cursor)}`);
        if (!active || version !== readVersion) return;
        const ids = new Set(state.data.attempts.map((attempt) => attempt.id));
        update({ data: { ...state.data, attempts: [...state.data.attempts, ...page.attempts.filter((attempt) => !ids.has(attempt.id))],
          nextCursor: page.nextCursor }, loadingMore: false, error: null });
      } catch (error) {
        if (active && version === readVersion) update({ loadingMore: false, error });
      }
    },
  };
}
