import React, { useEffect, useState } from 'react';
import { MessageSquare, Building2, Briefcase, ChevronDown, ChevronUp } from 'lucide-react';
import { ContactMessage } from '../../types/contact';
import { useLanguage } from '../LanguageContext';
import { listPublicContactMessages } from '../../api/contact/contactApi';
import {
  Card,
  CardContent,
  EmptyState,
  Badge,
  Button,
  Avatar,
  Alert,
  Skeleton,
} from '../../components/ds';

const PublicMessagesWall: React.FC = () => {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const { language } = useLanguage();

  useEffect(() => {
    fetchMessages();
  }, [language]);

  const fetchMessages = async () => {
    setState('loading');
    try {
      setMessages(await listPublicContactMessages());
      setState('ready');
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      setState('error');
    }
  };

  const displayMessages = showAll ? messages : messages.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Messages Title */}
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-ds-md bg-ds-primary">
          <MessageSquare size={18} className="text-white" />
        </div>
        <h3 className="text-ds-lg font-semibold text-ds-fg">
          {language === 'en' ? 'Public Messages' : '公开留言'}
        </h3>
      </div>

      {/* Messages Grid */}
      {state === 'loading' ? (
        <div aria-label={language === 'en' ? 'Loading public messages' : '正在加载公开留言'} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => <Skeleton key={item} shape="block" className="h-36" />)}
        </div>
      ) : state === 'error' ? (
        <Alert
          tone="error"
          title={language === 'en' ? 'Public messages could not be loaded' : '公开留言加载失败'}
        >
          <Button variant="ghost" size="sm" className="mt-2" onClick={fetchMessages}>
            {language === 'en' ? 'Try again' : '重试'}
          </Button>
        </Alert>
      ) : displayMessages.length === 0 ? (
        <EmptyState
          icon={<MessageSquare />}
          title={language === 'en' ? 'No public messages yet' : '还没有公开留言'}
          description={language === 'en' ? 'Public messages will appear here after submission.' : '公开留言提交后会显示在这里。'}
        />
      ) : (
        <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
          {displayMessages.map((msg) => (
            <Card key={msg.id} className="mb-4 w-full break-inside-avoid">
              <CardContent className="flex items-start gap-3">
                {/* Author Avatar */}
                <div className="shrink-0">
                  <Avatar size="md" src={msg.author_avatar} name={msg.author_name} />
                </div>

                {/* Message Content */}
                <div className="flex-1 min-w-0">
                  {/* Header with name and type */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-ds-fg text-sm truncate">
                      {msg.author_name}
                    </span>
                    {msg.type === 'job' && (
                      <Badge tone="warning" appearance="soft" size="sm">
                        Job
                      </Badge>
                    )}
                    <span className="text-xs text-ds-fg-subtle ml-auto">
                      {new Date(msg.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Job-specific information */}
                  {msg.type === 'job' && (
                    <>
                      {/* Recruiter info */}
                      {msg.recruiter_title && (
                        <div className="text-xs text-ds-fg-subtle mb-2">
                          {msg.recruiter_title}
                        </div>
                      )}

                      {/* Position Title */}
                      {msg.position && (
                        <div className="text-sm font-semibold text-ds-fg mb-2 flex items-center gap-2">
                          <Briefcase size={14} className="text-ds-primary" />
                          {msg.position}
                        </div>
                      )}

                      {/* Company info */}
                      {msg.company && msg.consentCompanyLogo && (
                        <div className="text-xs text-ds-fg-muted flex items-center gap-1.5 mb-2">
                          <Building2 size={12} className="text-ds-primary" />
                          <span className="font-medium">{msg.company}</span>
                        </div>
                      )}

                      {/* Job Description */}
                      <div className="text-xs text-ds-fg-muted mb-1">
                        <span className="font-medium">{language === 'en' ? 'Description: ' : '职位描述：'}</span>
                        {msg.message}
                      </div>
                    </>
                  )}

                  {/* General message subject (for non-job messages) */}
                  {msg.type === 'general' && msg.subject && (
                    <div className="text-sm text-ds-fg font-medium mb-1">
                      {msg.subject}
                    </div>
                  )}

                  {/* Message content for general messages */}
                  {msg.type === 'general' && (
                    <div className="text-xs text-ds-fg-muted">
                      {msg.message}
                    </div>
                  )}

                  {msg.replies && msg.replies.length > 0 && (
                    <div className="flex items-center gap-1 text-ds-fg-subtle text-xs mt-2">
                      <MessageSquare size={12} />
                      <span>{msg.replies.length} {language === 'en' ? 'replies' : '回复'}</span>
                    </div>
                  )}
                </div>
            </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Show More/Less */}
      {messages.length > 6 && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => setShowAll(!showAll)}
            leadingIcon={showAll ? <ChevronUp /> : <ChevronDown />}
          >
            {showAll
              ? (language === 'en' ? 'Show Less' : '收起')
              : (language === 'en' ? `Show ${messages.length - 6} More` : `显示更多 ${messages.length - 6} 条`)}
          </Button>
        </div>
      )}
    </div>
  );
};

export default PublicMessagesWall;
