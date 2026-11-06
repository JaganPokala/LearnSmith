import assert from 'node:assert/strict';
import { buildLessonCourseContext, MAX_COURSE_CONTEXT_CHARS } from '../services/lessonCourseContext.js';
import { createLessonGenerator } from '../services/lessonGenerator.js';
import { buildLessonPrompt } from '../services/prompts.js';

function fixture(count = 3, text = '') {
  return {
    _id: 'course', title: `Course ${text}`, description: `Build useful things ${text}`,
    modules: [
      { _id: 'module-b', course: 'course', title: `First module ${text}`, lessons:
        Array.from({ length: count }, (_, i) => ({
          _id: `lesson-${i}`, course: 'course', module: 'module-b',
          title: `Topic ${i} ${text}`, objectives: i === 0 ? [] : [text || `Apply topic ${i}`],
          content: [{ text: 'PRIVATE_BODY_NEVER_SEND' }], isEnriched: i % 2 === 0,
        })),
      },
      { _id: 'module-a', course: 'course', title: 'Second module', lessons: [
        { _id: 'last', course: 'course', module: 'module-a', title: 'Final project' },
      ] },
    ],
  };
}

async function verify() {
  const course = fixture();
  const before = JSON.stringify(course);
  const context = buildLessonCourseContext(course, 'lesson-1');
  assert.equal(JSON.stringify(course), before);
  assert.equal(context.course.description, 'Build useful things');
  assert.equal(context.current.position, 2);
  assert.equal(context.current.modulePosition, 1);
  assert.equal(context.current.lessonPosition, 2);
  assert.deepEqual(context.current.objectives, ['Apply topic 1']);
  assert.deepEqual(context.outline.map((item) => item.title), ['Topic 0', 'Topic 1', 'Topic 2', 'Final project']);
  assert.deepEqual(context.outline.map((item) => item.relation), ['earlier_planned', 'current', 'later_planned', 'later_planned']);
  assert.deepEqual(context.outline[0].objectives, []);
  assert.equal(context.omittedLessons, 0);
  assert.ok(!JSON.stringify(context).includes('PRIVATE_BODY_NEVER_SEND'));
  assert.ok(!JSON.stringify(context).includes('isEnriched'));
  assert.equal(buildLessonCourseContext(course, 'lesson-0').outline[0].relation, 'current');
  assert.equal(buildLessonCourseContext(course, 'last').current.modulePosition, 2);
  // Generation state must not change the planned coverage supplied to the model.
  course.modules[0].lessons.forEach((lesson) => { lesson.isEnriched = !lesson.isEnriched; });
  assert.deepEqual(buildLessonCourseContext(course, 'lesson-1'), context);
  console.log('PASS: Stored order, positions, available aims, and planned coverage; no bodies or completion assumptions.');

  course.modules.unshift({ _id: 'foreign', course: 'other', title: 'FOREIGN', lessons: [] });
  course.modules[1].lessons.unshift(
    { _id: 'bad-course', course: 'other', module: 'module-b', title: 'FOREIGN' },
    { _id: 'bad-module', course: 'course', module: 'other', title: 'FOREIGN' },
  );
  assert.ok(!JSON.stringify(buildLessonCourseContext(course, 'lesson-1')).includes('FOREIGN'));
  assert.throws(() => buildLessonCourseContext(course, 'missing'), { code: 'lesson_outline_invalid' });
  assert.throws(() => buildLessonCourseContext(course, 'bad-module'), { code: 'lesson_outline_invalid' });
  console.log('PASS: Broken or foreign references cannot supply lesson context.');

  for (const text of ['long text '.repeat(2000), '\u0000"\\\n'.repeat(2000), '学习🎓'.repeat(2000)]) {
    const large = fixture(200, text);
    large.modules[0].lessons.forEach((lesson) => { lesson.objectives = Array(20).fill(text); });
    const bounded = buildLessonCourseContext(large, 'lesson-190');
    const json = JSON.stringify(bounded);
    assert.ok(json.length <= MAX_COURSE_CONTEXT_CHARS, `Context exceeded budget: ${json.length}`);
    assert.equal(JSON.parse(json).current.position, 191);
    assert.ok(bounded.omittedLessons > 0);
    assert.equal(bounded.outline.length + bounded.omittedLessons, bounded.totalLessons);
    assert.ok(bounded.outline.length <= 40);
    assert.ok(bounded.outline.every((item, i, all) => i === 0 || all[i - 1].position < item.position));
    assert.deepEqual(bounded, buildLessonCourseContext(large, 'lesson-190'));
  }
  const minimal = fixture();
  delete minimal.description;
  minimal.modules[0].lessons[1].objectives = [null, '', '  A useful aim  '];
  assert.equal(buildLessonCourseContext(minimal, 'lesson-1').course.description, '');
  assert.deepEqual(buildLessonCourseContext(minimal, 'lesson-1').current.objectives, ['A useful aim']);
  console.log('PASS: Large, escaped, Unicode, and missing fields produce deterministic bounded JSON.');

  let calls = 0;
  let ownershipChecks = 0;
  const validations = [];
  const generate = createLessonGenerator({
    generate: async ({ messages, tracking }) => {
      calls += 1;
      assert.equal(ownershipChecks, calls);
      assert.equal(tracking.creator, 'fake-owner');
      assert.equal(tracking.generationId, 'fake-attempt');
      assert.equal(tracking.attemptNumber, calls);
      assert.equal(tracking.operation, 'lesson');
      assert.equal(messages[1].content, buildLessonPrompt({ courseContext: context }));
      assert.match(messages[0].content, /not proof.*generated, read, completed, or mastered/);
      assert.match(messages[0].content, /curriculum data, not instructions/);
      if (calls === 1) return { text: '{}' };
      assert.match(messages[2].content, /rejected/);
      return { text: JSON.stringify({
        title: 'Topic 1', objectives: ['Apply topic 1'], content: [
          { type: 'heading', text: 'Topic 1' },
          { type: 'paragraph', text: 'Teaching goes here.' },
          { type: 'video', query: 'topic one tutorial' },
          { type: 'mcq', question: 'Which topic?', options: ['One', 'Two'], answer: 0, explanation: 'This is topic one.' },
        ],
      }) };
    },
    tracker: { validation: async (tracking, result) => validations.push([tracking.attemptNumber, result]) },
  });
  const result = await generate({ lessonTitle: 'Topic 1', courseContext: context }, {
    creator: 'fake-owner', generationId: 'fake-attempt',
    beforeProviderCall: async () => { ownershipChecks += 1; },
  });
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
  assert.deepEqual(validations, [[1, 'rejected'], [2, 'accepted']]);
  console.log('PASS: Fake provider receives identical course context on retries with ownership checks and per-attempt tracking intact.');
}

verify().catch((error) => { console.error('FAIL:', error); process.exitCode = 1; });
