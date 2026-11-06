import { useLearning } from '../lib/learningContext.js';

export default function QuizHistory() {
  const learning = useLearning();
  return (
    <details className="my-8 border border-line bg-panel p-4 print:hidden">
      <summary className="cursor-pointer text-sm font-semibold text-ink">Saved quiz attempts</summary>
      <p className="mt-3 text-xs text-mute">Newest first. Retaking a question keeps earlier answers.</p>
      {!learning.data && <p className="mt-3 text-sm text-dim">{learning.loading ? 'Loading…' : 'History unavailable. Refresh saved activity above.'}</p>}
      {learning.data?.attempts.length === 0 && <p className="mt-3 text-sm text-dim">No checked answers yet.</p>}
      <ol className="divide-y divide-line">
        {learning.data?.attempts.map((attempt) => (
          <li key={attempt.id} className="py-4 text-sm">
            <p className="font-medium text-ink">{attempt.question}</p>
            <p className={`mt-2 ${attempt.isCorrect ? 'text-ok' : 'text-danger'}`}>{attempt.isCorrect ? 'Correct' : 'Incorrect'} · Your answer: {attempt.options[attempt.selectedOption]}</p>
            {!attempt.isCorrect && <p className="mt-1 text-dim">Correct answer: {attempt.options[attempt.correctOption]}</p>}
            <p className="mt-2 text-dim">{attempt.explanation}</p>
            <time dateTime={attempt.createdAt} className="mt-2 block text-xs text-mute">{new Date(attempt.createdAt).toLocaleString()}</time>
          </li>
        ))}
      </ol>
      {learning.data?.nextCursor && <button type="button" disabled={learning.loadingMore} onClick={learning.loadMore} className="mt-3 border border-line px-3 py-2 text-sm text-glow disabled:opacity-50">{learning.loadingMore ? 'Loading…' : 'Load older attempts'}</button>}
    </details>
  );
}
