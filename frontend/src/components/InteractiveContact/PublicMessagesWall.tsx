import React, { useEffect, useState } from 'react';
import { MessageSquare, Building2, Briefcase, ChevronDown, ChevronUp } from 'lucide-react';
import { ContactMessage } from '../../types/contact';
import { useLanguage } from '../LanguageContext';
import { listIdeaComments, IdeaCommentData } from '../../api/ideas/ideaApi';
import { getClientFingerprint } from '../../utils/fingerprint';
import {
  Card,
  CardContent,
  EmptyState,
  Badge,
  Button,
  Avatar,
} from '../../components/ds';

const PublicMessagesWall: React.FC = () => {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [showAll, setShowAll] = useState(false);
  const { language } = useLanguage();

  useEffect(() => {
    fetchMessages();
  }, [language]);

  const fetchMessages = async () => {
    try {
      const fingerprint = getClientFingerprint();

      // Fetch both general and job type comments from the unified API
      const [generalComments, jobComments] = await Promise.all([
        listIdeaComments('contact-page', 'general', fingerprint, undefined, language as 'en' | 'zh'),
        listIdeaComments('contact-page', 'job', fingerprint, undefined, language as 'en' | 'zh'),
      ]);

      // Transform IdeaCommentData to ContactMessage format
      const transformComment = (comment: IdeaCommentData): ContactMessage => {
        // Parse metadata from content if it exists (for job type)
        let content = comment.content;
        let metadata: any = {};
        const metadataMatch = content.match(/\n\n__METADATA__(.+)$/);
        if (metadataMatch) {
          try {
            metadata = JSON.parse(metadataMatch[1]);
            content = content.replace(/\n\n__METADATA__.+$/, '');
          } catch (e) {
            // If parsing fails, use content as is
          }
        }

        return {
          id: comment.id,
          type: comment.type as 'general' | 'job',
          author_name: comment.author_name,
          author_avatar: comment.author_avatar_url,
          author_email: '',
          message: content,
          subject: metadata.subject || '',
          company: metadata.company,
          position: metadata.position,
          recruiter_name: metadata.recruiter_name,
          recruiter_title: metadata.recruiter_title,
          consentCompanyLogo: metadata.consentCompanyLogo || false,
          isPublic: metadata.isPublic !== false,
          status: 'read' as const,
          createdAt: comment.created_at,
          updatedAt: comment.created_at,
          replies: undefined, // Flatten replies for display
        };
      };

      const allMessages = [...generalComments, ...jobComments]
        .map(transformComment)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setMessages(allMessages);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      setMessages([]);
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

      <style>{`
        @media (max-width: 768px) {
          .masonry-grid {
            flex-direction: column !important;
          }
          .masonry-column:not(:first-child) {
            display: none;
          }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .masonry-column:nth-child(3) {
            display: none;
          }
        }
      `}</style>

      {/* Messages Grid */}
      {displayMessages.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<MessageSquare />}
              title={language === 'en' ? 'No public messages yet' : '还没有公开留言'}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="masonry-grid"
          style={{
            display: 'flex',
            marginLeft: '-1rem',
            width: 'auto',
          }}
        >
          {[0, 1, 2].map(columnIndex => (
            <div
              key={columnIndex}
              className="masonry-column"
              style={{
                paddingLeft: '1rem',
                backgroundClip: 'padding-box',
                flex: 1,
              }}
            >
              {displayMessages
                .filter((_, index) => index % 3 === columnIndex)
                .map((msg) => (
            <Card key={msg.id} className="masonry-card mb-4 w-full">
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
