import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Eye,
  Heart,
  Share2,
} from 'lucide-react';
import { BlogData, Section } from '../types/blog';
import { useTheme } from '../../ThemeContext';
import { useLanguage } from '../../LanguageContext';

interface BlogHeaderProps {
  blog: BlogData;
  readingProgress: number;
  sections: Section[];
  userAnnotationsCount: number;
  liked: boolean;
  bookmarked: boolean;
  showToc: boolean;
  isWideScreen: boolean;
  onToggleLike: () => void;
  onToggleBookmark: () => void;
  onToggleToc: () => void;
  onShare: () => void;
}

export const BlogHeader: React.FC<BlogHeaderProps> = ({
  blog,
  readingProgress,
  onShare
}) => {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const { language } = useLanguage();

  return (
    <>
      {/* Reading Progress Bar */}
      <div className="fixed top-0 left-0 z-50 w-full h-1">
        <div 
          className="h-full transition-all duration-300 ease-out"
          style={{ 
            width: `${readingProgress}%`,
            backgroundColor: colors.primary || colors.accent || '#6366f1'
          }}
        />
      </div>

      {/* Header */}
      <div className="sticky top-0 z-40 py-4" style={{ 
        borderBottom: `1px solid ${colors.cardBorder}`
      }}>
        <div className="mx-auto px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                style={{ 
                  color: colors.textSecondary,
                  fontFamily: 'Georgia, "Times New Roman", serif'
                }}
              >
                <ArrowLeft size={18} />
                {language === 'en' ? 'Back' : '返回'}
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-6 text-sm" style={{ 
                color: colors.textTertiary,
                fontFamily: 'Georgia, "Times New Roman", serif'
              }}>
                <span className="flex items-center gap-2">
                  <Eye size={14} />
                  {blog.views}
                </span>
                <span className="flex items-center gap-2">
                  <Heart size={14} />
                  {blog.likes}
                </span>
              </div>
              <button 
                type="button"
                className="p-2 hover:opacity-70 transition-opacity" 
                style={{ color: colors.textTertiary }}
                aria-label={language === 'en' ? 'Share article' : '分享文章'}
                title={language === 'en' ? 'Share' : '分享'}
                onClick={onShare}
              >
                <Share2 size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
