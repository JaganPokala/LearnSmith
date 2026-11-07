import { Link } from "react-router-dom";
import PromptForm from "../components/PromptForm.jsx";
import UsagePanel from "../components/UsagePanel.jsx";
import { useAuth } from "../lib/auth.js";
import { useFeatures } from "../hooks/useFeatures.js";
import SampleLesson from "../features/home/SampleLesson.jsx";
import { learningFeatures, steps, questions } from "../content/home.js";
import "../styles/home.css";

export default function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const features = useFeatures();
  return (
    <main id="main-content">
      <section
        className="home-hero home-container"
        aria-labelledby="hero-heading"
      >
        <div>
          <p className="eyebrow">A little curiosity. A path forward.</p>
          <h1 id="hero-heading">
            Turn a topic into your next <em>learning path.</em>
          </h1>
          <p className="home-intro">
            Create an AI-generated course. Learn at your pace and pick up where
            you left off.
          </p>
          <a className="home-text-link" href="#sample">
            Preview a sample lesson ↗
          </a>
          {isAuthenticated && (
            <Link className="home-text-link" to="/courses">
              Continue learning →
            </Link>
          )}
        </div>
        <div className="home-create" id="create-course">
          <PromptForm variant="hero" />
          <p className="home-helper">
            Start with an outline. Generate individual lessons when you’re
            ready.
          </p>
          {!isLoading && !isAuthenticated && (
            <p className="home-helper">
              Try as a guest, or sign in first for higher daily limits and an
              account library. Guest courses stay separate.
            </p>
          )}
          <UsagePanel summaryOnly />
        </div>
      </section>
      <section
        className="home-sample home-container home-section"
        id="sample"
        aria-labelledby="sample-section-title"
      >
        <div className="sample-introduction">
          <div>
            <p className="eyebrow">Inside a course</p>
            <h2 id="sample-section-title">
              A clear path.
              <br />
              An idea that clicks.
            </h2>
          </div>
          <p className="home-intro">
            See how a topic becomes focused lessons, clear explanations, and
            questions that make you think. Here’s a short preview from a course
            on probability.
          </p>
        </div>
        <SampleLesson />
      </section>
      <section
        className="home-section home-container"
        id="how-it-works"
        aria-labelledby="steps-heading"
      >
        <p className="eyebrow">One step at a time</p>
        <h2 id="steps-heading">From curiosity to steady progress.</h2>
        <ol className="home-steps">
          {steps.map(([title, body], index) => (
            <li key={title}>
              <span className="step-number">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section
        className="home-feature-section"
        aria-labelledby="features-heading"
      >
        <div className="home-container home-section">
          <p className="eyebrow">Make room for learning</p>
          <h2 id="features-heading">Built for the way you learn.</h2>
          <div className="home-features">
            {[
              ...learningFeatures,
              ...(features.tts
                ? [
                    [
                      "Listen in Hinglish",
                      "Generate AI narration with technical terms kept in English.",
                    ],
                  ]
                : []),
            ].map(([title, body]) => (
              <article key={title}>
                <span aria-hidden="true" className="feature-mark">
                  ↗
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
          <div className="home-plan">
            <div>
              <h3>Start free. Get more room with Pro.</h3>
              <p>
                Pro increases your daily generation allowances. Explore current
                pricing and limits.
              </p>
            </div>
            <Link className="home-secondary" to="/pricing">
              Compare plans →
            </Link>
          </div>
        </div>
      </section>
      <section
        className="home-section home-container home-faq"
        id="questions"
        aria-labelledby="faq-heading"
      >
        <div>
          <p className="eyebrow">Before you begin</p>
          <h2 id="faq-heading">A few things to know.</h2>
        </div>
        <div>
          {questions.map(([title, body]) => (
            <details key={title}>
              <summary>{title}</summary>
              <p>{body}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="home-final home-container">
        <h2>What will you learn next?</h2>
        <a className="home-primary" href="#create-course">
          Create a course →
        </a>
      </section>
    </main>
  );
}
