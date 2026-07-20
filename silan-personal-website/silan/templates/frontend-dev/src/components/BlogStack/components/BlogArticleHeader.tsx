import React from 'react';
import { motion } from 'framer-motion';
import { User, Calendar, Clock } from 'lucide-react';
import { BlogData } from '../types/blog';
import { useTheme } from '../../ThemeContext';
import { useLanguage } from '../../LanguageContext';

interface BlogArticleHeaderProps {
  blog: BlogData;
}

export const BlogArticleHeader: React.FC<BlogArticleHeaderProps> = ({ blog }) => {
  const { colors } = useTheme();
  const { language } = useLanguage();

  return (
    <motion.header 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="mb-20 text-center lg:text-left"
    >
      <h1 className="text-4xl lg:text-5xl font-light leading-tight mb-8 tracking-wide text-left lg:text-left" style={{ 
        color: colors.textPrimary,
      }}>
        {language === 'en' ? blog.title : blog.titleZh || blog.title}
      </h1>
            
      <p className="text-lg leading-[1.8] mb-10 lg:mx-auto font-light text-left lg:text-left" style={{ 
        color: colors.textSecondary,
      }}>
        {language === 'en' ? blog.summary : blog.summaryZh || blog.summary}
      </p>
      
      <div className="flex items-left justify-start lg:justify-start flex-wrap gap-4 lg:gap-8 text-sm mb-8" style={{ 
        color: colors.textTertiary,
      }}>
        <span className="flex items-center lg:items-left gap-2">
          <User size={14} />
          {blog.author}
        </span>
        <span className="flex items-center lg:items-left gap-2">
          <Calendar size={14} />
          {new Date(blog.publishDate).toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN')}
        </span>
        <span className="flex items-center lg:items-left gap-2">
          <Clock size={14} />
          {blog.readTime}
        </span>
      </div>
      
      <div className="flex flex-wrap justify-start gap-4">
        {(blog.tags || []).map((tag, index) => (
          <span key={index} className="px-4 py-2 text-sm font-light" style={{ 
            color: colors.textSecondary,
            borderBottom: `1px solid ${colors.cardBorder}`
          }}>
            {tag}
          </span>
        ))}
      </div>
    </motion.header>
  );
}; 