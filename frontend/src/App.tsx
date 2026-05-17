import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import './i18n/index'; // Initialize i18n
import MainLayout from './layout/MainLayout';
import ResumeWebsite from './views/ResumeWebsite';
import RecentUpdates from './views/RecentUpdates';
import InteractiveContactPage from './views/InteractiveContactPage';
import ProjectGallery from './views/ProjectGallery';
import ProjectDetail from './components/ProjectGallery/ProjectDetail';
import IdeaPage from './views/IdeaPage';
import IdeaDetail from './components/IdeaPage/IdeaDetail';
import BlogStack from './views/BlogStack';
import BlogDetail from './components/BlogStack/BlogDetail';
import PlansPage from './views/PlansPage';
import SearchResults from './views/SearchResults';
import { ThemeProvider, useTheme } from './components/ThemeContext';
import { LanguageProvider } from './components/LanguageContext';
import { PageTitleProvider } from './layout/PageTitleContext';

// antd v5 derives its colour palette with tinycolor, which does NOT
// understand `oklch()`. Passing an oklch string makes antd silently fall
// back to its default blue. So we let the browser resolve the theme
// colour to an rgb() string antd can parse.
const resolveColor = (value: string): string => {
  if (typeof document === 'undefined') return value;
  if (!value.includes('oklch')) return value;
  const probe = document.createElement('span');
  probe.style.color = value;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color; // -> rgb(...)
  document.body.removeChild(probe);
  return resolved || value;
};

// Feeds the active theme colour into antd's design tokens so every antd
// component (Tabs ink/underline, buttons, etc.) uses the theme colour
// instead of antd's default blue.
const AntdThemeBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colors } = useTheme();
  const primary = React.useMemo(() => resolveColor(colors.primary), [colors.primary]);
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: primary,
          colorInfo: primary,
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AntdThemeBridge>
      <LanguageProvider>
        <Router>
          <PageTitleProvider>
            <MainLayout>
              <Routes>
                <Route path="/" element={<ResumeWebsite />} />
                <Route path="/recent-updates" element={<RecentUpdates />} />
                <Route path="/contact" element={<InteractiveContactPage />} />
                <Route path="/projects" element={<ProjectGallery />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/plans" element={<PlansPage />} />
                <Route path="/ideas" element={<IdeaPage />} />
                <Route path="/ideas/:id" element={<IdeaDetail />} />
                <Route path="/blog" element={<BlogStack />} />
                <Route path="/blog/:id" element={<BlogDetail />} />
                <Route path="/search" element={<SearchResults />} />
              </Routes>
            </MainLayout>
          </PageTitleProvider>
        </Router>
      </LanguageProvider>
      </AntdThemeBridge>
    </ThemeProvider>
  );
};

export default App; 
