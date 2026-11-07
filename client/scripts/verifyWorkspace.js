import assert from 'node:assert/strict';
import { lessonNeighbours } from '../src/features/lessons/lessonNavigation.js';
import { subscriptionMessage, paidThroughLabel } from '../src/features/billing/billingPresentation.js';

const course = { modules: [{ lessons: [{ _id: 'a' }, { _id: 'b' }] }, { lessons: [{ _id: 'c' }] }] };
assert.equal(lessonNeighbours(course, [], 'b').next._id, 'c');
assert.equal(lessonNeighbours(course, [], 'c').previous._id, 'b');
assert.equal(lessonNeighbours(course, [], 'a').previous, null);
assert.equal(lessonNeighbours(course, [], 'c').next, null);
assert.deepEqual(lessonNeighbours(course, [], 'missing'), { previous: null, next: null });
assert.equal(lessonNeighbours(null, [{ _id: 'a' }, { _id: 'b' }], 'a').next._id, 'b');
assert.match(subscriptionMessage({ tier: 'pro', renewalStopped: true, status: 'cancelled' }), /paid access is still active/);
assert.match(subscriptionMessage({ tier: 'free', status: 'authenticated' }), /not confirmed/);
assert.equal(paidThroughLabel('invalid'), null);
assert.equal(paidThroughLabel(null), null);
console.log('PASS: Lesson shortcuts cross modules, handle endpoints and retain module fallback; cancelled-but-paid and unverified billing copy preserve server access state.');
