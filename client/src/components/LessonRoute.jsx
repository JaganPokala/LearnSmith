import { lazy, Suspense } from 'react';

const LessonPage = lazy(() => import('../pages/Lesson.jsx'));

export default function LessonRoute() {
  return (
    <Suspense fallback={<p role="status" className="py-8 text-dim">Loading the lesson…</p>}>
      <LessonPage />
    </Suspense>
  );
}
