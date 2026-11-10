import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import AppLayout from './layouts/AppLayout.jsx';
import PublicLayout from './layouts/PublicLayout.jsx';
import LandingPage from './pages/Landing.jsx';
import LibraryPage from './pages/Library.jsx';
import CoursePage from './pages/Course.jsx';
import NotFoundPage from './pages/NotFound.jsx';
import { CreateCoursePage, BillingPage } from './app/learningPages.jsx';
import { PricingPage, HelpPage } from './app/publicPages.jsx';
import { loadFeatures } from './hooks/useFeatures.js';
import AuthProvider from './components/AuthProvider.jsx';
import UsageProvider from './components/UsageProvider.jsx';
import LessonRoute from './components/LessonRoute.jsx';

// Start the shared feature check while the app mounts.
void loadFeatures();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      {/* Auth redirects need Router navigation; usage needs the resolved identity. */}
      <AuthProvider>
        <UsageProvider>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
            {/* The app shell stays mounted between learning pages. Pages supply
                their course outline through the shared outlet context. */}
            <Route element={<AppLayout />}>
              <Route path="/courses" element={<LibraryPage />} />
              <Route path="/courses/new" element={<CreateCoursePage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/courses/:courseId" element={<CoursePage />} />
              <Route path="/lessons/:lessonId" element={<LessonRoute />} />
            </Route>
          </Routes>
        </UsageProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
