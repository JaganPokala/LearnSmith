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
export default function HeadingBlock({ block }) {
  return (
    <h2 className="mt-[26px] mb-[9px] text-[15.5px] font-bold tracking-[-0.01em] text-ink first:mt-0">
      {block.text}
    </h2>
  );
}
