import { useRef, useState } from 'react';
import { useLearning } from '../lib/learningContext.js';

export default function LearningControls() {
  const learning = useLearning();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const saving = useRef(false);
  const completed = learning.data?.progress.completed ?? false;
  async function toggle() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try { await learning.complete(!completed); }
    catch (err) { setError(err); }
    finally { saving.current = false; setBusy(false); }
  }
  return (
    <section aria-label="Lesson progress" className="my-5 border border-line bg-panel p-4 print:hidden">
      <div className="flex flex-wrap items-center gap-3">
        <span role="status" className="text-sm text-dim">{learning.loading ? 'Loading saved progress…' : learning.data ? completed ? '✓ Completed · saved' : 'Not completed' : 'Progress unavailable'}</span>
        <button type="button" onClick={toggle} disabled={!learning.data || busy} className="border border-accent-line px-3 py-2 text-sm text-glow disabled:opacity-50">{busy ? 'Saving…' : completed ? 'Mark incomplete' : 'Mark complete'}</button>
      </div>
      <p className="mt-2 text-xs text-mute">Completion is your choice; quiz scores are tracked separately.</p>
      {(error || learning.error) && <p role="alert" className="mt-3 text-sm text-danger">{(error || learning.error).message} <button type="button" onClick={() => { setError(null); void learning.refresh(); }} className="underline">Refresh saved activity</button></p>}
      {learning.visitError && <p role="alert" className="mt-3 text-sm text-warn">Could not save your last-opened lesson. Reload to try again.</p>}
    </section>
  );
}
