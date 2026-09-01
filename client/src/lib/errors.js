/**
 * What each API error code means, and what the user should do about it.
 *
 * ONE TABLE, imported by every screen. Course.jsx and Lesson.jsx each carried
 * their own copy before this file existed, and the two had already drifted in
 * wording — with fourteen codes and three pages that becomes unmaintainable.
 *
 * The important field is `retry`. Half of these are worth trying again
 * immediately and half are not, and a single "something went wrong" screen with
 * a Try again button on it gives wrong advice to the second half.
 */

/**
 * `noun` is substituted into the messages that read differently per page —
 * `invalid_id` on the course page is "a course link", on the lesson page
 * "a lesson link".
 *
 * @param {string} noun  'course' | 'lesson'
 * @returns {Record<string, { title: string, detail?: string, retry: boolean }>}
 */
function table(noun) {
  return {
    // ── the generation failed. Trying again genuinely helps: a different
    //    sampling of the model usually succeeds where one attempt did not.
    ai_unavailable: {
      title: 'The AI service did not answer',
      detail: 'This is usually a passing blip on their side rather than anything wrong with your topic.',
      retry: true,
    },
    ai_truncated: {
      title: 'The response was cut off partway',
      detail: 'The model ran out of room mid-answer. A second attempt is usually shorter and completes.',
      retry: true,
    },
    ai_empty: {
      title: 'The model returned nothing',
      detail: 'It declined to answer rather than failing. A differently worded topic often works.',
      retry: true,
    },
    ai_unparseable: {
      title: 'The response could not be read',
      detail: 'What came back was not the shape we asked for. Trying again almost always fixes it.',
      retry: true,
    },
    ai_invalid_course: {
      title: 'The course that came back was not usable',
      detail: 'It failed the checks we run before saving — wrong module counts, or empty titles. Nothing was saved.',
      retry: true,
    },
    ai_invalid_lesson: {
      title: 'The lesson that came back was not usable',
      detail: 'It failed the checks we run before saving. Nothing was saved.',
      retry: true,
    },

    // ── our own client-side deadline. The server is UP; it is just slow, and it
    //    may well still be working on this.
    timeout: {
      title: 'The server did not answer in time',
      detail: 'It may still be finishing in the background — try again in a moment and it may come back instantly.',
      retry: true,
    },

    // ── not the user's fault, and NOT worth an immediate retry: the same
    //    request will fail the same way until something outside changes.
    database_unavailable: {
      title: 'The database is unreachable',
      detail: 'Nothing was saved, and this is on our side rather than yours. It usually clears on its own.',
      retry: false,
    },
    network_error: {
      title: 'Cannot reach the server',
      detail: 'Check your connection. If you are running this locally, make sure the backend is started.',
      retry: false,
    },

    // ── the request itself was wrong. Retrying it unchanged cannot work.
    invalid_id: {
      title: `That does not look like a ${noun} link`,
      detail: 'The address is malformed. Check the link you followed.',
      retry: false,
    },
    prompt_too_long: {
      title: 'That topic is too long',
      detail: 'Name a subject rather than describing one — a few words is enough.',
      retry: false,
    },
    empty_prompt: { title: 'Type a topic first', retry: false },
    missing_prompt: { title: 'Type a topic first', retry: false },

    // ── narration. None is retryable in place: the lesson has to change, or
    //    the server does.
    nothing_to_narrate: {
      title: 'There is nothing to read aloud yet',
      detail: 'Write the lesson first — narration is generated from its text.',
      retry: false,
    },
    audio_not_found: {
      title: 'This lesson has no narration yet',
      detail: 'Generate it and it will be saved for next time.',
      retry: false,
    },
    tts_unavailable: {
      title: 'Narration is not available right now',
      detail: 'The speech service did not answer. Nothing was charged and nothing was saved.',
      retry: true,
    },

    // ── signed out. Retrying the same anonymous request can never succeed;
    //    the screen offers a sign-in button instead of a Try again.
    not_authenticated: {
      title: 'Sign in to see your courses',
      detail: 'Your library is private. Courses made without an account are not saved to one.',
      retry: false,
    },
    invalid_token: {
      title: 'Your session has expired',
      detail: 'Sign in again to pick up where you left off.',
      retry: false,
    },

    // ── it is gone. Nothing to retry.
    course_not_found: {
      title: 'This course does not exist, or was deleted',
      retry: false,
    },
    lesson_not_found: {
      title: 'This lesson does not exist, or was deleted',
      retry: false,
    },
  };
}

/**
 * Describe an ApiError for display.
 *
 * Falls back to the server's own message for a code we have no entry for. That
 * fallback is deliberate: the backend writes readable messages, so an unknown
 * code degrades to something specific rather than to "something went wrong".
 *
 * @param {Error & { code?: string }} error
 * @param {string} [noun]  'course' | 'lesson', for the messages that differ
 * @returns {{ title: string, detail?: string, retry: boolean }}
 */
export function describeError(error, noun = 'course') {
  const entry = table(noun)[error?.code];

  if (entry) return entry;

  return {
    title: error?.message ?? 'Something went wrong',
    // Unknown codes are treated as retryable. Offering a button that does
    // nothing is a smaller failure than hiding the only way out of a screen.
    retry: true,
  };
}
