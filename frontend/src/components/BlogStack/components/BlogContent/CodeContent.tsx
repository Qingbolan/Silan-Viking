import React from 'react';
import { BlogContent } from '../../types/blog';
import { CodeBlock } from '../../../ui/CodeBlock';

interface CodeContentProps {
  item: BlogContent;
  index: number;
  isWideScreen: boolean;
}

export const CodeContent: React.FC<CodeContentProps> = ({ item, isWideScreen }) => (
  <CodeBlock content={item.content} language={item.language} caption={item.caption} isWideScreen={isWideScreen} />
);
