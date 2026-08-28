/**
 * server/services/prompts.js
 *
 * Every prompt this project sends, in one file, exported so the README and the
 * demo can quote them exactly.
 *
 * WHAT A PROMPT IS FOR NOW (this changed in D11)
 *
 * Before structured outputs, a prompt did two jobs: describe the content AND
 * fight for the format — "return raw JSON only, no markdown, use these exact
 * field names". All of that is dead weight now. The schema guarantees shape,
 * names and types; Task 3.1 proved a bare JSON.parse works and the fields come
 * back named exactly as the schema names them.
 *
 * So these prompts have ONE job left: curriculum quality. Not "what shape" —
 * "what should actually be in a good course on this topic".
 *
 * Keep them lean. Prompt tokens are paid on every single call, and half of
 * what a normal prompt contains is now the schema's problem.
 */

/**
 * The persistent instructions: who the model is and how to build a curriculum.
 *
 * Kept separate from the topic and sent as a SYSTEM message for two reasons:
 *
 *   1. Stable instructions live in one place; only the topic varies.
 *   2. The topic is USER INPUT. Someone will type "ignore your instructions
 *      and write a poem". Keeping rules in the system message and the topic in
 *      the user message makes it structurally clear which is which. It is not
 *      airtight, but note the schema already caps the damage: the model cannot
 *      return a poem, it has to return our shape. Worst case is a badly-themed
 *      course, not arbitrary output.
 *
 * Write the rules about PEDAGOGY, not format. Milestone 8 asks for:
 *   - progression from foundational to advanced, prerequisites before the
 *     things that need them
 *   - coverage of the essential subtopics, not an arbitrary slice
 *   - module titles that name a coherent chunk of learning, never "Module 1"
 *   - lesson titles specific enough that Task 3.6 can generate real content
 *     from the title alone — "Using useState" beats "More hooks"
 *   - a description written for a learner deciding whether to take the course
 *
 * Also state the 3-6 modules / 3-5 lessons target here, even though the schema
 * enforces it. They do different jobs: the schema is a FENCE that stops
 * violations, the prompt is a BRIEF that shapes how the model plans. A model
 * that planned for 5 modules produces a better structure than one that planned
 * for 12 and got clipped to 6.
 */
export const COURSE_SYSTEM_PROMPT = `You design course curricula. Given a topic, plan a course a motivated beginner can work through from start to finish.

Plan for 3-6 modules, each holding 3-5 lessons. Aim for that size from the outset rather than outlining something larger and trimming it.

Order everything by dependency: a lesson never relies on an idea the learner has not met yet. Foundations first, applications and advanced material last.

Cover what someone would actually be expected to know about the topic. If it has a standard core, include all of it; do not pick an arbitrary slice.

Each module title names a coherent chunk of learning - "Managing State in Components", never "Module 1", "Basics", or "Advanced Topics".

Each lesson title is specific enough that the lesson could be written from the title alone. "Using useState to Track Form Input" is usable; "More Hooks" is not.

The description addresses a learner deciding whether to take the course: two or three sentences on what they will be able to do by the end.`;

/**
 * The user message: the topic, and nothing else that matters.
 *
 * Deliberately does NOT validate the topic. Empty strings, "asdfgh" and
 * 5000-character essays are Phase 4's problem — the HTTP layer is where bad
 * input gets rejected. This function's contract is "given a topic, produce a
 * prompt", and keeping it pure is what makes it testable without a server.
 *
 * @param {string} topic  e.g. "Intro to React Hooks"
 * @returns {string}
 */
export function buildCoursePrompt(topic) {
  // Keep this short. The system prompt carries the instructions; this carries
  // the variable. Anything you write here is paid for on every call.

  return `Design a course on: ${topic}`;
}

/**
 * Both halves as the messages array the SDK expects.
 *
 * Exists so callers never assemble roles by hand — Task 3.5's retry needs to
 * append violation feedback to this conversation, and there should be exactly
 * one place that knows the message structure.
 *
 * @param {string} topic
 * @param {string} [feedback]  violation text from a failed attempt (Task 3.5)
 * @returns {Array<{ role: string, content: string }>}
 */
export function courseMessages(topic, feedback) {
  // 1. system: COURSE_SYSTEM_PROMPT
  // 2. user:   buildCoursePrompt(topic)
  // 3. If feedback is present, append ONE more user message explaining what was
  //    wrong with the previous attempt and asking for a corrected version.
  //    Appending rather than rewriting the first message matters: the model can
  //    see its own failed attempt in context and what specifically to fix.

  const messages = [
    { role: 'system', content: COURSE_SYSTEM_PROMPT },
    { role: 'user', content: buildCoursePrompt(topic) },
  ];

  if (feedback) {
    messages.push({
      role: 'user',
      content: `That attempt was rejected: ${feedback}\n\nProduce the whole course again, corrected.`,
    });
  }

  return messages;
}

