import { useState, useEffect } from 'react';
import { useDeleteCourse } from '../hooks/useDeleteCourse.js';

/** How long an armed button waits before going back to idle. */
const DISARM_MS = 4000;

/**
 * The only destructive control in the app. Two clicks, never one.
 *
 * `DELETE /api/courses/:id` removes the course, its modules and every lesson
 * under it — 20 lessons and roughly four minutes of generation, with no undo
 * and no trash. A single-click button on every library row is one mis-aimed
 * click away from that.
 *
 * So: click once to ARM, click again to confirm, and disarm automatically
 * after four seconds. The arming step is also what makes the row variant safe
 * to hide — an invisible button that can only *arm* cannot delete anything.
 *
 *   idle     ->  ✕            /  Delete course
 *   armed    ->  delete?      /  Click again to confirm
 *   pending  ->  …            /  Deleting…
 *   error    ->  failed       /  the message
 *
 * @param {object} props
 * @param {string} props.courseId
 * @param {'row'|'page'} [props.variant]  'row' is the small hover-revealed ✕
 * @param {(deleted: object) => void} [props.onDeleted]  receives { deleted: {...} }
 */
export default function DeleteButton({ courseId, variant = 'row', onDeleted }) {
  const [armed, setArmed] = useState(false);
  const { run, pending, error, reset } = useDeleteCourse();

  // Disarm on a timer, so a button armed by a stray click does not sit there
  // one keystroke from deleting a course for the rest of the session.
  //
  // The cleanup is not optional. Without it, arming -> disarming -> arming
  // again inside four seconds leaves the FIRST timer running, and it fires
  // during the second arm and disarms it under the user's hand. The cleanup
  // also stops the timer while a delete is in flight.
  useEffect(() => {
    if (!armed || pending) return undefined;

    const timer = setTimeout(() => setArmed(false), DISARM_MS);

    return () => clearTimeout(timer);
  }, [armed, pending]);

  async function handleClick(event) {
    // THE TRAP THIS COMPONENT EXISTS INSIDE OF: in the library, this button
    // sits within a row that is a <Link>. Without both of these the click
    // navigates to the course you were trying to delete.
    //
    // preventDefault stops the navigation; stopPropagation stops the click
    // reaching the row's own handler. The row markup keeps the button as a
    // SIBLING of the <Link> rather than a child, because a <button> inside an
    // <a> is invalid HTML — but these two calls are what make the behaviour
    // correct regardless of how a caller nests it.
    event.preventDefault();
    event.stopPropagation();

    if (!armed) {
      reset();
      setArmed(true);
      return;
    }

    const result = await run(courseId);

    // On success the parent removes this row, unmounting us. Returning early
    // avoids setting state on the way out.
    if (result) {
      onDeleted?.(result);
      return;
    }

    setArmed(false);
  }

  const label = (() => {
    if (pending) return variant === 'row' ? '···' : 'Deleting…';
    if (error) return variant === 'row' ? 'failed' : error.message;
    if (armed) return variant === 'row' ? 'delete?' : 'Click again to confirm';
    return variant === 'row' ? '✕' : 'Delete course';
  })();

  const tone =
    error || armed
      ? 'border-[#e5b4b0] bg-[#fdf3f2] text-[#a8322b]'
      : 'border-transparent text-[#9aa4b0] hover:border-[#e5b4b0] hover:bg-[#fdf3f2] hover:text-[#a8322b]';

  const size = variant === 'row' ? 'px-[5px] py-[2px] text-[10px]' : 'px-[9px] py-[4px] text-[10.5px]';

  // Only the row variant hides, and only while it is idle. An armed, working or
  // failed button must stay on screen even if the pointer drifts off the row.
  //
  // Computed as one value rather than letting `opacity-0` and `opacity-100`
  // both land in the class list. Two conflicting utilities of equal specificity
  // are resolved by their order in the STYLESHEET, not in the attribute — so
  // that version happens to work, silently, for a reason nothing in this file
  // states and a Tailwind upgrade could reorder.
  const hidden = variant === 'row' && !armed && !pending && !error;

  const visibility = hidden
    ? 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
    : 'opacity-100';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      // The visible text changes between states, so it cannot also be the
      // accessible name — a screen reader would announce "✕" and then "delete?"
      // with no idea what is being deleted.
      aria-label={armed ? 'Confirm delete course' : 'Delete course'}
      title={error ? error.message : undefined}
      className={`shrink-0 whitespace-nowrap border font-mono tracking-tight disabled:cursor-wait ${size} ${tone} ${visibility}`}
    >
      {label}
    </button>
  );
}
