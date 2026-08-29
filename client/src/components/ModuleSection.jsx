import LessonRow from './LessonRow.jsx';

/**
 * One module: a heading, then its lessons.
 *
 * @param {object} props
 * @param {number} props.number       1-based module position
 * @param {object} props.module       { title, lessons: [...] }
 * @param {number} props.startNumber  the course-wide number of its FIRST lesson
 */
export default function ModuleSection({ number, module, startNumber }) {
  // 1. Heading in the design's form: "1 · Foundations of React Hooks"
  //    — the module number, a middle dot, the title. ~15px semibold.
  //
  // 2. Then one <LessonRow> per lesson.
  //
  //    THE NUMBERING IS COURSE-WIDE, NOT PER-MODULE. Module 1 ends at 05 and
  //    module 2 starts at 06. So the row number is startNumber + i, never i + 1.
  //
  //    Three modules each restarting at 01 reads as three separate lists rather
  //    than one syllabus — obviously wrong once you see it, easy to write by
  //    accident.
  //
  // 3. A module with an empty lessons array should render its heading and
  //    nothing else, not crash. It is a real state: a generation whose tree
  //    half-saved.

  return (
    <section className="mt-[22px] first:mt-0">
      <h2 className="mb-[9px] text-[15px] font-semibold tracking-[-0.01em]">
        {number} · {module.title}
      </h2>

      {/* Optional chain, not `.map` directly: `lessons` is absent on a module
          whose tree half-saved, and a heading with nothing under it is the
          honest render of that. */}
      {module.lessons?.map((lesson, i) => (
        <LessonRow key={lesson._id} number={startNumber + i} lesson={lesson} />
      ))}
    </section>
  );
}
