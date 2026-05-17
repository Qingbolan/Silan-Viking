import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar,
  Clock,
  ExternalLink,
  CheckCircle,
  Circle,
  Play,
  BookOpen,
  FileText,
  Share2,
  Heart,
  BarChart3,
  Beaker,
} from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import { Seo, creativeWorkJsonLd } from '../Seo';
import CommunityFeedback from './CommunityFeedback';
import Markdown from '../ui/Markdown';
import { IdeaData } from '../../types';
import { fetchIdeaById } from '../../api/ideas/ideaApi';
import { useSetPageTitle } from '../../layout/PageTitleContext';
import {
  Container,
  Section,
  Badge,
  Button,
  Tabs as DsTabs,
  BrandLoading,
} from '../../components/ds';


const IdeaDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { colors, isDarkMode } = useTheme();
  const { language } = useLanguage();

  const [idea, setIdea] = useState<IdeaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('abstract');
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

  const getExperimentIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle size={16} style={{ color: '#059669' }} />;
      case 'running': return <Play size={16} style={{ color: '#0284C7' }} />;
      case 'failed': return <Circle size={16} style={{ color: '#DC2626' }} />;
      default: return <Circle size={16} style={{ color: colors.textTertiary }} />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN');
  };

  // Helper function to check if a tab has content
  const hasContent = (tabId: string): boolean => {
    if (!idea) return false;

    switch (tabId) {
      case 'abstract':
        return !!(idea.abstract || idea.abstractZh);
      case 'progress':
        return !!(idea.progress || idea.progressZh || idea.methodology || idea.methodologyZh || idea.techStack || idea.experiments);
      case 'results':
        return !!(idea.results || idea.resultsZh || idea.preliminaryResults || idea.preliminaryResultsZh || idea.keyFindings || idea.keyFindingsZh || idea.limitations || idea.limitationsZh || idea.futureDirections || idea.futureDirectionsZh);
      case 'references':
        return !!(idea.reference || idea.referenceZh || (idea.relatedWorks && idea.relatedWorks.length > 0));
      case 'discussion':
        // Always show discussion tab
        return true;
      default:
        return true;
    }
  };

  const allTabs = [
    { id: 'abstract', label: language === 'en' ? 'Abstract' : '摘要', icon: <FileText size={16} /> },
    { id: 'progress', label: language === 'en' ? 'Latest Progress' : '最新进展', icon: <BarChart3 size={16} /> },
    { id: 'results', label: language === 'en' ? 'Results' : '结果', icon: <CheckCircle size={16} /> },
    { id: 'references', label: language === 'en' ? 'References' : '参考文献', icon: <BookOpen size={16} /> },
    { id: 'discussion', label: language === 'en' ? 'Discussion' : '讨论', icon: <Beaker size={16} /> },
  ];

  // Filter tabs to only show those with content (only when idea is loaded)
  const tabs = idea ? allTabs.filter(tab => hasContent(tab.id)) : allTabs;

  // Ensure active tab is valid, switch to first available tab if current is filtered out
  useEffect(() => {
    if (idea && tabs.length > 0 && !tabs.find(tab => tab.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab, idea]);

  if (loading) {
    return (
      <BrandLoading
        inline
        message={language === 'en' ? 'Loading research details…' : '加载研究详情…'}
      />
    );
  }

  if (!idea) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: colors.background }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <BookOpen size={48} className="mx-auto mb-4" style={{ color: colors.error }} />
          <h2 className="text-xl font-semibold mb-2" style={{ color: colors.textPrimary }}>
            {language === 'en' ? 'Research Not Found' : '未找到研究'}
          </h2>
          <button
            onClick={() => navigate('/ideas')}
            className="px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            style={{ backgroundColor: colors.primary, color: 'white' }}
          >
            {language === 'en' ? 'Back to Ideas' : '返回想法列表'}
          </button>
        </motion.div>
      </div>
    );
  }

  const renderAbstract = () => (
    <div className="space-y-8">
        <div className="prose max-w-none">
          <Markdown className="text-lg">
            {(language === 'en' ? idea.abstract : idea.abstractZh || idea.abstract) || ''}
          </Markdown>
        </div>

      {idea.hypothesis && (
        <div>
          <h3 className="text-xl font-semibold mb-4" style={{ color: colors.textPrimary }}>{language === 'en' ? 'Research Hypothesis' : '研究假设'}</h3>
          <div className="p-6 rounded-xl border-l-4" style={{ 
            backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : '#EFF6FF', 
            borderColor: '#3B82F6' 
          }}>
            <p className="leading-relaxed italic" style={{ color: colors.textSecondary }}>
              {language === 'en' ? idea.hypothesis : idea.hypothesisZh || idea.hypothesis}
            </p>
          </div>
        </div>
      )}

      {idea.motivation && (
        <div>
          <h3 className="text-xl font-semibold mb-4" style={{ color: colors.textPrimary }}>{language === 'en' ? 'Research Motivation' : '研究动机'}</h3>
          <p className="leading-relaxed" style={{ color: colors.textSecondary }}>
            {language === 'en' ? idea.motivation : idea.motivationZh || idea.motivation}
          </p>
        </div>
      )}

      {idea.keywords && (
        <div>
          <h3 className="text-xl font-semibold mb-4" style={{ color: colors.textPrimary }}>{language === 'en' ? 'Keywords' : '关键词'}</h3>
          <div className="flex flex-wrap gap-2">
            {idea.keywords.map((keyword, index) => (
              <span key={index} className="px-3 py-1 rounded-lg text-sm" style={{ 
                backgroundColor: colors.surface, 
                color: colors.textPrimary 
              }}>
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderProgress = () => (
    <div className="space-y-6">
      {(idea.progress || idea.methodology) ? (
          <div className="prose max-w-none">
            <Markdown className="text-lg">
            {(language === 'en' ? (idea.progress || idea.methodology) : (idea.progressZh || idea.methodologyZh || idea.progress || idea.methodology)) || ''}
            </Markdown>
          </div>
      ) : (
        <div className="text-center py-12" style={{ color: colors.textSecondary }}>
          <Beaker size={48} className="mx-auto mb-4 opacity-50" />
          <p>{language === 'en' ? 'Progress details coming soon...' : '进展详情即将发布...'}</p>
        </div>
      )}

      {idea.techStack && (
        <div>
          <h3 className="text-xl font-semibold mb-4" style={{ color: colors.textPrimary }}>{language === 'en' ? 'Technical Stack' : '技术栈'}</h3>
          <div className="flex flex-wrap gap-2">
            {idea.techStack.map((tech, index) => (
              <span key={index} className="px-3 py-2 rounded-lg text-sm font-medium border" style={{ 
                backgroundColor: colors.surface, 
                color: colors.textPrimary,
                borderColor: colors.cardBorder
              }}>
                {tech}
              </span>
            ))}
          </div>
        </div>
      )}

      {idea.experiments && (
        <div>
          <h3 className="text-xl font-semibold mb-4" style={{ color: colors.textPrimary }}>{language === 'en' ? 'Recent Experiments' : '最近实验'}</h3>
          <div className="space-y-4">
            {idea.experiments.map((experiment) => (
              <div key={experiment.id} className="p-6 rounded-xl" style={{ 
                backgroundColor: colors.cardBackground, 
                boxShadow: colors.shadowSm 
              }}>
                <div className="flex items-start gap-4">
                  <div className="mt-1">{getExperimentIcon(experiment.status)}</div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-2" style={{ color: colors.textPrimary }}>
                      {language === 'en' ? experiment.title : experiment.titleZh || experiment.title}
                    </h4>
                    <p className="mb-3" style={{ color: colors.textSecondary }}>
                      {language === 'en' ? experiment.description : experiment.descriptionZh || experiment.description}
                    </p>
                    <div className="flex items-center gap-4 text-sm" style={{ color: colors.textTertiary }}>
                      <span>{language === 'en' ? 'Started: ' : '开始: '}{formatDate(experiment.startDate || '')}</span>
                      {experiment.endDate && <span>{language === 'en' ? 'Ended: ' : '结束: '}{formatDate(experiment.endDate)}</span>}
                    </div>
                    {experiment.results && (
                      <div className="mt-3 p-3 rounded-lg" style={{ backgroundColor: colors.surface }}>
                        <p className="text-sm" style={{ color: colors.textSecondary }}>{experiment.results}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderResults = () => (
    <div className="space-y-6">
      {(idea.results || idea.preliminaryResults) && (
          <div className="prose max-w-none">
            <Markdown className="text-lg">
            {(language === 'en' ? (idea.results || idea.preliminaryResults) : (idea.resultsZh || idea.preliminaryResultsZh || idea.results || idea.preliminaryResults)) || ''}
            </Markdown>
          </div>
      )}

      {idea.keyFindings && (
        <div>
          <h3 className="text-xl font-semibold mb-4" style={{ color: colors.textPrimary }}>{language === 'en' ? 'Key Findings' : '主要发现'}</h3>
          <ul className="space-y-2">
            {(language === 'en' ? idea.keyFindings : idea.keyFindingsZh || idea.keyFindings).map((finding, index) => (
              <li key={index} className="flex items-start gap-3">
                <CheckCircle size={16} style={{ color: '#059669' }} className="mt-1" />
                <span style={{ color: colors.textSecondary }}>{finding}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {idea.limitations && (
        <div>
          <h3 className="text-xl font-semibold mb-4" style={{ color: colors.textPrimary }}>{language === 'en' ? 'Limitations' : '局限性'}</h3>
          <ul className="space-y-2">
            {(language === 'en' ? idea.limitations : idea.limitationsZh || idea.limitations).map((limitation, index) => (
              <li key={index} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full mt-2" style={{ backgroundColor: '#F59E0B' }}></div>
                <span style={{ color: colors.textSecondary }}>{limitation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {idea.futureDirections && (
        <div>
          <h3 className="text-xl font-semibold mb-4" style={{ color: colors.textPrimary }}>{language === 'en' ? 'Future Directions' : '未来方向'}</h3>
          <ul className="space-y-2">
            {(language === 'en' ? idea.futureDirections : idea.futureDirectionsZh || idea.futureDirections).map((direction, index) => (
              <li key={index} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full mt-2" style={{ backgroundColor: '#3B82F6' }}></div>
                <span style={{ color: colors.textSecondary }}>{direction}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!idea.preliminaryResults && !idea.keyFindings && !idea.limitations && !idea.futureDirections && (
        <div className="text-center py-12" style={{ color: colors.textSecondary }}>
          <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
          <p>{language === 'en' ? 'Research results will be published here as they become available.' : '研究结果将在可用时发布在此处。'}</p>
        </div>
      )}
    </div>
  );

  const renderReferences = () => (
    <div className="space-y-4">
      {(idea.reference || idea.referenceZh || idea.relatedWorks?.length) ? (
        <>
          {idea.reference && (
              <div className="prose max-w-none">
                <Markdown className="text-lg">
                  {(language === 'en' ? idea.reference : (idea.referenceZh || idea.reference)) || ''}
                </Markdown>
              </div>
          )}
          {idea.relatedWorks && idea.relatedWorks.length > 0 && idea.relatedWorks.map((ref) => (
            <div key={ref.id} className="p-6 rounded-xl" style={{ backgroundColor: colors.cardBackground, boxShadow: colors.shadowSm }}>
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg" style={{ backgroundColor: colors.surface }}>
                  <FileText size={16} />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-2" style={{ color: colors.textPrimary }}>{ref.title}</h4>
                  <p className="text-sm mb-2" style={{ color: colors.textSecondary }}>
                    {ref.authors.join(', ')} ({ref.year}) - {ref.venue}
                  </p>
                  {ref.notes && <p className="text-sm mb-3" style={{ color: colors.textTertiary }}>{ref.notes}</p>}
                  {ref.url && (
                    <a href={ref.url} target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-2 text-sm" style={{ color: colors.accent }}>
                      <ExternalLink size={14} />
                      {language === 'en' ? 'View Paper' : '查看论文'}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className="text-center py-12" style={{ color: colors.textSecondary }}>
          <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
          <p>{language === 'en' ? 'References will be added as research progresses.' : '参考文献将随着研究进展而添加。'}</p>
        </div>
      )}
    </div>
  );

  const renderDiscussion = () => <CommunityFeedback projectId={`idea-${idea.id}`} />;

  const renderContent = (tabKey: string = activeTab) => {
    switch (tabKey) {
      case 'abstract': return renderAbstract();
      case 'progress': return renderProgress();
      case 'results': return renderResults();
      case 'references': return renderReferences();
      case 'discussion': return renderDiscussion();
      default: return renderAbstract();
    }
  };

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

          {/* --- Tabs — abstract / progress / … / discussion.
              Two-column docs layout: left-rail vertical nav + content. -- */}
          <div className="mt-8 flex w-full flex-col gap-6 md:flex-row md:gap-8">
            <nav className="shrink-0 md:w-56">
              <div className="md:sticky md:top-16">
                <DsTabs
                  appearance="vertical"
                  value={activeTab}
                  onChange={setActiveTab}
                  items={tabs.map((tab) => ({
                    value: tab.id,
                    label: tab.label,
                    icon: tab.icon,
                  }))}
                />
              </div>
            </nav>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="min-w-0 flex-1"
            >
              {renderContent(activeTab)}
            </motion.div>
          </div>
        </Section>
      </Container>
    </motion.div>
  );
};

export default IdeaDetail; 