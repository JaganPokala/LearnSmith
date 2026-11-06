import { stripEchoedTitle } from './lessonBody.js';

// Index-based anchors are deterministic even when headings repeat or contain
// punctuation/Unicode. Build the outline and renderer IDs from the same list.
export function lessonBlockId(index) {
  return `lesson-section-${index}`;
}

export function buildLessonReader(lesson) {
  const blocks = stripEchoedTitle(lesson?.content, lesson?.title);
  let questions = 0;
  const outline = [];
  for (const [index, block] of blocks.entries()) {
    if (block?.type === 'heading' && typeof block.text === 'string' && block.text.trim()) {
      outline.push({ id: lessonBlockId(index), label: block.text.trim(), kind: 'section' });
    } else if (block?.type === 'mcq') {
      questions += 1;
      outline.push({ id: lessonBlockId(index), label: `Quick check ${questions}`, kind: 'quiz' });
    }
  }

  const prose = [lesson?.title, ...(lesson?.objectives ?? []),
    ...blocks.filter((block) => ['heading', 'paragraph'].includes(block?.type)).map((block) => block.text),
  ].filter((text) => typeof text === 'string').join(' ');
  const words = prose.trim().match(/\S+/gu)?.length ?? 0;
  const sourceOffset = (Array.isArray(lesson?.content) ? lesson.content.length : 0) - blocks.length;
  return { blocks, outline, questions, sourceOffset, readingMinutes: Math.max(1, Math.ceil(words / 200)) };
}
