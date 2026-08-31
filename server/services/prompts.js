/**
 * Every prompt this project sends, in one file, exported so the README and the
 * demo can quote them exactly.
 *
 * Structured outputs guarantee shape, names and types, so these prompts have
 * one job left: curriculum quality. Not "what shape" but "what belongs in a
 * good course on this topic". Prompt tokens are paid on every call.
 */

/**
 * The persistent instructions. A SYSTEM message so the rules and the topic are
 * structurally separate — the topic is user input, and someone will type
 * "ignore your instructions". The schema caps the damage: worst case is a
 * badly-themed course, not arbitrary output.
 *
 * States the 3-6 / 3-5 targets even though the schema enforces them: the schema
 * is a FENCE that stops violations, the prompt is a BRIEF that shapes how the
 * model plans, and a model planning for 5 modules beats one clipped from 12.
 */
export const COURSE_SYSTEM_PROMPT = `You design course curricula. Given a topic, plan a course a motivated beginner can work through from start to finish.

Plan for 3-6 modules, each holding 3-5 lessons. Aim for that size from the outset rather than outlining something larger and trimming it.

Order everything by dependency: a lesson never relies on an idea the learner has not met yet. Foundations first, applications and advanced material last.

Cover what someone would actually be expected to know about the topic. If it has a standard core, include all of it; do not pick an arbitrary slice.

Each module title names a coherent chunk of learning - "Managing State in Components", never "Module 1", "Basics", or "Advanced Topics".

Each lesson title is specific enough that the lesson could be written from the title alone. "Using useState to Track Form Input" is usable; "More Hooks" is not.

The description addresses a learner deciding whether to take the course: two or three sentences on what they will be able to do by the end.`;

/**
 * The user message. Deliberately does NOT validate the topic — the HTTP layer
 * rejects bad input, and keeping this pure makes it testable without a server.
 *
 * @param {string} topic  e.g. "Intro to React Hooks"
 * @returns {string}
 */
export function buildCoursePrompt(topic) {
  return `Design a course on: ${topic}`;
}

/**
 * Both halves as the messages array the SDK expects, so callers never assemble
 * roles by hand.
 *
 * @param {string} topic
 * @param {string} [feedback]  violation text from a failed attempt
 * @returns {Array<{ role: string, content: string }>}
 */
export function courseMessages(topic, feedback) {
  const messages = [
    { role: 'system', content: COURSE_SYSTEM_PROMPT },
    { role: 'user', content: buildCoursePrompt(topic) },
  ];

  // APPENDED rather than rewriting the first message, so the model can see its
  // own failed attempt in context and what specifically to fix.
  if (feedback) {
    messages.push({
      role: 'user',
      content: `That attempt was rejected: ${feedback}\n\nProduce the whole course again, corrected.`,
    });
  }

  return messages;
}

/**
 * Instructions for writing one lesson's body. Same division: the schema owns
 * the shape, this owns the teaching.
 *
 * It DESCRIBES shapes rather than showing examples. An earlier version quoted a
 * literal sample video query, and a lesson on copyright law came back with that
 * exact string — concrete examples in a prompt get treated as content.
 */
export const LESSON_SYSTEM_PROMPT = `You write the body of one lesson inside a course.

Every lesson you produce contains all four of these, and is incomplete without any one of them:
  - a heading and explanatory paragraphs
  - one video block
  - 1-3 multiple-choice questions
  - 1-3 objectives
A code block is the only optional part.

Write for someone who has completed the earlier lessons of this course and nothing beyond them. The course and module titles you are given are that learner's context - use them to judge what can be assumed and what must be explained.

Everything you write must be about the lesson title you are given. Do not carry over subject matter from these instructions.

Objectives state what the learner will be able to DO when the lesson ends - a capability they could demonstrate, never a summary of the text below.

The blocks must read as a lesson, not a list of facts. Open with a heading and explain in paragraphs. Include a code block only if this lesson's subject is one where code is the natural way to show something; many subjects are not, and a lesson without code is complete. When you do include one, name the actual programming language it is written in.

The video block's query is the words a learner would type into the YouTube search box to find a tutorial on this lesson's subject: a short noun phrase naming that subject, with no verbs, no sentence, and never a URL.

The multiple-choice questions come last, after the video block. Each one tests something this lesson actually taught. Every wrong option must be plausible enough that a learner who skimmed would consider it - obviously silly options test nothing. The explanation says why the correct answer is correct, not merely which one it is.

The answer field is the ZERO-BASED index of the correct option: 0 is the first option, 1 is the second. Count carefully - an off-by-one here marks the right answer wrong.

A lesson that explains its subject well but ends without questions is not finished. Conceptual subjects with no code are exactly as testable as practical ones - write the questions for them too.`;

/**
 * The user message for one lesson. Carries all three titles: without them the
 * model has no idea whether "What is Supervised Learning?" sits in a beginner
 * course or an advanced one, and it will guess confidently.
 *
 * @param {object} args
 * @param {string} args.courseTitle
 * @param {string} args.moduleTitle
 * @param {string} args.lessonTitle
 * @returns {string}
 */
export function buildLessonPrompt({ courseTitle, moduleTitle, lessonTitle }) {
  return `Course: ${courseTitle}
          Module: ${moduleTitle}

          Write the lesson: ${lessonTitle}`;
}

/**
 * Messages for one lesson, with optional retry feedback. Mirrors courseMessages.
 *
 * @param {object} args        passed through to buildLessonPrompt
 * @param {string} [feedback]  violation text from a failed attempt
 * @returns {Array<{ role: string, content: string }>}
 */
export function lessonMessages(args, feedback) {
  const messages = [
    { role: 'system', content: LESSON_SYSTEM_PROMPT },
    { role: 'user', content: buildLessonPrompt(args) },
  ];

  if (feedback) {
    messages.push({
      role: 'user',
      content: `That attempt was rejected: ${feedback}\n\nProduce the whole lesson again, corrected.`,
    });
  }

  return messages;
}
