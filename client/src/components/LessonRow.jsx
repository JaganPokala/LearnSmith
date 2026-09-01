import { Link } from 'react-router-dom';
import StatusChip from './StatusChip.jsx';

/**
 * One lesson inside a module on the course page.
 *
 * Same visual shape as CourseRow — index, title, something on the right — but
 * a different destination and a chip instead of counts. Kept separate rather
 * than adding props to CourseRow: two components of fifteen lines each are
 * easier to read than one with four conditionals.
 *
 * @param {object} props
 * @param {number} props.number    the course-wide position (see the note in Course.jsx)
 * @param {object} props.lesson    { _id, title, isEnriched }
 */
export default function LessonRow({ number, lesson }) {
  // 1. The whole row is a <Link to={`/lessons/${lesson._id}`}>.
  //
  // 2. Index: zero-padded to two digits, fixed ~26px width, font-mono, muted.
  //
  // 3. Title: flex-1 with min-w-0 and truncate — a long lesson title must clip,
  //    not push the chip off the row.
  //
  // 4. <StatusChip isEnriched={lesson.isEnriched} /> on the right, shrink-0.
  //
  // 5. Bottom border and a hover background, matching CourseRow.

  return (
    <Link
      to={`/lessons/${lesson._id}`}
      className="flex items-center gap-[11px] border-b border-line px-[13px] py-[10px] text-body last:border-b-0 hover:bg-raised hover:text-ink"
    >
      <span className="w-[26px] shrink-0 font-mono text-meta text-mute">
        {String(number).padStart(2, '0')}
      </span>

      <span className="min-w-0 flex-1 truncate text-base">{lesson.title}</span>

      <span className="shrink-0">
        <StatusChip isEnriched={lesson.isEnriched} />
      </span>
    </Link>
  );
}
