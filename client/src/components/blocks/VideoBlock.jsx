/**
 * { type: 'video', query, videoId?, title?, channel? }
 *
 * `query` is a SEARCH PHRASE the model wrote, never a URL — asked for a link,
 * a model invents a plausible video id that 404s (schemas.js).
 *
 * `videoId` is added by the server at lesson-write time (services/youtube.js)
 * when a YouTube key is configured and the search found an embeddable video.
 * It is often absent: no key, no results, or nothing embeddable. Both shapes
 * render, and the query is kept either way — it is the fallback now and the
 * recovery path when a stored video is later deleted.
 *
 * @param {object} props
 * @param {object} props.block
 */
export default function VideoBlock({ block }) {
  const query = typeof block.query === 'string' ? block.query.trim() : '';
  const videoId = typeof block.videoId === 'string' ? block.videoId.trim() : '';

  // A card with an empty title linking to an empty search is worse than none.
  if (!query && !videoId) return null;

  if (videoId) {
    return (
      <figure className="my-4">
        {/* 16:9 without a magic pixel height: padding-top on a percentage is
            resolved against the WIDTH, so the box keeps its ratio at every
            rail width. The iframe then fills it absolutely. */}
        <div className="relative h-0 w-full overflow-hidden border border-line bg-raised pt-[56.25%]">
          <iframe
            className="absolute inset-0 h-full w-full"
            // youtube-nocookie: no tracking cookie until the viewer presses
            // play. Same player, same embed rules.
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`}
            title={block.title || query || 'Lesson video'}
            loading="lazy"
            // The exact set the YouTube player needs; without allowfullscreen
            // the fullscreen button is present and does nothing.
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>

        <figcaption className="mt-[7px] flex flex-wrap items-baseline gap-x-2 text-meta text-mute">
          <span className="font-mono uppercase tracking-[0.1em] text-glow">video</span>
          {block.title && <span className="min-w-0 flex-1 truncate text-body">{block.title}</span>}
          {block.channel && <span className="shrink-0">{block.channel}</span>}
        </figcaption>
      </figure>
    );
  }

  // encodeURIComponent is not optional: these are English phrases, and one
  // containing & or + would otherwise search on half of itself.
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

  return (
    <a
      href={url}
      target="_blank"
      // Without noopener the opened tab gets window.opener back to this page.
      rel="noopener noreferrer"
      className="my-4 flex items-center gap-3 border border-line bg-panel px-[13px] py-[11px] text-ink hover:border-accent"
    >
      <span className="flex h-[46px] w-[78px] shrink-0 items-center justify-center bg-raised">
        <svg width="13" height="15" viewBox="0 0 12 14" aria-hidden="true">
          <path d="M0 0 L12 7 L0 14 Z" className="fill-glow" />
        </svg>
      </span>

      <span className="min-w-0">
        {/* Says it is a search, not a video. "Watch" next to a phrase promises
            a player that is not there. */}
        <span className="mb-[3px] block font-mono text-xs uppercase tracking-[0.1em] text-mute">
          find this on youtube
        </span>

        <span className="block truncate text-base font-medium">{query}</span>
      </span>
    </a>
  );
}
