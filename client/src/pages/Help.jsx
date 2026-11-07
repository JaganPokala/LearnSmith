import { Link } from "react-router-dom";
import { helpSections } from "../content/help.js";
import { useFeatures } from "../hooks/useFeatures.js";

export default function HelpPage() {
  const features = useFeatures();
  return (
    <main id="main-content" className="public-page home-container">
      <header className="public-intro">
        <p className="eyebrow">A little guidance</p>
        <h1>
          Keep your focus
          <br />
          <em>on learning.</em>
        </h1>
        <p>
          Answers about creating courses, saving progress, and managing your
          allowance.
        </p>
      </header>
      <div className="help-layout">
        <nav className="help-topics" aria-label="Help topics">
          {helpSections.map(({ id, title }) => (
            <a href={`#${id}`} key={id}>
              {title} <span aria-hidden="true">↗</span>
            </a>
          ))}
          <Link to="/pricing">Compare plans →</Link>
          <Link to="/billing">Plan & billing →</Link>
        </nav>
        <div className="help-sections">
          {helpSections.map(({ id, title, questions }) => (
            <section id={id} key={id} aria-labelledby={`${id}-title`}>
              <h2 id={`${id}-title`}>{title}</h2>
              {questions.map(([question, answer]) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
              {id === "learning" && features.tts && (
                <details>
                  <summary>How does Hinglish narration work?</summary>
                  <p>
                    Use the lesson’s audio control to explicitly generate
                    narration in Hinglish, with technical terms kept in English.
                    Generating narration uses its own daily allowance. Replay
                    saved audio without generating it again.
                  </p>
                </details>
              )}
            </section>
          ))}
        </div>
      </div>
      <div className="public-bottom">
        <p>Ready to explore something new?</p>
        <Link className="home-primary" to="/#create-course">
          Create a course →
        </Link>
      </div>
    </main>
  );
}
