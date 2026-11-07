import { Link } from "react-router-dom";

export default function LessonRow({ number, lesson, completed = false }) {
  return (
    <Link to={`/lessons/${lesson._id}`} className="learning-lesson">
      <span>{number}</span>
      <span className="learning-lesson-title">{lesson.title}</span>
      <span className="learning-lesson-state">
        <span>{lesson.isEnriched ? "Ready to read" : "Not generated"}</span>
        {completed && <span className="text-ok">✓ Completed</span>}
      </span>
    </Link>
  );
}
