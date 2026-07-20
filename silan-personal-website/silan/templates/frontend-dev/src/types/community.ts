export interface Comment {
  id: string;
  author: string;
  avatar?: string;
  content: string;
  timestamp: Date;
  likes: number;
  replies: Reply[];
  tags: string[];
  type: 'general' | 'suggestion' | 'question' | 'bug-report';
  status?: 'open' | 'resolved' | 'in-progress';
  isAnonymous: boolean;
}

export interface Reply {
  id: string;
  author: string;
  avatar?: string;
  content: string;
  timestamp: Date;
  likes: number;
  isAnonymous: boolean;
}

export interface CommunityStats {
  totalComments: number;
  totalSuggestions: number;
  resolvedSuggestions: number;
  activeDiscussions: number;
  contributors: number;
} 