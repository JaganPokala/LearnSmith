// A fixed preview, independent of generation and account state. Only the answer
// disclosure is interactive; it never submits a quiz attempt or uses allowance.
export default function SampleLesson() {
  return (
    <div className="sample-card">
      <div className="sample-top">
        <span className="eyebrow">Sample course</span>
        <span>Preview · No generation needed</span>
      </div>
      <div className="sample-body">
        <aside className="sample-outline" aria-label="Example course outline">
          <p className="eyebrow">The learning path</p>
          <h3>Making sense of probability</h3>
          <p>Understand chance, one idea at a time.</p>
          <ol>
            <li>
              <span>01</span>
              <div>
                Measuring chance<small>Outcomes and likelihood</small>
              </div>
            </li>
            <li className="sample-selected">
              <span>02</span>
              <div>
                Independent events<small>Current preview</small>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                Expected value<small>Thinking beyond a single result</small>
              </div>
            </li>
          </ol>
        </aside>
        <article
          className="sample-excerpt"
          aria-labelledby="sample-lesson-title"
        >
          <p className="eyebrow">Lesson 02 · A short excerpt</p>
          <h3 id="sample-lesson-title">Does a coin remember?</h3>
          <p>
            A fair coin lands on heads three times in a row. Is tails now more
            likely? It feels that way, but each toss is independent: the next
            toss still has a 50% chance of heads.
          </p>
          <figure className="sample-outcomes">
            <figcaption>
              For two independent tosses of a fair coin, four outcomes are
              equally likely:
            </figcaption>
            <ul aria-label="Possible outcomes of two coin tosses">
              <li>
                <span>H · H</span>
                <small>Heads / Heads</small>
              </li>
              <li>
                <span>H · T</span>
                <small>Heads / Tails</small>
              </li>
              <li>
                <span>T · H</span>
                <small>Tails / Heads</small>
              </li>
              <li>
                <span>T · T</span>
                <small>Tails / Tails</small>
              </li>
            </ul>
            <p>
              Two heads is one of four outcomes: <strong>¼, or 25%.</strong>
            </p>
          </figure>
          <div className="sample-note">
            <p className="eyebrow">Check your understanding</p>
            <p>
              You’ve already tossed heads once. What’s the chance of heads on
              the next toss?
            </p>
            <details>
              <summary>Reveal explanation</summary>
              <p>
                <strong>50%.</strong> The first toss is already known. Only the
                next toss is uncertain, and the coin has no memory of previous
                results.
              </p>
            </details>
          </div>
        </article>
      </div>
      <p className="sample-caption">
        Illustrative preview. Your course outline and lessons are created for
        the topic you choose.
      </p>
    </div>
  );
}
