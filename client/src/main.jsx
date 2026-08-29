import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';

import AppLayout from './layouts/AppLayout.jsx';
import LandingPage from './pages/Landing.jsx';
import LibraryPage from './pages/Library.jsx';
import CoursePage from './pages/Course.jsx';
import LessonPage from './pages/Lesson.jsx';
import NotFoundPage from './pages/NotFound.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* BrowserRouter must wrap everything that uses Link, useParams, etc. */}
    <BrowserRouter>
      <Routes>
        {/* 1. The landing page sits OUTSIDE the app shell — it has no sidebar.
               path="/" element={<LandingPage />} */}

        <Route path="/" element={<LandingPage />} />

        {/* 2. A route with NO path, only an element. It matches nothing by
               itself; its job is to wrap the three routes nested inside it so
               they all share AppLayout.

               <Route element={<AppLayout />}>
                 ...the three app routes...
               </Route>

               This is what keeps the sidebar mounted across navigations. */}

        <Route element={<AppLayout />}>
          {/* 3. Inside that wrapper, three routes:
                   /courses                 -> LibraryPage
                   /courses/:courseId       -> CoursePage
                   /lessons/:lessonId       -> LessonPage

                 The :name segments become useParams() keys, so the name here
                 must match what the page reads. :courseId here means
                 useParams().courseId there — a typo produces `undefined` and a
                 request to /api/courses/undefined, which 400s confusingly. */}

          <Route path="/courses" element={<LibraryPage />} />
          <Route path="/courses/:courseId" element={<CoursePage />} />
          <Route path="/lessons/:lessonId" element={<LessonPage />} />
        </Route>

        {/* 4. A catch-all LAST: path="*" element={<NotFoundPage />}
               Without it an unknown URL renders a blank page with no clue. */}

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
