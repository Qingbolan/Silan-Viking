import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Tag } from 'antd';
import { Tabs } from '../../components/ds';
import { 
  BookOpen, 
  Download, 
  Users, 
  Play,
  Settings,
  Terminal,
  Bug,
  AlertTriangle,
  FileText,
  Clock,
  ExternalLink,
  Scale
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { useTranslation } from 'react-i18next';
import ProjectCommunityFeedback from './ProjectCommunityFeedback';
import ProjectIssuesList from './ProjectIssuesList';
import { Link, useParams } from 'react-router-dom';
import Markdown from '../ui/Markdown';

interface ProjectTabsProps {
  projectData: any; // 简化处理，实际使用时会有完整类型
}

const ProjectTabs: React.FC<ProjectTabsProps> = ({ projectData }) => {
  const { id: projectId } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('readme');

  // Helper function to check if a tab has content
  const hasContent = (tabKey: string): boolean => {
    switch (tabKey) {
      case 'readme':
        return !!(projectData.fullDescription || projectData.fullDescriptionZh);
      case 'relatedblogs':
        return !!(projectData.relatedBlogs && projectData.relatedBlogs.length > 0);
      case 'releases':
        // Check for markdown content or structured releases
        const hasMarkdownReleases = projectData.versions?.releases?.[0]?.notes;
        const hasStructuredReleases = projectData.versions?.releases && projectData.versions.releases.length > 0;
        return !!(hasMarkdownReleases || hasStructuredReleases);
      case 'quickstart':
        // Check for markdown content or structured quickstart
        const hasMarkdownQuickstart = projectData.quickStart?.basicUsage;
        const hasStructuredQuickstart = projectData.quickStart?.installation || projectData.quickStart?.requirements;
        return !!(hasMarkdownQuickstart || hasStructuredQuickstart);
      case 'dependencies':
        // Check for markdown content or structured dependencies
        const hasMarkdownDeps = projectData.dependencies?.raw;
        const hasStructuredDeps = projectData.dependencies?.production || projectData.dependencies?.development;
        return !!(hasMarkdownDeps || hasStructuredDeps);
      case 'license':
        return !!(projectData.licenseInfo || projectData.status?.license);
      case 'community':
      case 'issues':
        // Always show community and issues tabs (they handle empty states internally)
        return true;
      default:
        return true;
    }
  };

  const allTabItems = [
    { key: 'readme', icon: <BookOpen size={16} />, label: t('projects.readme') },
    { key: 'relatedblogs', icon: <FileText size={16} />, label: t('projects.relatedBlogs') },
    { key: 'releases', icon: <Download size={16} />, label: t('projects.releases') },
    { key: 'quickstart', icon: <Play size={16} />, label: t('projects.quickStart') },
    { key: 'community', icon: <Users size={16} />, label: t('projects.community') },
    { key: 'issues', icon: <Bug size={16} />, label: t('projects.issues') },
    { key: 'dependencies', icon: <Settings size={16} />, label: t('projects.dependencies') },
    { key: 'license', icon: <Scale size={16} />, label: t('projects.license') },
  ];

  // Filter tabs to only show those with content
  const tabItems = allTabItems.filter(tab => hasContent(tab.key));

  // Ensure active tab is valid, switch to first available tab if current is filtered out
  useEffect(() => {
    if (tabItems.length > 0 && !tabItems.find(tab => tab.key === activeTab)) {
      setActiveTab(tabItems[0].key);
    }
  }, [tabItems, activeTab]);

  const renderReadme = () => (
    // <Card>
      <div className="prose max-w-none">
      <Markdown className="text-lg mb-6">
        {language === 'zh' && projectData.fullDescriptionZh ? projectData.fullDescriptionZh : projectData.fullDescription}
      </Markdown>
    </div>
    // </Card>
  );

  const renderQuickStart = () => {
    // Check if we have markdown content (new backend format)
    const hasMarkdownContent = projectData.quickStart?.basicUsage && typeof projectData.quickStart.basicUsage === 'string' && projectData.quickStart.basicUsage.includes('#');

    if (hasMarkdownContent) {
      // Render markdown content directly
      return (
        // <Card>
          <div className="prose max-w-none">
            <Markdown className="text-lg">
              {projectData.quickStart.basicUsage}
            </Markdown>
          </div>
        // </Card>
      );
    }

    // Legacy format with structured data - only show if we have actual data
    const hasInstallation = projectData.quickStart?.installation && projectData.quickStart.installation.length > 0;
    const hasBasicUsage = projectData.quickStart?.basicUsage;
    const hasRequirements = projectData.quickStart?.requirements && projectData.quickStart.requirements.length > 0;

    // If no data at all, show empty state
    if (!hasInstallation && !hasBasicUsage && !hasRequirements) {
      return (
        <div className="text-center py-12">
          <Play size={48} className="mx-auto mb-4 text-theme-secondary opacity-50" />
          <h4 className="text-lg font-medium text-theme-primary mb-2">
            {t('projects.noQuickStartYet')}
          </h4>
          <p className="text-theme-secondary">
            {t('projects.checkBackLater')}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {hasInstallation && (
          <div>
            <h3 className="text-lg font-semibold mb-3 text-theme-primary flex items-center gap-2">
              <Terminal size={20} />
              {t('projects.installation')}
            </h3>
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm">
                {projectData.quickStart.installation.join('\n')}
              </pre>
            </div>
          </div>
        )}

        {hasBasicUsage && (
          <div>
            <h3 className="text-lg font-semibold mb-3 text-theme-primary">
              {t('projects.basicUsage')}
            </h3>
            <div className="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm">
                {projectData.quickStart.basicUsage}
              </pre>
            </div>
          </div>
        )}

        {hasRequirements && (
          <div>
            <h3 className="text-lg font-semibold mb-3 text-theme-primary">
              {t('projects.requirements')}
            </h3>
            <ul className="space-y-2">
              {projectData.quickStart.requirements.map((req: string, index: number) => (
                <li key={index} className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-theme-500 rounded-full"></span>
                  <span className="text-theme-secondary">{req}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderReleases = () => {
    // Check if we have markdown content (new backend format)
    const hasMarkdownContent = projectData.versions?.releases?.[0]?.notes && typeof projectData.versions.releases[0].notes === 'string';

    if (hasMarkdownContent) {
      // Render markdown content directly
      return (
        // <Card>
          <div className="prose max-w-none">
            <Markdown className="text-lg">
              {projectData.versions.releases[0].notes}
            </Markdown>
          </div>
        // </Card>
      );
    }

    // Legacy format with structured data
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-theme-primary">
            {t('projects.latestRelease')}: v{projectData.versions?.latest || '1.0.0'}
          </h3>
        </div>

        {projectData.versions?.releases?.map((release: any, index: number) => (
          <div key={index} className="border border-theme-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-theme-primary">v{release.version}</h4>
              <span className="text-sm text-theme-secondary">{release.date}</span>
            </div>
            <p className="text-theme-secondary mb-3">{release.description}</p>
            <div className="flex items-center gap-4 text-sm text-theme-secondary">
              <span>↓ {release.downloadCount} {t('projects.downloads')}</span>
              {release.assets?.map((asset: any, assetIndex: number) => (
                <button
                  key={assetIndex}
                  className="text-theme-600 hover:underline"
                >
                  {asset.name} ({asset.size})
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCommunity = () => {
    // Use project ID from URL params
    if (!projectId) {
      return <div className="p-4 text-theme-secondary">Project ID not found</div>;
    }
    return <ProjectCommunityFeedback projectId={projectId} />;
  };

  const renderIssues = () => {
    // Use project ID from URL params
    if (!projectId) {
      return <div className="p-4 text-theme-secondary">Project ID not found</div>;
    }
    return <ProjectIssuesList projectId={projectId} />;
  };

  const renderDependencies = () => {
    // Check if we have markdown content (new backend format)
    const hasMarkdownContent = projectData.dependencies?.raw && typeof projectData.dependencies.raw === 'string';

    if (hasMarkdownContent) {
      // Render markdown content directly
      return (
        // <Card>
          <div className="prose max-w-none">
            <Markdown className="text-lg">
              {projectData.dependencies.raw}
            </Markdown>
          </div>
        // </Card>
      );
    }

    // Legacy format with structured data
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold mb-3 text-theme-primary">
            {t('projects.productionDependencies')}
          </h3>
          <div className="space-y-2">
            {projectData.dependencies?.production?.map((dep: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-2 border border-theme-border rounded">
                <span className="font-medium">{dep.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-theme-secondary">{dep.version}</span>
                  <span className="text-xs px-2 py-1 bg-gray-100 rounded">{dep.license}</span>
                  {dep.vulnerabilities > 0 && (
                    <AlertTriangle size={16} className="text-yellow-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3 text-theme-primary">
            {t('projects.developmentDependencies')}
          </h3>
          <div className="space-y-2">
            {projectData.dependencies?.development?.map((dep: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-2 border border-theme-border rounded">
                <span className="font-medium">{dep.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-theme-secondary">{dep.version}</span>
                  <span className="text-xs px-2 py-1 bg-gray-100 rounded">{dep.license}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderRelatedBlogs = () => (
    <div className="space-y-4">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-theme-primary mb-2">
          {t('projects.relatedBlogPosts')}
        </h3>
        <p className="text-theme-secondary">
          {t('projects.exploreRelatedBlogs')}
        </p>
      </div>

      {projectData.relatedBlogs && projectData.relatedBlogs.length > 0 ? (
        <div className="grid gap-4">
          {projectData.relatedBlogs.map((blog: any, index: number) => (
            <motion.div
              key={index}
              className="p-6 border border-theme-border rounded-lg hover:shadow-md transition-all duration-300 hover:border-theme-primary/20"
              whileHover={{ y: -2 }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      blog.relevance === 'high' ? 'bg-green-100 text-green-800' :
                      blog.relevance === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {blog.relevance === 'high' ? t('projects.highRelevance') :
                        blog.relevance === 'medium' ? t('projects.mediumRelevance') :
                        t('projects.lowRelevance')
                      }
                    </span>
                    <span className="text-xs text-theme-secondary">{blog.category}</span>
                  </div>
                  <h4 className="text-lg font-semibold text-theme-primary mb-2">
                    {language === 'zh' && blog.titleZh ? blog.titleZh : blog.title}
                  </h4>
                  <p className="text-theme-secondary mb-3">
                    {language === 'zh' && blog.summaryZh ? blog.summaryZh : blog.summary}
                  </p>
                  {blog.description && (
                    <p className="text-sm text-theme-tertiary mb-3">
                      {language === 'zh' && blog.descriptionZh ? blog.descriptionZh : blog.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-theme-secondary">
                  <div className="flex items-center gap-1">
                    <Clock size={14} />
                    <span>{blog.readTime}</span>
                  </div>
                  <span>{new Date(blog.publishDate).toLocaleDateString()}</span>
                </div>
                
                <Link
                  to={blog.url}
                  className="flex items-center gap-1 px-3 py-1 text-sm text-theme-600 hover:text-theme-800 hover:bg-theme-50 rounded transition-colors"
                >
                  {t('projects.readArticle')}
                  <ExternalLink size={14} />
                </Link>
              </div>

              {blog.tags && blog.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-theme-border">
                  {blog.tags.map((tag: string, tagIndex: number) => (
                    <span
                      key={tagIndex}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-theme-surface text-theme-secondary rounded"
                    >
                      <Tag/>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <FileText size={48} className="mx-auto mb-4 text-theme-secondary opacity-50" />
          <h4 className="text-lg font-medium text-theme-primary mb-2">
            {t('projects.noRelatedBlogsYet')}
          </h4>
          <p className="text-theme-secondary">
            {t('projects.checkBackLater')}
          </p>
        </div>
      )}
    </div>
  );

  const renderLicense = () => (
    <div className="space-y-3">
      {projectData.licenseInfo ? (
        <>
          {/* License Header */}
          <div className="border border-theme-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-0">
              <Scale size={24} className="text-theme-primary" />
              <div>
                <h3 className="text-xl font-semibold text-theme-primary">
                  {projectData.licenseInfo.name}
                </h3>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-sm text-theme-secondary">
                    SPDX ID: {projectData.licenseInfo.spdxId}
                  </span>
                  <a
                    href={projectData.licenseInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-theme-600 hover:underline flex items-center gap-1"
                  >
                    {t('projects.viewOnOSI')}
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>
            
            <p className="text-theme-secondary">
              {language === 'zh' && projectData.licenseInfo.descriptionZh 
                ? projectData.licenseInfo.descriptionZh 
                : projectData.licenseInfo.description
              }
            </p>
          </div>

          {/* License Summary */}

          {/* Full License Text */}
          <div className="border border-theme-border rounded-lg">
            <div className="p-4">
              <pre className="whitespace-pre-wrap text-sm text-theme-secondary font-mono bg-theme-surface p-4 rounded overflow-x-auto">
                {language === 'zh' && projectData.licenseInfo.fullTextZh 
                  ? projectData.licenseInfo.fullTextZh 
                  : projectData.licenseInfo.fullText
                }
              </pre>
            </div>
          </div>

          {/* License Actions */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigator.clipboard.writeText(
                language === 'zh' && projectData.licenseInfo.fullTextZh 
                  ? projectData.licenseInfo.fullTextZh 
                  : projectData.licenseInfo.fullText
              )}
              className="px-4 py-2 bg-theme-primary text-white rounded-lg hover:bg-theme-primary/90 transition-colors"
            >
              {t('projects.copyLicenseText')}
            </button>
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <Scale size={48} className="mx-auto mb-4 text-theme-secondary opacity-50" />
          <h4 className="text-lg font-medium text-theme-primary mb-2">
            {t('projects.noLicenseInformation')}
          </h4>
          <p className="text-theme-secondary">
            {t('projects.licenseNotAvailable')}
          </p>
        </div>
      )}
    </div>
  );

  const renderContent = (tabKey: string = activeTab) => {
    switch (tabKey) {
      case 'readme': return renderReadme();
      case 'relatedblogs': return renderRelatedBlogs();
      case 'quickstart': return renderQuickStart();
      case 'releases': return renderReleases();
      case 'community': return renderCommunity();
      case 'issues': return renderIssues();
      case 'dependencies': return renderDependencies();
      case 'license': return renderLicense();
      default: return renderReadme();
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 md:flex-row md:gap-8">
      {/* Left rail — ds vertical Tabs nav. Sticky on desktop, offset to
          clear the sticky stats bar above it. */}
      <nav className="shrink-0 md:w-56">
        <div className="md:sticky md:top-16">
          <Tabs
            value={activeTab}
            onChange={setActiveTab}
            appearance="vertical"
            items={tabItems.map(item => ({
              value: item.key,
              icon: item.icon,
              label: item.label,
            }))}
          />
        </div>
      </nav>
      {/* Active panel. */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="min-w-0 flex-1"
      >
        {renderContent(activeTab)}
      </motion.div>
    </div>
  );
};

export default ProjectTabs; 