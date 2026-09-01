import HeadingBlock from './HeadingBlock.jsx';
import ParagraphBlock from './ParagraphBlock.jsx';
import CodeBlock from './CodeBlock.jsx';
import VideoBlock from './VideoBlock.jsx';
import MCQBlock from './MCQBlock.jsx';

// 1. The type → component map.
//
//    Defined OUTSIDE the component. Built inside, it is a new object on every
//    render — harmless here, but it is the same habit that caused the
//    infinite-loop trap in AppLayout, and there is no reason to practise it.
//
//    This object is also the single answer to "which block types exist".
const BLOCKS = {
  heading: HeadingBlock,
  paragraph: ParagraphBlock,
  code: CodeBlock,
  video: VideoBlock,
  mcq: MCQBlock,
};

/**
 * Turns `lesson.content` — a flat array of heterogeneous blocks — into a page.
 *
 * One map, one lookup. No switch statement: a switch spreads the list of known
 * types across a dozen lines of control flow, and the "which types exist"
 * question stops having a single answer.
 *
 * @param {object} props
 * @param {Array<object>} props.blocks  lesson.content
 */
export default function LessonRenderer({ blocks }) {
  // 2. Guard an empty or missing array before mapping. `blocks` is [] for a
  //    lesson that has not been written, and this component should render
  //    nothing rather than an empty <div> with margins.

  if (!blocks?.length) return null;

  // 3. Map over the blocks. For each one:
  //      const Component = BLOCKS[block.type]
  //
  //    Capital C matters: JSX treats a lowercase name as an HTML tag, so
  //    `<component />` silently renders a <component> element that the browser
  //    ignores. No error, no output.
  //
  //    key={i} is correct here — blocks have no ids and the array never
  //    reorders. This is the case the "never key on index" rule exempts.

  return (
    <>
      {blocks.map((block, i) => {
        const Component = BLOCKS[block.type];

        // 4. THE UNKNOWN TYPE. Render a VISIBLE fallback — the type name and
        //    the raw JSON, in a bordered box.
        //
        //    Not null. `Lesson.content` is [Mixed], so Mongoose validates
        //    nothing inside it (FAILURES.md W2): a model that starts emitting
        //    `type: "callout"` would have every one of those blocks silently
        //    vanish, and a vanished block looks exactly like a block that was
        //    never generated. You would go hunting in the prompt for a bug that
        //    lives in this file.
        //
        //    It is ugly on purpose. This box appearing in the demo is a bad
        //    minute; a third of a lesson quietly missing is a bad demo.
        if (!Component) {
          return (
            <div key={i} className="mb-3 border border-warn-line bg-warn-bg px-[13px] py-[11px]">
              <div className="mb-[6px] font-mono text-xs uppercase tracking-[0.13em] text-warn">
                unknown block type: {String(block?.type)}
              </div>

              <pre className="m-0 overflow-x-auto font-mono text-meta leading-[1.6] text-body">
                {JSON.stringify(block, null, 2)}
              </pre>
            </div>
          );
        }

        return <Component key={i} block={block} />;
      })}
    </>
  );
}
