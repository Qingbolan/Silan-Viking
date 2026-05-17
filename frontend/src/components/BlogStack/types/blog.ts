import { ReactNode } from 'react';

export interface BlogContent {
  id: string;
  type: 'text' | 'image' | 'video' | 'quote' | 'code' | 'heading' | 'markdown';
  content: string;
  metadata?: Record<string, any>;
  children?: ReactNode;
  // Heading specific properties
  level?: number; // 1-6 for h1-h6
  // Image specific properties
  caption?: string;
  // Code specific properties
  language?: string;
  // Annotation specific properties
  annotation?: string;
}

export interface BlogData {
  id: string;
  title: string;
  titleZh?: string;
  slug?: string;
  author: string;
  publishDate: string;
  readTime: string;
  category: string;
  tags: string[];
  content: BlogContent[];
  likes: number;
  views: number;
  summary: string;
  summaryZh?: string;
  type?: 'article' | 'vlog' | 'tutorial' | 'podcast';
  // Vlog specific fields
  videoUrl?: string;
  videoDuration?: string;
  videoThumbnail?: string;
  vlogCover?: string; // Vlog cover image for display
}

export interface Comment {
  id: string;
  blog_post_id: string;
  parent_id?: string;
  author_name: string;
  author_avatar_url?: string;
  content: string;
  created_at: string;
  user_identity_id?: string;
  replies?: Comment[];
}

export interface UserAnnotation {
  text: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  fingerprint?: string;
}

export interface Section {
  id: string;
  title: string;
  level: number;
}

export interface SelectedText {
  text: string;
  contentId: string;
  startOffset: number;
  endOffset: number;
} 
