import { useEffect, useState } from 'react';

export default function LessonContents({ outline }) {
  const [active, setActive] = useState(null);

  useEffect(() => {
    const headings = outline.map(({ id }) => document.getElementById(id)).filter(Boolean);
    if (!headings.length || !('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver(() => {
      const passed = headings.filter((heading) => heading.getBoundingClientRect().top <= 160);
      setActive(passed.at(-1)?.id ?? headings[0].id);
    }, { rootMargin: '-80px 0px -60% 0px', threshold: 0 });
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [outline]);

  if (!outline.length) return null;
  const links = (
    <ol className="space-y-1">
      {outline.map(({ id, label, kind }, index) => (
        <li key={id}>
          <a href={`#${id}`} aria-current={(active ?? outline[0].id) === id ? 'location' : undefined}
            className="lesson-contents-link flex gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm leading-snug text-dim hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-glow">
            <span aria-hidden="true" className="pt-px font-mono text-xs text-mute">{kind === 'quiz' ? '?' : String(index + 1).padStart(2, '0')}</span>
            <span>{label}</span>
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      <details className="lesson-contents-mobile rounded-xl border border-line bg-panel p-4 print:hidden">
        <summary className="cursor-pointer text-sm font-medium text-ink">On this page <span className="ml-2 text-xs text-mute">{outline.length} sections</span></summary>
        <nav aria-label="Lesson sections" className="mt-3">{links}</nav>
      </details>
      <aside className="lesson-contents-desktop print:hidden">
        <nav aria-label="Lesson sections" className="sticky top-6 border-l border-line pl-4">
          <h2 className="mb-4 px-3 text-xs font-semibold uppercase tracking-widest text-mute">On this page</h2>
          {links}
          <a href="#lesson-top" className="mt-5 inline-block px-3 text-xs text-mute hover:text-glow">↑ Back to top</a>
        </nav>
      </aside>
    </>
  );
}
