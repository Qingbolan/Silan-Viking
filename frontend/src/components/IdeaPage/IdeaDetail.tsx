import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar,
  Clock,
  ExternalLink,
  ArrowLeft,
  Share2,
  Heart,
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
} from '../../components/ds';


const IdeaDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();

  const [idea, setIdea] = useState<IdeaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);

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
      <Container width="content">
        <Section spacing="md">
          {/* --- Header — status eyebrow + title, then a single meta row
                 with the dates on the left and the actions on the right. -- */}
          <div className="space-y-1.5">
            <div className="text-ds-xs font-medium uppercase tracking-[0.08em] text-ds-fg-subtle">
              {statusLabel[idea.status] ?? idea.status}
            </div>
            <h1 className="text-ds-3xl font-semibold tracking-[-0.02em] text-ds-fg">
              {idea.title}
            </h1>
          </div>

          {/* Sticky meta bar — dates ↔ actions, pinned to the top of the
              viewport as the content scrolls beneath it. */}
          <div className="sticky top-0 z-20 mt-3 -mx-4 flex flex-col gap-3 border-b border-ds-border bg-ds-surface-1/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ds-sm text-ds-fg-muted">
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
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant={liked ? 'subtle' : 'outline'}
                size="sm"
                onClick={() => setLiked(!liked)}
                leadingIcon={<Heart fill={liked ? 'currentColor' : 'none'} />}
              >
                {language === 'en' ? 'Like' : '喜欢'}
              </Button>
              <Button variant="outline" size="sm" leadingIcon={<Share2 />}>
                {language === 'en' ? 'Share' : '分享'}
              </Button>
              {idea.demoUrl && (
                <a href={`/projects/${idea.id}/demo`}>
                  <Button size="sm" leadingIcon={<ExternalLink />}>
                    {language === 'en' ? 'Project Demo' : '项目演示'}
                  </Button>
                </a>
              )}
            </div>
          </div>

          {/* Tag chips. */}
          {idea.tags && idea.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {idea.tags.map((tag, index) => (
                <Badge key={index} tone="neutral" appearance="soft" size="md">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* --- Parts — data-driven content tabs, plus the fixed
              `discussion` runtime tab. Content Parts are open-set (an
              undeclared role still becomes a tab); the discussion tab is a
              registered runtime feature, always present. -- */}
          <div className="mt-8 w-full">
            <ContentParts
              parts={idea.parts ?? []}
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
        </Section>
      </Container>
    </motion.div>
  );
};

export default IdeaDetail; 