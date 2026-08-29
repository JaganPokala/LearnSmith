/**
 * "2d ago", "4h ago", "just now" — what the design shows.
 *
 * @param {string} iso  an ISO date string from the API
 * @returns {string}
 */
export function timeAgo(iso) {
  // 1. Parse it and get the difference from now in seconds.
  //
  // 2. Return the largest unit that fits:
  //      < 60s      "just now"
  //      < 60m      "Nm ago"
  //      < 24h      "Nh ago"
  //      < 7d       "Nd ago"
  //      otherwise  a plain date, e.g. toLocaleDateString()
  //
  // 3. Guard a missing or unparseable date — Number.isNaN(d.getTime()). The API
  //    always sends createdAt, but this function will get reused somewhere that
  //    does not, and "NaN ago" on screen is worse than an empty string.

  // null before parsing: new Date(null) is not an invalid date, it is the
  // epoch — so the NaN check below waves it through and the row reads
  // "1/1/1970". Missing and unparseable both have to return the same nothing.
  if (!iso) return '';

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return '';

  // Math.floor, so a clock a second ahead of the server reads "just now"
  // rather than "-1m ago".
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}
