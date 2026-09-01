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
import { api } from './lib/api.js';
import AuthProvider from './components/AuthProvider.jsx';

// Render's free tier spins the API down after ~15 minutes idle, and the next
// request pays the cold start. Firing this at module load — before React even
// mounts — means the instance wakes while the user is reading the landing page
// or typing a topic, instead of while they watch a spinner.
//
// Fire and forget, and the .catch is not optional: an unhandled rejection in
// the console looks like a bug, and a failure here means nothing on its own.
// The real request is what reports a genuinely unreachable server.
api.get('/api/health').catch(() => {});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* AuthProvider OUTSIDE BrowserRouter: Auth0 finishes a login by replacing
        the URL, and the router has to read the result of that, not race it.
        A passthrough entirely when Auth0 is not configured. */}
    <AuthProvider>
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
    </AuthProvider>
  </StrictMode>,
);
