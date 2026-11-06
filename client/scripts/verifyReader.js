import assert from 'node:assert/strict';
import { buildLessonReader, lessonBlockId } from '../src/lib/lessonReader.js';

const blocks = [
  { type: 'heading', text: 'Database claims' },
  { type: 'heading', text: 'Why claims?' },
  { type: 'paragraph', text: 'A claim assigns one active owner.' },
  { type: 'heading', text: 'Why claims?' },
  { type: 'mcq', question: 'Who owns the work?' },
  { type: 'code', language: 'js', text: 'const owner = claim();' },
  { type: 'heading', text: 'समझें / 理解' },
  { type: 'mcq', question: 'When can ownership expire?' },
];
const model = buildLessonReader({ title: 'Database claims', objectives: ['Understand ownership'], content: blocks });
assert.equal(model.blocks.length, 7); // Only the echoed title is removed.
assert.equal(model.blocks[0].text, 'Why claims?');
assert.equal(model.questions, 2);
assert.deepEqual(model.outline.map((item) => item.id), [0, 2, 3, 5, 6].map(lessonBlockId));
assert.equal(new Set(model.outline.map((item) => item.id)).size, 5);
assert.deepEqual(model.outline.filter((item) => item.kind === 'quiz').map((item) => item.label), ['Quick check 1', 'Quick check 2']);
assert.ok(model.outline.some((item) => item.label === 'समझें / 理解'));
assert.deepEqual(blocks[0], { type: 'heading', text: 'Database claims' });
console.log('PASS: Outline IDs match rendered blocks after title removal, including repeated/Unicode headings and multiple quizzes.');

const distinct = buildLessonReader({ title: 'Claims', content: [{ type: 'heading', text: 'Claims in practice' }] });
assert.equal(distinct.blocks.length, 1);
assert.equal(buildLessonReader(null).outline.length, 0);
assert.equal(buildLessonReader({ content: 'not an array' }).blocks.length, 0);
assert.equal(buildLessonReader({ content: [null, { type: 'heading', text: ' ' }, { type: 'custom' }] }).outline.length, 0);
console.log('PASS: Meaningful headings survive; absent/malformed content does not break navigation.');

const longCode = { type: 'code', text: 'word '.repeat(2000) };
const prose = { type: 'paragraph', text: 'word '.repeat(401) };
assert.equal(buildLessonReader({ content: [longCode] }).readingMinutes, 1);
assert.equal(buildLessonReader({ content: [prose] }).readingMinutes, 3);
console.log('PASS: Estimated reading time counts prose and excludes code rather than presenting exercise/video time as measured.');
