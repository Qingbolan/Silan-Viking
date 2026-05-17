import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useTheme } from '../../ThemeContext';
import { useLanguage } from '../../LanguageContext';
import { NotFoundError } from '../../ds/ErrorState';

interface BlogLoadingStateProps {
  loading: boolean;
  error?: boolean;
}

export const BlogLoadingState: React.FC<BlogLoadingStateProps> = ({ loading, error }) => {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const { language } = useLanguage();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Spin 
            size="large" 
            tip={language === 'en' ? 'Loading article...' : '加载文章中...'}
            indicator={
              <BookOpen 
                size={32} 
                className="animate-pulse" 
                style={{ color: colors.accent }} 
              />
            }
          >
            <div style={{ minHeight: '200px' }} />
          </Spin>
        </motion.div>
      </div>
    );
  }

  if (error) {
    // A genuine not-found — the blog API resolved with no article. Render
    // the design-system full-page error (brand mark, "Home" + "Go Back"),
    // not a floating antd Alert card.
    return <NotFoundError onBack={() => navigate(-1)} />;
  }

  return null;
}; 