import React, { useEffect, useState } from 'react';
import { Mail, Phone, MapPin, Github, Linkedin, Globe, Lightbulb, Briefcase, Contact, ArrowRight, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../components/LanguageContext';
import { Seo } from '../components/Seo';
import {
  AuthProvider,
  useAuth,
} from '../components/InteractiveContact';
import ModernContactForm from '../components/InteractiveContact/ModernContactForm';
import PublicMessagesWall from '../components/InteractiveContact/PublicMessagesWall';
import {
  BlogHeader,
  Card,
  CardContent,
  Tabs,
  Button,
  Divider,
} from '../components/ds';

/** A single tappable list row — title + one-line description. */
const ListRow: React.FC<{
  title: string;
  description: string;
  onClick?: () => void;
}> = ({ title, description, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full rounded-ds-md border border-transparent px-3 py-2.5 text-left transition-colors duration-ds-fast hover:border-ds-border hover:bg-ds-surface-2"
  >
    <div className="text-ds-sm font-medium text-ds-fg">{title}</div>
    <div className="mt-0.5 text-ds-xs text-ds-fg-muted">{description}</div>
  </button>
);

const InteractiveContactPageContent: React.FC = () => {
  const { language } = useLanguage();
  const { isAuthenticated, user } = useAuth();
  const [activeTab, setActiveTab] = useState('thoughts');
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const contactInfo = [
    {
      icon: <Mail size={18} />,
      title: language === 'en' ? 'Email' : '邮箱',
      value: 'silan.hu@u.nus.edu',
      href: 'mailto:silan.hu@u.nus.edu',
    },
    {
      icon: <Phone size={18} />,
      title: language === 'en' ? 'Phone' : '电话',
      value: '+65 8698 6181',
      href: 'tel:+6586986181',
    },
    {
      icon: <MapPin size={18} />,
      title: language === 'en' ? 'Location' : '位置',
      value: 'Singapore',
      href: 'https://maps.google.com/?q=Singapore',
    },
  ];

  const socialLinks = [
    { icon: <Github size={18} />, label: 'GitHub', href: 'https://github.com/Qingbolan' },
    { icon: <Linkedin size={18} />, label: 'LinkedIn', href: 'https://linkedin.com/in/Qingbolan' },
    { icon: <Globe size={18} />, label: 'Website', href: 'https://silan.tech' },
  ];

  // Mock data for recent thoughts
  const recentThoughts = [
    { id: 1, title: 'Knowledge Forest: 行为即知识资产', description: language === 'en' ? 'Building a knowledge management system' : '构建知识管理系统' },
    { id: 2, title: 'EasyRemote: 下一代算力互联', description: language === 'en' ? 'Next-gen computing connectivity' : '下一代算力互联' },
    { id: 3, title: 'GEM: 在生成引擎中做营销', description: language === 'en' ? 'Marketing in generative engines' : '在生成引擎中做营销' },
  ];

  // Expected job opportunities
  const expectedJobs = [
    {
      id: 1,
      title: language === 'en' ? 'AI Infrastructure Engineer' : 'AI基础设施工程师',
      description: language === 'en'
        ? 'Building agent database systems and behavior version control for AI workflows'
        : '构建AI工作流的Agent数据库系统和行为版本控制'
    },
    {
      id: 2,
      title: language === 'en' ? 'Distributed Systems Engineer' : '分布式系统工程师',
      description: language === 'en'
        ? 'Implementing production-grade distributed systems with Go/Python'
        : '使用Go/Python实现生产级分布式系统'
    },
    {
      id: 3,
      title: language === 'en' ? 'Research Collaborator' : '研究合作者',
      description: language === 'en'
        ? 'Co-building evaluation platforms and co-authoring research papers'
        : '共建评测平台和论文共著'
    },
  ];

  return (
    <div className="min-h-screen py-20">
      <Seo
        title={language === 'en' ? 'Contact' : '联系'}
        description={
          language === 'en'
            ? 'Get in touch with Silan Hu — email, social links and a public message board.'
            : '联系胡思蓝 —— 邮箱、社交链接与公开留言板。'
        }
        path="/contact"
        lang={language as 'en' | 'zh'}
      />
      <div className="max-w-7xl mx-auto px-4">
        {/* Hero header — same BlogHeader hero used by blog/ideas/projects,
            but hero-only (no search / filter toolbar). */}
        <BlogHeader
          className="mb-12"
          eyebrow={language === 'en' ? 'Contact' : '联系'}
          title={
            isAuthenticated
              ? (language === 'en' ? `Hi, ${user?.username}!` : `你好，${user?.username}！`)
              : (language === 'en' ? "Let's Connect" : '联系我')
          }
          description={
            language === 'en'
              ? 'Open to collaborations, job opportunities, and interesting conversations'
              : '开放合作、工作机会和有趣的对话'
          }
        />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Left — contact form. */}
          <Card>
            <CardContent>
              <ModernContactForm
                onMessageTypeChange={(type) => {
                  setActiveTab(type === 'general' ? 'thoughts' : 'jobs');
                }}
                onMessageSent={() => {
                  setRefreshKey((prev) => prev + 1);
                }}
              />
            </CardContent>
          </Card>

          {/* Right — tabbed content. */}
          <Card>
            <CardContent>
              <Tabs
                value={activeTab}
                onChange={setActiveTab}
                items={[
                  {
                    value: 'thoughts',
                    icon: <Lightbulb />,
                    label: language === 'en' ? 'Recent Thoughts' : '最新想法',
                  },
                  {
                    value: 'jobs',
                    icon: <Briefcase />,
                    label: language === 'en' ? 'Expected Jobs' : '期待职位',
                  },
                  {
                    value: 'contact',
                    icon: <Contact />,
                    label: language === 'en' ? 'Quick Contact' : '快速联系',
                  },
                ]}
              />

              {/* Recent thoughts. */}
              {activeTab === 'thoughts' && (
                <div className="mt-4 space-y-1.5">
                  {recentThoughts.map((thought) => (
                    <ListRow
                      key={thought.id}
                      title={thought.title}
                      description={thought.description}
                      onClick={() => navigate('/ideas')}
                    />
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    block
                    className="mt-2"
                    trailingIcon={<ArrowRight />}
                    onClick={() => navigate('/ideas')}
                  >
                    {language === 'en' ? 'Show More Ideas' : '查看更多想法'}
                  </Button>
                </div>
              )}

              {/* Expected jobs. */}
              {activeTab === 'jobs' && (
                <div className="mt-4 space-y-1.5">
                  {expectedJobs.map((job) => (
                    <ListRow
                      key={job.id}
                      title={job.title}
                      description={job.description}
                      onClick={() => navigate('/')}
                    />
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    block
                    className="mt-2"
                    leadingIcon={<User />}
                    trailingIcon={<ArrowRight />}
                    onClick={() => navigate('/')}
                  >
                    {language === 'en' ? 'Who Am I' : '关于我'}
                  </Button>
                </div>
              )}

              {/* Quick contact. */}
              {activeTab === 'contact' && (
                <div className="mt-4 space-y-3">
                  {/* Contact info rows. */}
                  <div className="space-y-1">
                    {contactInfo.map((item, index) => (
                      <a
                        key={index}
                        href={item.href}
                        target={item.href.startsWith('http') ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-ds-md px-3 py-2.5 transition-colors duration-ds-fast hover:bg-ds-surface-2"
                      >
                        <span className="text-ds-primary [&_svg]:size-[18px]">
                          {item.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-ds-2xs text-ds-fg-subtle">
                            {item.title}
                          </span>
                          <span className="block truncate text-ds-sm font-medium text-ds-fg">
                            {item.value}
                          </span>
                        </span>
                      </a>
                    ))}
                  </div>

                  {/* Social links. */}
                  <Divider />
                  <div>
                    <h4 className="mb-2 text-ds-2xs font-medium uppercase tracking-[0.08em] text-ds-fg-subtle">
                      {language === 'en' ? 'Social Media' : '社交媒体'}
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      {socialLinks.map((social, index) => (
                        <a
                          key={index}
                          href={social.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col items-center gap-1.5 rounded-ds-md border border-ds-border bg-ds-surface-1 px-2.5 py-3 text-ds-fg-muted transition-colors duration-ds-fast hover:border-ds-primary/30 hover:bg-ds-primary-soft hover:text-ds-primary [&_svg]:size-[18px]"
                        >
                          {social.icon}
                          <span className="text-ds-2xs font-medium">{social.label}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Public messages wall — full width. */}
        <div className="mt-16">
          <PublicMessagesWall key={refreshKey} />
        </div>
      </div>
    </div>
  );
};

const InteractiveContactPage: React.FC = () => {
  return (
    <AuthProvider>
      <InteractiveContactPageContent />
    </AuthProvider>
  );
};

export default InteractiveContactPage;
