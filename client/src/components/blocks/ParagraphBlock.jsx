/**
 * { type: 'paragraph', text }
 *
 * Rendered as plain text, deliberately. The model sometimes emits markdown
 * (**bold**, `code`) inside a paragraph, and that will show up literally.
 *
 * The fix is NOT dangerouslySetInnerHTML — that hands the model's output
 * straight to the browser as markup. If the literal asterisks turn out to be a
 * real problem, the answer is a markdown renderer that escapes HTML, and it is
 * a separate decision. Rendering as text is the safe default meanwhile.
 */
export default function ParagraphBlock({ block }) {
  return (
    <p className="mb-[11px] max-w-[66ch] text-base leading-[1.65] text-body">
      {block.text}
    </p>
  );
}
