/**
 * The action on a failure screen, shown only for errors where trying again can
 * actually work — `retry: true` in lib/errors.js.
 *
 * A button on `database_unavailable` would be a lie: the same request fails the
 * same way until something outside the app changes.
 *
 * @param {object} props
 * @param {() => void} props.onClick
 * @param {string} [props.label]
 */
export default function RetryButton({ onClick, label = 'Try again' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-accent-line bg-accent-bg px-[13px] py-[6px] text-sm font-semibold text-glow hover:border-glow hover:bg-raised"
    >
      {label}
    </button>
  );
}
