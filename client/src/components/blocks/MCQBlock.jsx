import { useId, useRef, useState } from 'react';
import { useLearning } from '../../lib/learningContext.js';

export default function MCQBlock({ block, id, questionIndex, question }) {
  const name = useId();
  const learning = useLearning();
  const [selected, setSelected] = useState(question?.latestAttempt?.selectedOption ?? null);
  const [result, setResult] = useState(question?.latestAttempt ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submission = useRef(null);
  const saving = useRef(false);
  const submitted = Boolean(result);
  const options = Array.isArray(block.options) ? block.options : [];
  const gradable = options.length > 0 && options.every((option) => typeof option === 'string') &&
    Number.isInteger(block.answer) && block.answer >= 0 && block.answer < options.length;
  const correct = result?.isCorrect;
  const canSave = Boolean(question && learning?.data);

  async function check(event) {
    event.preventDefault();
    if (!gradable || !canSave || selected === null || submitted || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    submission.current ??= crypto.randomUUID();
    try {
      setResult(await learning.submit({ submissionId: submission.current, questionIndex,
        questionVersion: question.version, selectedOption: selected }));
    } catch (err) { setError(err); }
    finally { saving.current = false; setBusy(false); }
  }

  function choose(index) {
    setSelected(index);
    submission.current = null;
    setError(null);
  }

  function retake() {
    setResult(null);
    setSelected(null);
    submission.current = null;
    setError(null);
  }

  return (
    <section id={id} tabIndex={-1} className="print-keep my-8 scroll-mt-6 rounded-xl border border-accent-line bg-panel p-5 sm:p-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-glow">Quick check</p>
      <form onSubmit={check}>
        <fieldset aria-describedby={!gradable ? `${name}-invalid` : undefined}>
          <legend className="mb-5 text-lg font-semibold leading-relaxed text-ink">{block.question}</legend>
          <div className="space-y-2">
            {options.map((option, index) => {
              const isCorrect = submitted && index === result.correctOption;
              const isWrong = submitted && selected === index && !isCorrect;
              const tone = isCorrect ? 'border-ok-line bg-ok-bg text-ok'
                : isWrong ? 'border-danger-line bg-danger-bg text-danger'
                  : selected === index ? 'border-accent bg-accent-bg text-ink' : 'border-line-strong text-body';
              return (
                <label key={index} className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-[15px] leading-relaxed ${tone} ${submitted || !gradable ? '' : 'cursor-pointer hover:border-accent'}`}>
                  <input type="radio" name={name} checked={selected === index} onChange={() => choose(index)} disabled={submitted || !gradable || busy || !canSave} className="mt-1.5 h-3.5 w-3.5 shrink-0 accent-glow focus-visible:outline-2 focus-visible:outline-glow" />
                  <span aria-hidden="true" className="pt-px font-mono text-xs text-mute">{String.fromCharCode(65 + index)}</span>
                  <span className="flex-1">{String(option ?? '')}</span>
                  {isCorrect && <span className="text-xs font-medium">✓ Correct</span>}
                  {isWrong && <span className="text-xs font-medium">✗ Your answer</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
        {!gradable && <p id={`${name}-invalid`} className="mt-4 text-sm text-warn">This question has incomplete answer data and cannot be checked.</p>}
        {!submitted && gradable && (
          <div className="mt-5 flex flex-wrap items-center gap-3 print:hidden">
            <button type="submit" disabled={selected === null || busy || !canSave} className="rounded-lg border border-accent-line bg-accent-bg px-4 py-2 text-sm font-semibold text-glow hover:border-glow focus-visible:outline-2 focus-visible:outline-glow disabled:cursor-not-allowed disabled:opacity-40">{busy ? 'Saving answer…' : 'Check answer'}</button>
            <span className="text-xs text-mute">{canSave ? 'Checking saves this attempt.' : learning?.loading ? 'Loading saved answers…' : 'Saved activity unavailable. Refresh it above.'}</span>
          </div>
        )}
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-danger">{error.message} {error.code === 'quiz_changed'
        ? <button type="button" onClick={() => window.location.reload()} className="underline">Reload the updated lesson</button>
        : 'Your answer is still selected. Check again to retry the same submission.'}</p>}
      {submitted && (
        <div role="status" aria-live="polite" className="mt-5 border-t border-line pt-4 print:hidden">
          <p className={`mb-2 text-sm font-semibold ${correct ? 'text-ok' : 'text-danger'}`}>{correct ? 'Correct answer.' : `Incorrect. The correct answer is ${String.fromCharCode(65 + result.correctOption)}.`} <span className="text-xs text-mute">Saved</span></p>
          {result.explanation && <p className="text-[15px] leading-relaxed text-body">{result.explanation}</p>}
          <button type="button" onClick={retake} className="mt-3 border border-line px-3 py-1.5 text-sm text-glow">Try again</button>
        </div>
      )}
      {gradable && <div className="mt-4 hidden text-base leading-relaxed print:block"><strong>Answer: {String.fromCharCode(65 + block.answer)}.</strong> {block.explanation}</div>}
    </section>
  );
}
