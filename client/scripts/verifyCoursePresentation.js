import assert from 'node:assert/strict';
import { safeReturnTo } from '../src/lib/signIn.js';
import { courseCompletion, courseDestination } from '../src/features/courses/coursePresentation.js';

const course = { _id: 'course', lessonCount: 5, completedLessonCount: 2, resumeLessonId: 'lesson' };
assert.equal(safeReturnTo('/courses/new'), '/courses/new');
assert.equal(courseCompletion(course).percent, 40);
assert.deepEqual(courseDestination(course), { label: 'Continue learning', to: '/lessons/lesson' });
assert.deepEqual(courseDestination({ ...course, completedLessonCount: 5 }), { label: 'Review course', to: '/courses/course' });
assert.deepEqual(courseDestination({ ...course, resumeLessonId: null }), { label: 'View course', to: '/courses/course' });
assert.equal(courseCompletion({ lessonCount: 0, completedLessonCount: 0 }).finished, false);
assert.equal(courseCompletion({ lessonCount: 2, completedLessonCount: 3 }).percent, 100);
console.log('PASS: Completion, resume, review and empty-outline destinations use saved state without treating generated content as completion.');