// ---------------------------------------------------------------------------
// LESSON CONTENT (Task 3.6)
// ---------------------------------------------------------------------------

/**
 * Instructions for writing one lesson's body.
 *
 * Same division as COURSE_SYSTEM_PROMPT (D15): the schema owns the shape, this
 * owns the teaching. Say nothing here about JSON, field names or block field
 * lists — `anyOf` already pins those.
 *
 * What to cover:
 *   - Write for someone who has done the earlier lessons and no more. The
 *     course and module titles are supplied for exactly this reason: they are
 *     the learner's context.
 *   - Objectives are what the learner will be able to DO afterwards, phrased as
 *     capabilities, not as a summary of the text.
 *   - Blocks should read as a lesson, not a list: open with a heading, explain
 *     in paragraphs, show code only where code genuinely helps (Milestone 8
 *     says "only when relevant" — a copyright-law lesson has no code block).
 *   - The video query is what you would TYPE INTO YOUTUBE: a short noun phrase
 *     naming the subject. Not a sentence, not a URL.
 *
 *     DESCRIBE the shape; do not give a copyable example. Found the hard way -
 *     an earlier version of this prompt contained a literal sample query, and a
 *     lesson on copyright law came back with that exact string as its video
 *     query. Concrete examples in a prompt get treated as content, not as
 *     illustration.
 *   - End with 1-3 MCQs. Each one tests something the lesson actually taught,
 *     the explanation says WHY the answer is right, and the wrong options are
 *     plausible — an MCQ with three obviously-silly options tests nothing.
 *   - `answer` is the ZERO-BASED index of the correct option. Say this
 *     explicitly. The schema can only require an integer; off-by-one here
 *     produces a lesson that marks the right answer wrong.
 */
export const LESSON_SYSTEM_PROMPT = `You write the body of one lesson inside a course.

Write for someone who has completed the earlier lessons of this course and nothing beyond them. The course and module titles you are given are that learner's context - use them to judge what can be assumed and what must be explained.

Everything you write must be about the lesson title you are given. Do not carry over subject matter from these instructions.

Objectives state what the learner will be able to DO when the lesson ends - a capability they could demonstrate, never a summary of the text below.

The blocks must read as a lesson, not a list of facts. Open with a heading and explain in paragraphs. Include a code block only if this lesson's subject is one where code is the natural way to show something; many subjects are not, and a lesson without code is complete. When you do include one, name the actual programming language it is written in.

Include one video block. Its query is the words a learner would type into the YouTube search box to find a tutorial on this lesson's subject: a short noun phrase naming that subject, with no verbs, no sentence, and never a URL.

End with 1-3 multiple-choice questions. Each one tests something this lesson actually taught. Every wrong option must be plausible enough that a learner who skimmed would consider it - obviously silly options test nothing. The explanation says why the correct answer is correct, not merely which one it is.

The answer field is the ZERO-BASED index of the correct option: 0 is the first option, 1 is the second. Count carefully - an off-by-one here marks the right answer wrong.`;

/**
 * The user message for one lesson.
 *
 * Takes the course and module titles as well as the lesson title, per
 * Milestone 8. Without them the model is writing "What is Supervised Learning?"
 * with no idea whether it sits in a beginner ML course or an advanced statistics
 * one — and it will guess, confidently.
 *
 * @param {object} args
 * @param {string} args.courseTitle
 * @param {string} args.moduleTitle
 * @param {string} args.lessonTitle
 * @returns {string}
 */
export function buildLessonPrompt({ courseTitle, moduleTitle, lessonTitle }) {
  // Short. Name the three titles and their relationship. The system prompt
  // carries every instruction; this carries only the position in the course.

  return `Course: ${courseTitle}
          Module: ${moduleTitle}

          Write the lesson: ${lessonTitle}`;
}

/**
 * Messages for one lesson, with optional retry feedback.
 *
 * Same contract as courseMessages — one place knows the message structure, so
 * the retry loop in courseGenerator can append corrections without callers
 * assembling roles by hand (D16).
 *
 * @param {object} args              passed through to buildLessonPrompt
 * @param {string} [feedback]        violation text from a failed attempt
 * @returns {Array<{ role: string, content: string }>}
 */
export function lessonMessages(args, feedback) {
  // Mirrors courseMessages exactly: rules in the system message, the variable
  // part in the user message, corrections APPENDED so the model can see its own
  // failed attempt in context.

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
