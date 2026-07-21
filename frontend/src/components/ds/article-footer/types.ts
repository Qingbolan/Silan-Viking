export type CommentLoadState = 'loading' | 'ready' | 'error';

export interface ArticleComment {
  id: string;
  authorName: string;
  avatarUrl?: string;
  countryCode?: string;
  /** OAuth provider the author is signed in with ("google" | "github"),
   *  when the comment came from an authenticated identity rather than a
   *  guest name/email. */
  authProvider?: string;
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
