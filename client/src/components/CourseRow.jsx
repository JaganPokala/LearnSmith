import { Link } from 'react-router-dom';

import DeleteButton from './DeleteButton.jsx';

import { timeAgo } from '../lib/formatDate.js';

/**
 * One course in the library list.
 *
 * The design's row, column by column:
 *   #        26px   font-mono 10px, muted, ZERO-PADDED: 01, 02, 03
 *   Course   flex:1 title 13px, then tags underneath
 *   Written  96px   right-aligned, font-mono 10.5px  ->  7 / 13
 *   Created  74px   right-aligned, font-mono 10.5px  ->  2d ago
 *
 * The header row above the list uses the same four widths — that is what keeps
 * the labels sitting over their columns.
 *
 * @param {object} props
 * @param {number} props.index    1-based
 * @param {object} props.course   from GET /api/courses
 * @param {(deleted: object) => void} [props.onDeleted]  called after a successful delete
 */
export default function CourseRow({ index, course, onDeleted }) {
  // 1. Wrap the WHOLE row in <Link to={`/courses/${course._id}`}>, not just the
  //    title. A row that only responds on the exact text is annoying to click.
  //
  // 2. Index: String(index).padStart(2, '0') — the design shows 01, not 1.
  //    Fixed 26px width, or "1" and "10" push their titles to different
  //    positions and the column looks broken.
  //
  // 3. Title block needs BOTH `min-w-0` and `truncate`.
  //    min-w-0 for the same reason as <main> in AppLayout: a flex child will not
  //    shrink below its content, so a long title pushes the count and date off
  //    the row instead of being clipped.
  //
  // 4. Tags underneath, joined with ' · ', in font-mono 10.5px muted.
  //
  //    LOWERCASE THEM. The design shows "react · javascript · frontend"; the API
  //    returns "React", "JavaScript", "Frontend Development". Use a `lowercase`
  //    class rather than changing what the model generates — the small grey mono
  //    line reads better lowercase and this costs nothing.
  //
  // 5. writtenCount / lessonCount — font-mono, tabular-nums, 96px, right.
  //
  // 6. timeAgo(course.createdAt) — 74px, right.
  //
  // 7. Bottom border, and a subtle hover background so it reads as clickable.
  //
  // 8. THE DELETE BUTTON IS A SIBLING OF THE LINK, NOT A CHILD (Task 5.10).
  //
  //    A <button> inside an <a> is invalid HTML: the parser is allowed to
  //    restructure it, keyboard users get one focus stop where there are two
  //    actions, and a click runs both. So the row became a wrapper <div> that
  //    holds the link and the button side by side.
  //
  //    It is hover-revealed rather than a column, per the design — `group` on
  //    the wrapper is what lets the child react to the wrapper's hover. The
  //    link carries pr-[20px] to leave the gutter it sits in, and the library's
  //    header row carries the same padding so the columns stay aligned.

  return (
    <div className="group relative flex items-center border-b border-line last:border-b-0 hover:bg-raised">
      <Link
        to={`/courses/${course._id}`}
        className="flex min-w-0 flex-1 items-center gap-[11px] py-[10px] pl-[13px] pr-[33px] text-body"
      >
        <span className="w-[26px] shrink-0 font-mono text-meta text-mute">
          {String(index).padStart(2, '0')}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-base text-ink">{course.title}</span>

          {course.tags?.length > 0 && (
            <span className="mt-[2px] block truncate font-mono text-meta lowercase text-mute">
              {course.tags.join(' · ')}
            </span>
          )}
        </span>

        <span className="hidden w-[96px] shrink-0 text-right font-mono text-meta tabular-nums text-dim sm:block">
          {course.writtenCount} / {course.lessonCount}
        </span>

        <span className="w-[74px] shrink-0 text-right font-mono text-meta text-dim">
          {timeAgo(course.createdAt)}
        </span>
      </Link>

      {/* Absolutely positioned so adding it did not cost the four columns a
          fifth width to keep in sync with the header row. */}
      <span className="absolute right-[9px] top-1/2 -translate-y-1/2">
        <DeleteButton courseId={course._id} variant="row" onDeleted={onDeleted} />
      </span>
    </div>
  );
}
