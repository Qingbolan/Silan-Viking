import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar,
  Clock,
  ArrowLeft,
  MessageSquare,
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { Seo, creativeWorkJsonLd } from '../Seo';
import CommunityFeedback from './CommunityFeedback';
import ContentParts from '../content/ContentParts';
import { IdeaData } from '../../types';
import { fetchIdeaById } from '../../api/ideas/ideaApi';
import { useSetPageTitle } from '../../layout/PageTitleContext';
import {
  Container,
  Section,
  Badge,
  Button,
  BrandLoading,
  ErrorState,
  ArticleFooter,
  KnowledgeBaseShell,
  type BookNavChapter,
  mockComments,
  mockRecentLikers,
} from '../../components/ds';


const IdeaDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();

  const [idea, setIdea] = useState<IdeaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePart, setActivePart] = useState<string>('');

  // Reflect the idea title in the address-bar breadcrumb.
  useSetPageTitle(idea ? idea.title : null);

  useEffect(() => {
    const loadIdea = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Fetch idea from API with language support
        const ideaData = await fetchIdeaById(id, language as 'en' | 'zh');
        
        if (ideaData) {
          setIdea(ideaData);
        } else {
          // If no data found, you can optionally fall back to mock data for development
          // or show a not found message
          setIdea(null);
        }
      } catch (err) {
        console.error('Error loading idea:', err);
        setIdea(null);
      } finally {
        setLoading(false);
      }
    };
    
    loadIdea();
  }, [id, language]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN');
  };

  if (loading) {
    return (
      <BrandLoading
        inline
        message={language === 'en' ? 'Loading research details…' : '加载研究详情…'}
      />
    );
  }

  if (!idea) {
    // A missing / non-public idea renders the ds standard page-level error,
    // not a bespoke panel — same design language as every other route.
    return (
      <Container>
        <Section>
          <ErrorState
            variant="page"
            title={language === 'en' ? 'Research Not Found' : '未找到研究'}
            description={
              language === 'en'
                ? 'This research idea does not exist, or has not been published yet.'
                : '该研究想法不存在，或尚未发布。'
            }
            actions={
              <Button
                variant="primary"
                onClick={() => navigate('/ideas')}
                leadingIcon={<ArrowLeft />}
              >
                {language === 'en' ? 'Back to Ideas' : '返回想法列表'}
              </Button>
            }
          />
        </Section>
      </Container>
    );
  }

  // The research stage, shown as the page-header eyebrow (no icon).
  const statusLabel: Record<string, string> = {
    draft: language === 'en' ? 'Draft' : '草稿',
    hypothesis: language === 'en' ? 'Hypothesis' : '假设',
    experimenting: language === 'en' ? 'Experimenting' : '实验中',
    validating: language === 'en' ? 'Validating' : '验证中',
    published: language === 'en' ? 'Published' : '已发表',
    concluded: language === 'en' ? 'Concluded' : '已结题',
  };

  const seoDescription =
    (language === 'en' ? idea.abstract : idea.abstractZh || idea.abstract) || '';

  // The 'Overview' virtual page — id `__overview__` shows the idea's
  // intro card (status, title, dates, actions); other ids show that Part.
  const OVERVIEW_ID = '__overview__';

  // Build the BookNav chapter list from the idea's Parts. `role` is the
  // stable id (matches ContentParts' tab value), so clicking a chapter
  // switches the active tab inside ContentParts. Default to Overview so
  // the reader lands on the intro page, not a random Part.
  const partRoles = (idea.parts ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => p.role);
  if (!activePart) {
    setActivePart(OVERVIEW_ID);
  }
  const roleLabels: Record<string, { en: string; zh: string }> = {
    overview:   { en: 'Overview',        zh: '概述' },
    progress:   { en: 'Latest Progress', zh: '最新进展' },
    abstract:   { en: 'Abstract',        zh: '摘要' },
    goals:      { en: 'Goals',           zh: '目标' },
    challenges: { en: 'Challenges',      zh: '挑战' },
    solutions:  { en: 'Solutions',       zh: '解决方案' },
  };
  const chapterFromRole = (role: string): string => {
    const known = roleLabels[role];
    if (known) return language === 'en' ? known.en : known.zh;
    return role.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };
  // Switch page — tab semantics; reset scroll so the new page starts at top.
  const goToPart = (partId: string) => {
    setActivePart(partId);
    const scrollRoot = document.querySelector('#browser-window') as HTMLElement | null;
    if (scrollRoot) scrollRoot.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const chapters: BookNavChapter[] = [
    ...partRoles.map((role) => ({
      id: role,
      label: chapterFromRole(role),
      onClick: () => goToPart(role),
    })),
    {
      id: 'tab:discussion',
      label: language === 'en' ? 'Discussion' : '讨论',
      onClick: () => goToPart('tab:discussion'),
    },
  ];

  // Rough word count from prose Parts in the current language.
  const wordCount = (idea.parts ?? []).reduce((acc, p) => {
    const body = p.body?.[language] ?? p.body?.[p.canonicalLang] ?? '';
    return acc + body.split(/\s+/).filter(Boolean).length;
  }, 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Seo
        title={idea.title}
        description={seoDescription}
        path={`/ideas/${idea.id}`}
        type="article"
        lang={language as 'en' | 'zh'}
        jsonLd={creativeWorkJsonLd({
          title: idea.title,
          description: seoDescription,
          path: `/ideas/${idea.id}`,
        })}
      />
      <KnowledgeBaseShell
        overview={{
          label: idea.title || (language === 'en' ? 'Overview' : '概述'),
          onClick: () => goToPart(OVERVIEW_ID),
          isActive: activePart === OVERVIEW_ID,
        }}
        chapters={chapters}
        currentChapterId={activePart}
        wordCount={wordCount}
        likes={2047}
        commentsCount={94}
      >
          {activePart === OVERVIEW_ID ? (
            <>
              {/* Overview / cover page — status eyebrow, title, dates, abstract.
                  Stats + actions intentionally absent: this is a book cover,
                  not a control panel. */}
              <div className="space-y-2">
                <div className="text-[12px] font-medium uppercase tracking-[0.1em] text-ds-fg-subtle">
                  {statusLabel[idea.status] ?? idea.status}
                </div>
                <h1 className="text-[40px] font-bold leading-[1.2] tracking-[-0.02em] text-ds-fg">
                  {idea.title}
                </h1>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-ds-fg-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  {language === 'en' ? 'Created' : '创建于'} {formatDate(idea.createdAt)}
                </span>
                {idea.lastUpdated && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    {language === 'en' ? 'Updated' : '更新于'} {formatDate(idea.lastUpdated)}
                  </span>
                )}
              </div>

              {idea.tags && idea.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {idea.tags.map((tag, index) => (
                    <Badge key={index} tone="neutral" appearance="soft" size="md">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Abstract — the only body content on the cover page */}
              {(idea.abstract || idea.abstractZh) && (
                <p className="mt-8 text-[15px] leading-[1.8] text-ds-fg-muted">
                  {language === 'en'
                    ? idea.abstract || idea.abstractZh
                    : idea.abstractZh || idea.abstract}
                </p>
              )}
            </>
          ) : (
            <div className="prose-content markdown-body w-full">
              <ContentParts
                parts={idea.parts ?? []}
                value={activePart}
                onValueChange={setActivePart}
                hideNav
                extraTabs={[
                  {
                    key: 'discussion',
                    label: language === 'en' ? 'Discussion' : '讨论',
                    icon: <MessageSquare size={16} />,
                    render: () => (
                      <CommunityFeedback projectId={`idea-${idea.id}`} />
                    ),
                  },
                ]}
              />
            </div>
          )}

          <ArticleFooter
            likes={2047}
            recentLikers={mockRecentLikers}
            contributors={['Silan Hu']}
            publishedAt="2026-04-15 10:00"
            viewCount={1296204}
            ipRegion="Singapore"
            comments={mockComments}
          />
      </KnowledgeBaseShell>
    </motion.div>
  );
};

export default IdeaDetail; 