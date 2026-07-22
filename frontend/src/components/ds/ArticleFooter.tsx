import React from 'react';
import LikePanel from './article-footer/LikePanel';
import ArticleMeta, { type ShareTarget } from './article-footer/ArticleMeta';
import CompactComments from './article-footer/CompactComments';
import { LoginPromptModal } from './LoginPromptModal';
import { useRequireIdentity } from '../../lib/useRequireIdentity';
import type {
  ArticleComment,
  CommentDraft,
  CommentLoadState,
} from './article-footer/types';

export interface ArticleFooterProps {
  likes: number;
  liked: boolean;
  likePending?: boolean;
  contributors?: string[];
  publishedAt?: string;
  viewCount?: number;
  ipRegion?: string;
  shareTitle?: string;
  shareUrl?: string;
  comments: ArticleComment[];
  commentsState: CommentLoadState;
  commentsError?: string;
  commentSubmitting?: boolean;
  interactionError?: string;
  onLike: () => void | Promise<void>;
  onRetryComments: () => void | Promise<void>;
  onComment: (draft: CommentDraft) => void | Promise<void>;
  onCommentLike: (commentId: string) => void | Promise<void>;
  isCommentLikePending: (commentId: string) => boolean;
  onCommentDelete?: (commentId: string) => void | Promise<void>;
  isCommentDeletePending?: (commentId: string) => boolean;
  onShare?: (target: ShareTarget) => void | Promise<void>;
}

const ArticleFooter: React.FC<ArticleFooterProps> = ({
  likes,
  liked,
  likePending,
  contributors,
  publishedAt,
  viewCount,
  ipRegion,
  shareTitle,
  shareUrl,
  comments,
  commentsState,
  commentsError,
  commentSubmitting,
  interactionError,
  onLike,
  onRetryComments,
  onComment,
  onCommentLike,
  isCommentLikePending,
  onCommentDelete,
  isCommentDeletePending,
  onShare,
}) => {
  const { loginPromptOpen, requireIdentity, resolveLogin, closeLoginPrompt } =
    useRequireIdentity<() => void>();

  return (
    <div className="mt-12">
      <div id="kb-likes">
        <LikePanel
          likes={likes}
          liked={liked}
          pending={likePending}
          onLike={() => requireIdentity(onLike, (action) => action())}
        />
      </div>
      <ArticleMeta
        contributors={contributors}
        publishedAt={publishedAt}
        viewCount={viewCount}
        ipRegion={ipRegion}
        shareTitle={shareTitle}
        shareUrl={shareUrl}
        onShare={onShare}
      />
      {interactionError && (
        <p className="mt-3 text-right text-ds-xs text-red-600" role="status">
          {interactionError}
        </p>
      )}
      <div id="kb-comments">
        <CompactComments
          comments={comments}
          state={commentsState}
          error={commentsError}
          submitting={commentSubmitting}
          onRetry={onRetryComments}
          onSubmit={onComment}
          onCommentLike={onCommentLike}
          isCommentLikePending={isCommentLikePending}
          onCommentDelete={onCommentDelete}
          isCommentDeletePending={isCommentDeletePending}
        />
      </div>
      <LoginPromptModal
        open={loginPromptOpen}
        onClose={closeLoginPrompt}
        onResolved={() => resolveLogin((action) => action())}
      />
    </div>
  );
};

export default ArticleFooter;
