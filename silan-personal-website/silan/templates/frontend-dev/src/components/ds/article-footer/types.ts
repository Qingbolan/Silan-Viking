export type CommentLoadState = 'loading' | 'ready' | 'error';

export interface ArticleComment {
  id: string;
  authorName: string;
  avatarUrl?: string;
  content: string;
  createdAt: string;
  likesCount: number;
  likedByCurrentUser: boolean;
  canDelete: boolean;
  replies: ArticleComment[];
}

export interface CommentDraft {
  authorName: string;
  authorEmail: string;
  content: string;
}
