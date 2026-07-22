import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, FolderGit2, Layers, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { fetchProjects } from '../api/projects/projectApi';
import { useLanguage } from '../components/LanguageContext';
import { Seo } from '../components/Seo';
import {
  BlogHeader,
  BrandLoading,
  Button,
  EmptyState,
  ErrorState,
  Masonry,
  ProjectCard,
  type ProjectCardData,
} from '../components/ds';
import type { Project } from '../types/api';

const SINGLE_PROJECT_BREAKPOINTS = [
  { minWidth: 640, columns: 2 },
  { minWidth: 0, columns: 1 },
];
const projectKey = (project: Project) => project.id;
const spanFeatureProject = () => 2;

const ProjectGallery: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedTag, setSelectedTag] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { language } = useLanguage();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchProjects({ page: 1, size: 100 }, language);
        if (active) setProjects(data);
      } catch {
        if (active) setError(t('projects.failedToLoadData'));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [language, reloadKey, t]);

  const years = useMemo(
    () => Array.from(new Set(projects.map((project) => project.year).filter((year) => year > 0)))
      .sort((a, b) => b - a),
    [projects],
  );
  const yearOptions = useMemo(
    () => [
      { value: 'all', label: t('projects.all'), icon: <Layers /> },
      ...years.map((year) => ({ value: String(year), label: String(year), icon: <CalendarDays /> })),
    ],
    [years, t],
  );
  const tags = useMemo(
    () => ['all', ...Array.from(new Set(projects.flatMap((project) => project.tags)))],
    [projects],
  );

  useEffect(() => {
    if (selectedYear !== 'all' && !years.includes(Number(selectedYear))) setSelectedYear('all');
  }, [selectedYear, years]);
  useEffect(() => {
    if (selectedTag !== 'all' && !tags.includes(selectedTag)) setSelectedTag('all');
  }, [selectedTag, tags]);

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return projects.filter((project) => {
      if (selectedYear !== 'all' && project.year !== Number(selectedYear)) return false;
      if (selectedTag !== 'all' && !project.tags.includes(selectedTag)) return false;
      if (!query) return true;
      return [project.name, project.description, ...project.tags]
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [projects, searchQuery, selectedTag, selectedYear]);

  const toCardData = useCallback((project: Project): ProjectCardData => ({
    id: project.id,
    title: project.name,
    description: project.description,
    tags: project.tags,
    year: project.year,
    githubUrl: project.githubUrl,
    documentationUrl: project.documentationUrl,
    demoUrl: project.demoUrl || project.coverWebsiteUrl,
    coverImage: project.thumbnailUrl,
    coverSourceType: project.coverSourceType,
    relatedLinks: project.relatedBlogs?.slice(0, 3).map((blog) => ({
      title: blog.title,
      href: blog.url || `/blog/${blog.id}`,
      kind: 'blog',
    })),
  }), []);

  if (loading) return <BrandLoading message={t('projects.loadingProjects')} />;
  if (error) {
    return (
      <ErrorState
        variant="page"
        title={t('projects.errorLoadingData')}
        description={error}
        actions={(
          <Button variant="outline" size="sm" leadingIcon={<RefreshCw />} onClick={() => setReloadKey((value) => value + 1)}>
            {language === 'zh' ? '重试' : 'Retry'}
          </Button>
        )}
      />
    );
  }

  return (
    <motion.div className="min-h-screen py-20" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Seo
        title={language === 'en' ? 'Projects' : '项目'}
        description={language === 'en' ? 'Software projects and engineering work by Silan Hu.' : '胡思蓝的软件项目与工程作品。'}
        path="/projects"
        lang={language as 'en' | 'zh'}
      />
      <div className="mx-auto max-w-6xl px-4">
        <motion.div className="mb-12" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <BlogHeader
            eyebrow={language === 'en' ? 'Work' : '作品'}
            title={t('projects.title')}
            description={t('projects.subtitle', { defaultValue: '' }) || undefined}
            search={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t('projects.searchPlaceholder')}
            typeOptions={yearOptions}
            selectedType={selectedYear}
            onTypeChange={setSelectedYear}
            typeLabel={language === 'en' ? 'Year' : '年份'}
            tags={tags}
            selectedTag={selectedTag}
            onTagChange={setSelectedTag}
            tagLabel={language === 'en' ? 'Topic' : '主题'}
            formatTag={(tag) => tag === 'all' ? t('projects.all') : tag}
          />
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`${selectedYear}-${selectedTag}-${searchQuery}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <Masonry
              items={filteredProjects}
              getKey={projectKey}
              bottomPadding={96}
              breakpoints={filteredProjects.length === 1 ? SINGLE_PROJECT_BREAKPOINTS : undefined}
              getSpan={filteredProjects.length === 1 ? spanFeatureProject : undefined}
              renderItem={(project) => (
                <ProjectCard
                  project={toCardData(project)}
                  coverSize={filteredProjects.length === 1 ? 'feature' : 'standard'}
                  onOpen={() => navigate(`/projects/${project.id}`)}
                />
              )}
            />
          </motion.div>
        </AnimatePresence>

        {filteredProjects.length === 0 && (
          <motion.div className="py-20" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
            <EmptyState
              icon={<FolderGit2 />}
              title={t('projects.noProjectsFound')}
              description={t('projects.adjustSearchCriteria')}
            />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default ProjectGallery;
