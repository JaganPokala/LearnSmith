/**
 * Drop a leading heading block that only repeats the lesson title.
 *
 * The model often opens with one, which renders as the same sentence twice in a
 * row directly under the page's h1. It just as often opens with a heading that
 * says something NEW ("Introduction to React Hooks" under the title "What Are
 * React Hooks and Why Use Them?"), and that one has to survive.
 *
 * So the match is exact after trimming and lowercasing — never a prefix or a
 * similarity score, which would quietly eat real headings.
 *
 * @param {Array<object>} blocks   lesson.content
 * @param {string} title           lesson.title
 * @returns {Array<object>}
 */
export function stripEchoedTitle(blocks, title) {
  const list = Array.isArray(blocks) ? blocks : [];

  const first = list[0];

  if (first?.type !== 'heading') return list;

  const norm = (v) => String(v ?? '').trim().toLowerCase();

  return norm(first.text) === norm(title) ? list.slice(1) : list;
}
