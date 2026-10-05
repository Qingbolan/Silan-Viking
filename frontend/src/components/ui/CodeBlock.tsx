import React from 'react';
import { useLanguage } from '../LanguageContext';
import { useToast } from '../ds/Toast';
import { CodeBlockView, type CodeBlockProps } from './CodeBlockView';

export const CodeBlock: React.FC<CodeBlockProps> = (props) => {
  const { language } = useLanguage();
  const toast = useToast();
  return <CodeBlockView {...props} uiLanguage={language} onCopyError={() => toast.error(language === 'en' ? 'Code could not be copied' : '代码复制失败')} />;
};
