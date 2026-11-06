/**
 * { type: 'heading', text }
 *
 * Rendered as <h2>, never <h1>. The lesson title above is the page's only h1,
 * and a document with several h1s is a document with no outline — screen
 * readers and the browser's own heading navigation both use that structure.
 *
 * The content array is FLAT: there is no nesting, so every heading is the same
 * level. That is a limitation of the schema, not something to fake here.
 */
export default function HeadingBlock({ block, id }) {
  return (
    <h2 id={id} tabIndex={-1} className="lesson-section-heading mb-4 mt-10 scroll-mt-6 border-t border-line pt-7 text-2xl font-semibold tracking-[-0.02em] text-ink first:mt-0 first:border-0 first:pt-0">
      {block.text}
    </h2>
  );
}
