import React, { useEffect, useState } from 'react';
import { Card, Tabs } from 'antd';
import { Mail, Phone, MapPin, Github, Linkedin, Globe, Lightbulb, Briefcase, Contact, ArrowRight, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../components/ThemeContext';
import { useLanguage } from '../components/LanguageContext';
import {
  AuthProvider,
  useAuth,
} from '../components/InteractiveContact';
import ModernContactForm from '../components/InteractiveContact/ModernContactForm';
import PublicMessagesWall from '../components/InteractiveContact/PublicMessagesWall';

const InteractiveContactPageContent: React.FC = () => {
  const { colors } = useTheme();
  const { language } = useLanguage();
  const { isAuthenticated, user } = useAuth();
  const [activeTab, setActiveTab] = useState('thoughts');
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
  }, [colors]);

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
      <div className="max-w-7xl mx-auto px-4">
        {/* Hero Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            {isAuthenticated
              ? (language === 'en' ? `Hi, ${user?.username}!` : `你好，${user?.username}！`)
              : (language === 'en' ? "Let's Connect" : '联系我')
            }
          </h1>
          <p className="text-xl md:text-2xl max-w-3xl mx-auto text-theme-secondary font-light">
            {language === 'en'
              ? 'Open to collaborations, job opportunities, and interesting conversations'
              : '开放合作、工作机会和有趣的对话'}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Contact Form */}
          <div>
            {/* Contact Form Card */}
            <Card
              className="card-interactive"
              style={{ borderRadius: '16px', border: 'none' }}
              styles={{ body: { padding: '24px' } }}
            >
              <ModernContactForm
                onMessageTypeChange={(type) => {
                  setActiveTab(type === 'general' ? 'thoughts' : 'jobs');
                }}
                onMessageSent={() => {
                  setRefreshKey(prev => prev + 1);
                }}
              />
            </Card>
          </div>

          {/* Right Column - Content Display */}
          <div className="space-y-6">
            <Card
              className="card-interactive"
              style={{ borderRadius: '16px', border: 'none' }}
              styles={{ body: { padding: '24px' } }}
            >
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                  {
                    key: 'thoughts',
                    label: (
                      <span className="flex items-center gap-2">
                        <Lightbulb size={16} />
                        {language === 'en' ? 'Recent Thoughts' : '最新想法'}
                      </span>
                    ),
                    children: (
                      <div className="space-y-3">
                        {recentThoughts.map((thought) => (
                          <div
                            key={thought.id}
                            className="p-3 rounded-lg bg-theme-surface hover:bg-theme-surface-elevated hover:shadow-sm transition-all cursor-pointer"
                          >
                            <h4 className="font-medium text-theme-primary mb-1 text-sm">
                              {thought.title}
                            </h4>
                            <p className="text-xs text-theme-secondary">
                              {thought.description}
                            </p>
                          </div>
                        ))}

                        {/* Show More Button */}
                        <button
                          onClick={() => navigate('/ideas')}
                          className="w-full mt-2 py-2.5 px-4 rounded-lg bg-theme-surface hover:bg-gradient-primary hover:text-white transition-all duration-300 flex items-center justify-center gap-2 text-sm font-medium text-theme-secondary hover:shadow-md group"
                        >
                          <span>{language === 'en' ? 'Show More Ideas' : '查看更多想法'}</span>
                          <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                      </div>
                    ),
                  },
                  {
                    key: 'jobs',
                    label: (
                      <span className="flex items-center gap-2">
                        <Briefcase size={16} />
                        {language === 'en' ? 'Expected Jobs' : '期待职位'}
                      </span>
                    ),
                    children: (
                      <div className="space-y-3">
                        {expectedJobs.map((job) => (
                          <div
                            key={job.id}
                            className="p-3 rounded-lg bg-theme-surface hover:bg-theme-surface-elevated hover:shadow-sm transition-all cursor-pointer"
                          >
                            <h4 className="font-medium text-theme-primary mb-1 text-sm">
                              {job.title}
                            </h4>
                            <p className="text-xs text-theme-secondary">
                              {job.description}
                            </p>
                          </div>
                        ))}

                        {/* Who Am I Button */}
                        <button
                          onClick={() => navigate('/')}
                          className="w-full mt-2 py-2.5 px-4 rounded-lg bg-theme-surface hover:bg-gradient-primary hover:text-white transition-all duration-300 flex items-center justify-center gap-2 text-sm font-medium text-theme-secondary hover:shadow-md group"
                        >
                          <User size={16} className="group-hover:scale-110 transition-transform" />
                          <span>{language === 'en' ? 'Who Am I' : '关于我'}</span>
                          <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                      </div>
                    ),
                  },
                  {
                    key: 'contact',
                    label: (
                      <span className="flex items-center gap-2">
                        <Contact size={16} />
                        {language === 'en' ? 'Quick Contact' : '快速联系'}
                      </span>
                    ),
                    children: (
                      <div className="space-y-3">
                        {/* Contact Info */}
                        <div className="space-y-1.5">
                          {contactInfo.map((item, index) => (
                            <a
                              key={index}
                              href={item.href}
                              target={item.href.startsWith('http') ? '_blank' : undefined}
                              rel="noopener noreferrer"
                              className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-theme-surface-elevated transition-all group"
                            >
                              <div className="text-theme-accent group-hover:scale-110 transition-transform">
                                {item.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-theme-tertiary">{item.title}</div>
                                <div className="text-sm text-theme-primary font-medium truncate">
                                  {item.value}
                                </div>
                              </div>
                            </a>
                          ))}
                        </div>

                        {/* Social Links */}
                        <div className="pt-3 border-t border-theme-card">
                          <h4 className="text-xs font-medium text-theme-secondary mb-2">
                            {language === 'en' ? 'Social Media' : '社交媒体'}
                          </h4>
                          <div className="grid grid-cols-3 gap-2">
                            {socialLinks.map((social, index) => (
                              <a
                                key={index}
                                href={social.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex flex-col items-center gap-1.5 p-2.5 rounded-lg bg-theme-surface hover:bg-gradient-primary hover:text-white transition-all duration-300 group"
                              >
                                <div className="group-hover:scale-110 transition-transform">
                                  {social.icon}
                                </div>
                                <span className="text-xs font-medium">{social.label}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      </div>
                    ),
                  },
                ]}
              />
            </Card>
          </div>
        </div>

        {/* Public Messages Wall - Full Width Section */}
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
