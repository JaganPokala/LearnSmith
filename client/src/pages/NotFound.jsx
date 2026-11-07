import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main id="main-content" className="home-container public-page">
      <p className="eyebrow">Page not found</p>
      <h1>
        Let’s get you back
        <br />
        to learning.
      </h1>
      <p className="home-intro">
        This address doesn’t match a page. Check the link, or return to your
        courses.
      </p>
      <div className="public-bottom">
        <Link to="/courses" className="home-primary">
          Go to my learning →
        </Link>
        <Link to="/" className="home-text-link">
          Back to home
        </Link>
      </div>
    </main>
  );
}
