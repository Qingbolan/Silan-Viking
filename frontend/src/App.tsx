import React from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import './i18n/index'; // Initialize i18n
import MainLayout from './layout/MainLayout';
import { ThemeProvider } from './components/ThemeContext';
import { LanguageProvider, useLanguage } from './components/LanguageContext';
import { PageTitleProvider } from './layout/PageTitleContext';
import { ErrorBoundary, NotFoundError, Spinner, ToastProvider } from './components/ds';
import { AuthProvider } from './components/InteractiveContact';
import { Seo } from './components/Seo';

// Every public route owns a separate production chunk. The previous eager
// imports made a first-time visitor download the blog editor, project
// discussions, contact workflow and résumé renderer before seeing the home
// hero. Route boundaries are the natural ownership boundary for that code.
const ResumeWebsite = React.lazy(() => import('./views/ResumeWebsite'));
const Moments = React.lazy(() => import('./views/Moments'));
const MomentDetail = React.lazy(() => import('./views/MomentDetail'));
const InteractiveContactPage = React.lazy(() => import('./views/InteractiveContactPage'));
const ProjectGallery = React.lazy(() => import('./views/ProjectGallery'));
const ProjectDetail = React.lazy(() => import('./components/ProjectGallery/ProjectDetail'));
const BlogStack = React.lazy(() => import('./views/BlogStack'));
const BlogDetail = React.lazy(() => import('./components/BlogStack/BlogDetail'));
const EpisodeDetail = React.lazy(() => import('./components/Episode/EpisodeDetail'));
const SearchResults = React.lazy(() => import('./views/SearchResults'));
const OAuthPopupClose = React.lazy(() => import('./views/OAuthPopupClose'));

// The component gallery is an internal design-system workbench. Keep it out
// of the public application surface and production bundle.
const DesignGallery = import.meta.env.DEV
  ? React.lazy(() => import('./views/Gallery'))
  : null;

const NotFoundRoute: React.FC = () => {
  const location = useLocation();
  const { language } = useLanguage();
  const zh = language === 'zh';

  return (
    <>
      <Seo
        title={zh ? '页面不存在' : 'Page not found'}
        description={zh ? '请求的页面不存在或已移动。' : 'The requested page does not exist or has moved.'}
        path={location.pathname}
        noindex
        lang={language as 'en' | 'zh'}
      />
      <NotFoundError />
    </>
  );
};

const LegacyIdeaRoute: React.FC = () => {
  const { id } = useParams();
  return <Navigate to={id ? `/moments?id=${encodeURIComponent(id)}` : '/moments'} replace />;
};

const LocalizedRoutes: React.FC = () => {
  const { language } = useLanguage();

  return (
    <React.Suspense
      fallback={(
        <div className="flex min-h-[55dvh] items-center justify-center" aria-live="polite">
          <Spinner label={language === 'zh' ? '正在加载页面' : 'Loading page'} />
        </div>
      )}
    >
      <Routes key={language}>
        <Route path="/" element={<ResumeWebsite />} />
        {/* MomentDetail renders as a modal overlay on top of the Moments
            list (Xiaohongshu-style), so the detail route is nested under
            the list route and rendered through its <Outlet /> rather than
            replacing the whole page. */}
        <Route path="/moments" element={<Moments />}>
          <Route path=":slug" element={<MomentDetail />} />
        </Route>
        <Route path="/contact" element={<InteractiveContactPage />} />
        <Route path="/projects" element={<ProjectGallery />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/ideas" element={<LegacyIdeaRoute />} />
        <Route path="/ideas/:id" element={<LegacyIdeaRoute />} />
        <Route path="/blog" element={<BlogStack />} />
        <Route path="/blog/:id" element={<BlogDetail />} />
        <Route path="/episodes/:slug" element={<EpisodeDetail />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/auth/popup-closed" element={<OAuthPopupClose />} />
        {DesignGallery && (
          <>
            <Route path="/gallery" element={<DesignGallery />} />
            <Route path="/design" element={<DesignGallery />} />
          </>
        )}
        {/* Catch-all — branded 404 instead of a blank screen. */}
        <Route path="*" element={<NotFoundRoute />} />
      </Routes>
    </React.Suspense>
  );
};

const App: React.FC = () => {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

  return (
    <HelmetProvider>
      <ThemeProvider>
        <LanguageProvider>
          <ToastProvider>
            <AuthProvider>
              <Router basename={basename} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <PageTitleProvider>
                  <MainLayout>
                    {/* Catches render crashes in any route → branded page error. */}
                    <ErrorBoundary>
                      <LocalizedRoutes />
                    </ErrorBoundary>
                  </MainLayout>
                </PageTitleProvider>
              </Router>
            </AuthProvider>
          </ToastProvider>
        </LanguageProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
};

export default App; 
