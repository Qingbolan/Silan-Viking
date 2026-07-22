import React from 'react';
import { Heart } from 'lucide-react';
import LikePanel from './article-footer/LikePanel';
import ArticleMeta, { type ShareTarget } from './article-footer/ArticleMeta';
import CompactComments from './article-footer/CompactComments';
import LikerAvatar from './article-footer/Avatar';
import { LoginPromptModal } from './LoginPromptModal';
import { useRequireIdentity } from '../../lib/useRequireIdentity';
import type {
  ArticleComment,
  CommentDraft,
  CommentLoadState,
} from './article-footer/types';

export interface ArticleLiker {
  kind: 'user' | 'visitor' | string;
  country_code?: string;
  visitor_number?: string;
  avatar_url?: string;
  label?: string;
}

export interface ArticleFooterProps {
  likes: number;
  liked: boolean;
  likePending?: boolean;
  likers?: ArticleLiker[];
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

const LikerStrip: React.FC<{
  likers: ArticleLiker[];
  likes: number;
}> = ({ likers, likes }) => {
  if (likes <= 0 || likers.length === 0) return null;

  return (
    <div className="mt-3 flex items-center justify-center gap-3" aria-label={`${likes} likes`}>
      <Heart className="size-7 shrink-0 text-ds-fg-muted" strokeWidth={1.8} />
      <div className="flex flex-wrap items-center gap-1.5">
        {likers.map((liker, index) => {
          const name = liker.label || (liker.kind === 'visitor'
            ? `Visitor ${liker.visitor_number || index + 1}`
            : 'Reader');
          return (
            <LikerAvatar
              key={`${liker.kind}-${liker.label || liker.visitor_number || index}`}
              name={name}
              src={liker.avatar_url}
              countryCode={liker.country_code}
              visitorNumber={liker.visitor_number}
              size="lg"
              className="rounded-[8px]"
            />
          );
        })}
      </div>
    </div>
  );
};

const ArticleFooter: React.FC<ArticleFooterProps> = ({
  likes,
  liked,
  likePending,
  likers = [],
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
        <LikerStrip likers={likers} likes={likes} />
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
