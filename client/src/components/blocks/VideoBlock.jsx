/**
 * { type: 'video', query }
 *
 * `query` IS A SEARCH QUERY, NOT A URL. Real example from the database:
 *
 *     { "type": "video", "query": "Types of Intelligent Agents" }
 *
 * You cannot put that in an <iframe src>. The prompt deliberately asks for a
 * query rather than a URL because a model asked for a URL invents one — a
 * plausible youtube.com/watch?v=... that 404s (schemas.js:174).
 *
 * Phase 9 resolves queries to real videos through the YouTube API. Until then
 * this renders as a link to the search results, which is honest: it says what
 * to look for and gets the user there in one click.
 *
 * @param {object} props
 * @param {object} props.block
 */
export default function VideoBlock({ block }) {
  // 2. Render nothing at all if `query` is missing or blank. A "Watch:" card
  //    with an empty title linking to an empty search is worse than no card.

  const query = typeof block.query === 'string' ? block.query.trim() : '';

  if (!query) return null;

  // 1. Build the search URL.
  //
  //    encodeURIComponent is not optional. These queries are English phrases
  //    with spaces, and some contain & or + — "React & Redux" pasted raw makes
  //    everything after the & a separate URL parameter, and the search silently
  //    runs on half the phrase.

  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

  // 3. The card: a bordered row with a small mono label, the query as the
  //    visible text, and the whole thing an <a>.
  //
  //    target="_blank" so the lesson is not lost — and rel="noopener noreferrer"
  //    with it. Without noopener the opened tab gets a handle back to this page
  //    through window.opener and can navigate it somewhere else.

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="my-4 flex items-center gap-3 border border-line bg-white px-[13px] py-[11px] text-ink hover:border-accent"
    >
      <span className="flex h-[46px] w-[78px] shrink-0 items-center justify-center bg-ink">
        <svg width="13" height="15" viewBox="0 0 12 14" aria-hidden="true">
          <path d="M0 0 L12 7 L0 14 Z" fill="#22d3ee" />
        </svg>
      </span>

      <span className="min-w-0">
        {/* 4. Say it is a search, not a video. A label reading "watch" next to
               a phrase promises an embedded player that is not there; this sets
               the right expectation and stops being a lie the moment Phase 9
               lands. */}
        <span className="mb-[3px] block font-mono text-[9px] uppercase tracking-[0.1em] text-[#8b95a1]">
          find this on youtube
        </span>

        <span className="block truncate text-[12.5px] font-medium">{query}</span>
      </span>
    </a>
  );
}
