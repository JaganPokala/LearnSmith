import { useState } from 'react';

/**
 * { type: 'mcq', question, options, answer, explanation }
 *
 * `answer` is a ZERO-BASED INDEX into `options`, not the text of the option.
 * Real example:
 *
 *     options: ['Simple Reflex Agent', 'Model-Based Reflex Agent', ...]
 *     answer:  1                        -> 'Model-Based Reflex Agent'
 *
 * THIS COMPONENT HOLDS ITS OWN STATE, and that is the whole reason it is a
 * component rather than a chunk of JSX inside LessonRenderer.
 *
 * A lesson carries up to three MCQs. One `selected` value on the page is shared
 * by all three, so answering question 1 reveals the answers to 2 and 3 at the
 * same moment. Each question needs its own cell, and the way you get one cell
 * per question in React is one component instance per question.
 *
 * @param {object} props
 * @param {object} props.block
 */
export default function MCQBlock({ block }) {
  // 1. One piece of state: the index the user picked, null before they answer.
  //    `answered` is derived from it (selected !== null), not stored separately
  //    — two pieces of state that must agree are two pieces of state that will
  //    eventually disagree.

  const [selected, setSelected] = useState(null);

  // 2. VALIDATE THE BLOCK BEFORE RENDERING IT.
  //
  //    The server-side validator checks that `answer` indexes a real option
  //    (lessonGenerator.js) — but it checks lessons at GENERATION time. Nothing
  //    re-checks what is already in the database, and `content` is [Mixed] so
  //    Mongoose validates none of it (W2).
  //
  //    So guard here too: options must be an array with entries, and `answer`
  //    must be an integer in range. If not, render the question and options
  //    with grading disabled rather than crashing on options[answer].
  //
  //    Silent-failure rule: this is a decision that can quietly go wrong, so
  //    console.warn the block when the guard fires. A question that never
  //    grades looks like a styling bug from the outside.

  const options = Array.isArray(block.options) ? block.options : [];

  const gradable =
    options.length > 0 &&
    Number.isInteger(block.answer) &&
    block.answer >= 0 &&
    block.answer < options.length;

  if (!gradable) {
    console.warn('MCQBlock: cannot grade this question, rendering it read-only', block);
  }

  // Derived, never stored: two pieces of state that must agree are two pieces
  // of state that will eventually disagree.
  const answered = selected !== null;

  // 3. Clicking an option sets `selected`. Once answered, the buttons LOCK —
  //    disabled, no further changes. A quiz you can re-answer after seeing the
  //    result is not a quiz.

  const locked = answered || !gradable;

  return (
    <div className="mt-[18px] border border-line bg-white p-[14px]">
      <div className="mb-[9px] font-mono text-[8.5px] uppercase tracking-[0.13em] text-[#8b95a1]">
        Question
      </div>

      <p className="mb-[9px] text-[13px] font-semibold">{block.question}</p>

      {/* 4. The four states of one option button. The correct answer is
             revealed even when the user picked something else — showing only
             "wrong" teaches nothing. A mark rides alongside the colour so the
             state survives a colourblind viewer and a greyscale projector,
             which is what a demo screen may well be. */}
      {options.map((option, i) => {
        const isCorrect = gradable && i === block.answer;
        const isPicked = selected === i;

        let tone = 'border-[#e4e7eb] text-[#4a535f]';
        let mark = '';

        if (answered && isCorrect) {
          tone = 'border-accent bg-[#f2fbfd] text-[#0a5567]';
          mark = '✓';
        } else if (answered && isPicked) {
          tone = 'border-[#e5b4b0] bg-[#fdf3f2] text-[#a8322b]';
          mark = '✗';
        } else if (answered) {
          tone = 'border-[#e4e7eb] text-[#9aa4b0]';
        } else {
          tone += ' hover:border-accent';
        }

        return (
          <button
            key={i}
            type="button"
            onClick={() => setSelected(i)}
            disabled={locked}
            className={`mb-[5px] flex w-full items-center gap-[9px] border px-[10px] py-[7px] text-left text-[12px] disabled:cursor-default ${tone}`}
          >
            <span className="w-3 shrink-0 font-mono text-[9.5px] text-[#9aa4b0]">
              {String.fromCharCode(65 + i)}
            </span>

            <span className="min-w-0 flex-1">{option}</span>

            {mark && <span className="shrink-0 font-mono text-[11px]">{mark}</span>}
          </button>
        );
      })}

      {/* 5. The explanation is why the schema asks for one (Milestone 8) and is
             the pedagogically useful part of the whole block. Nothing at all if
             the field is missing. */}
      {answered && block.explanation && (
        <div className="mt-[9px] border-l-2 border-l-chip-built pl-[10px] text-[11.5px] leading-[1.6] text-[#4a535f]">
          <b className="mb-[3px] block font-mono text-[9px] uppercase tracking-[0.11em] text-[#0d6b5c]">
            Why {String.fromCharCode(65 + block.answer)}
          </b>
          {block.explanation}
        </div>
      )}
    </div>
  );
}
