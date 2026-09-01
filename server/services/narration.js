/**
 * Turns a lesson into the words a narrator should say.
 *
 * Pure and dependency-free: no model, no network, no database. That is what
 * makes the "does it read JSON keys out loud" question answerable by running it
 * rather than by listening to a generated file.
 *
 * WHAT IS READ            WHY
 *   title                 the listener needs to know what this is
 *   objectives            the "you will be able to" list is the summary
 *   heading, paragraph    the teaching content
 *
 * WHAT IS SKIPPED         WHY
 *   code                  "const open-bracket count comma set-count" is noise
 *   video                 a search phrase, not prose
 *   mcq                   a quiz is a thing you do, not a thing you hear;
 *                         and the options are meaningless without seeing them
 *   unknown types         anything the renderer would show as a warning box
 */

/** Block types whose `text` field is spoken, in the order they appear. */
const SPOKEN = new Set(['heading', 'paragraph']);

/**
 * @param {object} lesson  { title, objectives, content }
 * @returns {string} plain prose, ready to translate and speak
 */
export function narrationText(lesson) {
  const parts = [];

  const title = typeof lesson?.title === 'string' ? lesson.title.trim() : '';

  if (title) parts.push(title);

  // Spoken as one sentence with a lead-in, or the list arrives as three
  // unconnected fragments with no clue what they are.
  const objectives = Array.isArray(lesson?.objectives)
    ? lesson.objectives.filter((o) => typeof o === 'string' && o.trim())
    : [];

  if (objectives.length > 0) {
    // Trailing punctuation is stripped before joining. The model usually ends
    // each objective with a full stop, and joining those with ". " produces
    // "…rocketry.. Identify…" — which a narrator reads as a stumble, not a
    // pause. Caught by printing what would actually be spoken.
    const spoken = objectives.map((o) => o.trim().replace(/[.!?;,]+$/, '')).filter(Boolean);

    parts.push(`In this lesson you will be able to: ${spoken.join('. ')}.`);
  }

  const blocks = Array.isArray(lesson?.content) ? lesson.content : [];

  for (const block of blocks) {
    if (!SPOKEN.has(block?.type)) continue;

    const text = typeof block.text === 'string' ? block.text.trim() : '';

    if (text) parts.push(text);
  }

  // Single spaces and no double punctuation: the model reads runs of whitespace
  // as pauses, and a stray "..\n\n" becomes an audible stumble.
  return parts.join('\n\n').replace(/[ \t]+/g, ' ').trim();
}

/**
 * Split text for a TTS API that caps input length.
 *
 * Splits on SENTENCE boundaries, never mid-word: a chunk that ends "the rocket
 * eng" is audibly wrong, and the join between two chunks is where it shows.
 *
 * @param {string} text
 * @param {number} limit  max characters per chunk
 * @returns {string[]}
 */
export function chunkForSpeech(text, limit) {
  const clean = typeof text === 'string' ? text.trim() : '';

  if (!clean) return [];
  if (clean.length <= limit) return [clean];

  // Keep the terminator with its sentence — splitting it off makes the narrator
  // run two sentences together.
  const sentences = clean.match(/[^.!?\n]+[.!?]*\s*/g) ?? [clean];

  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    // One sentence longer than the whole limit: nothing to split on, so it goes
    // out on its own and the caller's API truncates it rather than us silently
    // dropping it.
    if (sentence.length > limit) {
      if (current) chunks.push(current.trim());
      chunks.push(sentence.trim());
      current = '';
      continue;
    }

    if ((current + sentence).length > limit) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks.filter(Boolean);
}
