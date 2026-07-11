// ArticleFooter — the Yuque-style footer that sits at the end of every long-form
// reading page: a centred like panel, a contributors / date / view-count meta row,
// and a comments section.
//
// Wiring is intentionally minimal — every callback is optional, so a caller can
// drop <ArticleFooter likes={n} comments={mock} /> in and get a working surface.
// Backed by mock data today (see ./__mocks__/articleFooterMock); the same prop
// shape will accept real API payloads once the backend like/comment endpoints
// land.
import React from 'react';
import LikePanel from './article-footer/LikePanel';
import ArticleMeta from './article-footer/ArticleMeta';
import CommentsSection from './article-footer/CommentsSection';
import type {
  MockComment,
  MockLiker,
} from './__mocks__/articleFooterMock';

export interface ArticleFooterProps {
  likes: number;
  liked?: boolean;
  recentLikers?: MockLiker[];
  contributors?: string[];
  publishedAt?: string;
  viewCount?: number;
  ipRegion?: string;
  shareTargets?: ('weibo' | 'wechat')[];
  comments: MockComment[];
  currentUser?: { name: string; avatar?: string };
  onLike?: () => void;
  onComment?: (text: string) => void;
  onShare?: (target: 'weibo' | 'wechat') => void;
}

const ArticleFooter: React.FC<ArticleFooterProps> = ({
  likes,
  liked,
  recentLikers,
  contributors,
  publishedAt,
  viewCount,
  ipRegion,
  shareTargets,
  comments,
  currentUser,
  onLike,
  onComment,
  onShare,
}) => {
  return (
    <div className="mt-12">
      <div id="kb-likes">
        <LikePanel
          likes={likes}
          liked={liked}
          recentLikers={recentLikers}
          onLike={onLike}
        />
      </div>
      <ArticleMeta
        contributors={contributors}
        publishedAt={publishedAt}
        viewCount={viewCount}
        ipRegion={ipRegion}
        shareTargets={shareTargets}
        onShare={onShare}
      />
      <div id="kb-comments">
        <CommentsSection
          comments={comments}
          currentUser={currentUser}
          onSubmit={onComment}
        />
      </div>
    </div>
  );
};

export default ArticleFooter;
