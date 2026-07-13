import React, { useCallback, useEffect, useState } from 'react';
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
import IdeaDiscussion from './IdeaDiscussion';
import ContentParts from '../content/ContentParts';
import { IdeaData } from '../../types';
import { fetchIdeaById } from '../../api/ideas/ideaApi';
import { useSetPageTitle } from '../../layout/PageTitleContext';
import { useRemoteResource } from '../../hooks/useRemoteResource';
import {
  Container,
  Section,
  Badge,
  Button,
  BrandLoading,
  ErrorState,
  NetworkError,
  KnowledgeBaseShell,
  type BookNavChapter,
} from '../../components/ds';

const OVERVIEW_ID = '__overview__';

const IdeaDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();

  const [activePart, setActivePart] = useState<string>(OVERVIEW_ID);

  const loadIdea = useCallback(
    () => id ? fetchIdeaById(id, language as 'en' | 'zh') : Promise.resolve(null),
    [id, language],
  );
  const ideaResource = useRemoteResource<IdeaData>(id, loadIdea);
  const idea = ideaResource.data;

  // Reflect the idea title in the address-bar breadcrumb.
  useSetPageTitle(
    idea
      ? idea.title
      : ideaResource.status === 'not-found'
        ? (language === 'en' ? 'Research not found' : '未找到研究')
        : ideaResource.status === 'error'
          ? (language === 'en' ? 'Research unavailable' : '研究暂不可用')
          : null,
  );

  const ideaID = idea?.id;
  useEffect(() => {
    if (ideaID) setActivePart(OVERVIEW_ID);
  }, [ideaID]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN');
  };

  if (ideaResource.status === 'loading') {
    return (
      <BrandLoading
        inline
        message={language === 'en' ? 'Loading research details…' : '加载研究详情…'}
      />
    );
  }

  if (ideaResource.status === 'error') {
    return <NetworkError onRetry={ideaResource.reload} />;
  }

  if (!idea) {
    // A missing / non-public idea renders the ds standard page-level error,
    // not a bespoke panel — same design language as every other route.
    return (
      <>
        <Seo
          title={language === 'en' ? 'Research not found' : '未找到研究'}
          description={language === 'en' ? 'This public research idea could not be found.' : '未找到该公开研究想法。'}
          path={`/ideas/${id ?? ''}`}
          noindex
          lang={language as 'en' | 'zh'}
        />
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
      </>
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
  // The API already localizes the title according to `lang`.
  const documentTitle = idea.title;

  // Build the BookNav chapter list from the idea's Parts. `role` is the
  // stable id (matches ContentParts' tab value), so clicking a chapter
  // switches the active tab inside ContentParts. Default to Overview so
  // the reader lands on the intro page, not a random Part.
  const partRoles = (idea.parts ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => p.role)
    .filter((role) => role !== 'overview');
  const roleLabels: Record<string, { en: string; zh: string }> = {
    overview:   { en: 'Overview',        zh: '概述' },
    progress:   { en: 'Latest Progress', zh: '最新进展' },
    abstract:   { en: 'Abstract',        zh: '摘要' },
    goals:      { en: 'Goals',           zh: '目标' },
    challenges: { en: 'Challenges',      zh: '挑战' },
    solutions:  { en: 'Solutions',       zh: '解决方案' },
    result:     { en: 'Results',         zh: '结果' },
    reference:  { en: 'References',      zh: '参考文献' },
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
        title={documentTitle}
        description={seoDescription}
        path={`/ideas/${id}`}
        type="article"
        lang={language as 'en' | 'zh'}
        jsonLd={creativeWorkJsonLd({
          title: documentTitle,
          description: seoDescription,
          path: `/ideas/${id}`,
        })}
      />
      <KnowledgeBaseShell
        overview={{
          label: documentTitle || (language === 'en' ? 'Overview' : '概述'),
          onClick: () => goToPart(OVERVIEW_ID),
          isActive: activePart === OVERVIEW_ID,
        }}
        chapters={chapters}
        currentChapterId={activePart}
        wordCount={wordCount}
      >
          {activePart === OVERVIEW_ID ? (
            <>
              {/* Overview / cover page — status eyebrow, title, dates, abstract.
                  Stats + actions intentionally absent: this is a book cover,
                  not a control panel. */}
              <div className="text-[12px] font-medium uppercase tracking-[0.1em] text-ds-fg-subtle">
                {statusLabel[idea.status] ?? idea.status}
              </div>

              <h1 className="mt-3 text-ds-4xl font-semibold leading-[1.15] tracking-[-0.02em] text-ds-fg">
                {documentTitle}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-ds-fg-muted">
                {idea.createdAt && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    {language === 'en' ? 'Created' : '创建于'} {formatDate(idea.createdAt)}
                  </span>
                )}
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

              {/* The cover owns the canonical Overview Part. It is real
                  article content, not a second empty landing page. */}
              <div className="prose-content markdown-body mt-8 w-full">
                <ContentParts
                  parts={idea.parts ?? []}
                  value="overview"
                  hideNav
                  documentTitle={documentTitle}
                />
              </div>
            </>
          ) : (
            <div className="prose-content markdown-body w-full">
              <h1 className="sr-only">{documentTitle}</h1>
              <ContentParts
                parts={idea.parts ?? []}
                value={activePart}
                onValueChange={setActivePart}
                hideNav
                documentTitle={documentTitle}
                extraTabs={[
                  {
                    key: 'discussion',
                    label: language === 'en' ? 'Discussion' : '讨论',
                    icon: <MessageSquare size={16} />,
                    render: () => (
                      <IdeaDiscussion ideaId={idea.id} />
                    ),
                  },
                ]}
              />
            </div>
          )}
      </KnowledgeBaseShell>
    </motion.div>
  );
};

export default IdeaDetail;
