import LessonRow from './LessonRow.jsx';

/**
 * One module: a header, then its lessons, inside one bordered panel.
 *
 * @param {object} props
 * @param {number} props.number       1-based module position
 * @param {object} props.module       { title, lessons: [...] }
 * @param {number} props.startNumber  the course-wide number of its FIRST lesson
 */
export default function ModuleSection({ number, module, startNumber }) {
  const lessons = module.lessons ?? [];

  const written = lessons.filter((lesson) => lesson.isEnriched).length;

  return (
    <section className="mt-4 border border-line first:mt-0">
      <header className="flex items-baseline gap-3 border-b border-line bg-panel px-[13px] py-[10px]">
        <span className="shrink-0 font-mono text-meta tabular-nums text-glow">
          {String(number).padStart(2, '0')}
        </span>

        <h2 className="min-w-0 flex-1 text-lg font-semibold tracking-[-0.01em] text-ink">
          {module.title}
        </h2>

        {/* Per module, not just per course: it is the answer to "where did I get
            to", and the course-wide total cannot give it. */}
        {lessons.length > 0 && (
          <span className="shrink-0 font-mono text-xs tabular-nums text-mute">
            {written}/{lessons.length}
          </span>
        )}
      </header>

      {/* The numbering is COURSE-WIDE: module 1 ends at 05 and module 2 starts
          at 06, so the row number is startNumber + i, never i + 1. Three modules
          each restarting at 01 reads as three separate lists, not one syllabus.

          Optional chain, not `.map` directly: `lessons` is absent on a module
          whose tree half-saved, and a header with nothing under it is the honest
          render of that. */}
      {lessons.map((lesson, i) => (
        <LessonRow key={lesson._id} number={startNumber + i} lesson={lesson} />
      ))}
    </section>
  );
}
