import * as React from 'react';
import {
  Eye,
  EyeOff,
  Github,
  Heart,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
} from 'lucide-react';
import type { InteractionComment, InteractionDetails, InteractionLiker } from '../types';
import { Button } from './ds/Button';

export type InteractionDetailsState =
  | { status: 'loading' }
  | { status: 'ready'; details: InteractionDetails }
  | { status: 'remote-upgrade-required' }
  | { status: 'error'; message: string };

type Props = {
  state: InteractionDetailsState;
  language: string;
  refreshing: boolean;
  onRefresh: () => void;
  visibilityPendingId: string;
  visibilityError: string | null;
  onVisibilityChange: (commentId: string, isPublic: boolean) => void;
};

const avatarTone = (value: string) => {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return Math.abs(hash) % 8;
};

const initials = (name: string) => {
  const value = name.trim();
  return value ? value.charAt(0).toUpperCase() : '?';
};

const countryFlag = (countryCode: string) => {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)));
};

const countryRegion = (countryCode: string, language: string) => {
  const code = countryCode.trim().toUpperCase();
  if (!code) return '';
  try {
    return new Intl.DisplayNames([language === 'zh' ? 'zh-CN' : 'en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
};

const likerName = (liker: InteractionLiker, language: string) => {
  if (liker.label.trim()) return liker.label;
  const number = liker.visitor_number.trim();
  if (liker.kind === 'visitor') {
    return language === 'zh'
      ? `访客${number ? ` ${number}` : ''}`
      : `Visitor${number ? ` ${number}` : ''}`;
  }
  return language === 'zh' ? '已登录用户' : 'Signed-in reader';
};

const Avatar = ({
  name,
  src,
  countryCode,
  visitorNumber,
  size = 'comment',
}: {
  name: string;
  src?: string;
  countryCode?: string;
  visitorNumber?: string;
  size?: 'liker' | 'comment' | 'reply';
}) => {
  const [failed, setFailed] = React.useState(false);
  const imageAvailable = Boolean(src && !failed);
  return (
    <span
      className="interaction-avatar-wrap"
      data-size={size}
      title={name}
      aria-label={name}
    >
      {imageAvailable ? (
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        <span className="interaction-avatar-fallback" data-tone={avatarTone(name)}>
          {visitorNumber || countryFlag(countryCode || '') || initials(name)}
        </span>
      )}
      {visitorNumber && imageAvailable && <small>{visitorNumber}</small>}
    </span>
  );
};

const formatTimelineTime = (value: string, language: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const locale = language === 'zh' ? 'zh-CN' : 'en';
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  if (sameDay) return time;
  const dateLabel = new Intl.DateTimeFormat(locale, {
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    month: language === 'zh' ? 'numeric' : 'short',
    day: 'numeric',
  }).format(date);
  return `${dateLabel} ${time}`;
};

const AuthProviderMark = ({ provider }: { provider: string }) => {
  if (provider === 'github') return <Github size={12} aria-label="GitHub" />;
  if (provider === 'google') return <span className="interaction-auth-provider" aria-label="Google">G</span>;
  return null;
};

const CommentNode = ({
  comment,
  depth,
  replyTo,
  language,
  visibilityPendingId,
  onVisibilityChange,
}: {
  comment: InteractionComment;
  depth: number;
  replyTo?: string;
  language: string;
  visibilityPendingId: string;
  onVisibilityChange: (commentId: string, isPublic: boolean) => void;
}) => {
  const region = countryRegion(comment.country_code, language);
  const visibilityPending = visibilityPendingId === comment.id;
  return (
    <li className="interaction-comment-node">
      <article className="interaction-comment-row" data-public={comment.is_public ? 'true' : 'false'}>
        <Avatar
          name={comment.author_name}
          src={comment.author_avatar_url}
          countryCode={comment.country_code}
          size={depth > 0 ? 'reply' : 'comment'}
        />
        <div className="interaction-comment-content">
          <header>
            <strong>{comment.author_name}</strong>
            <AuthProviderMark provider={comment.auth_provider} />
            {!comment.is_public && (
              <span className="interaction-hidden-label">{language === 'zh' ? '已隐藏' : 'Hidden'}</span>
            )}
          </header>
          <p>
            {replyTo && (
              <span className="interaction-reply-prefix">
                {language === 'zh' ? `回复 ${replyTo}：` : `Reply to ${replyTo}: `}
              </span>
            )}
            {comment.content}
          </p>
          <footer>
            <span>{formatTimelineTime(comment.created_at, language)}</span>
            {region && <span>{countryFlag(comment.country_code)} {region}</span>}
            {comment.likes_count > 0 && (
              <span className="interaction-comment-likes">
                <Heart size={13} aria-hidden="true" /> {comment.likes_count}
              </span>
            )}
            <button
              type="button"
              className="interaction-visibility-toggle"
              data-public={comment.is_public ? 'true' : 'false'}
              aria-pressed={comment.is_public}
              disabled={Boolean(visibilityPendingId)}
              onClick={() => onVisibilityChange(comment.id, !comment.is_public)}
            >
              {visibilityPending
                ? <LoaderCircle aria-hidden="true" className="spinning" />
                : comment.is_public ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
              {language === 'zh'
                ? comment.is_public ? '隐藏' : '设为公开'
                : comment.is_public ? 'Hide' : 'Make public'}
            </button>
          </footer>
        </div>
      </article>
      {comment.replies.length > 0 && (
        <ol className="interaction-comment-children">
          {comment.replies.map((reply) => (
            <CommentNode
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              replyTo={comment.author_name}
              language={language}
              visibilityPendingId={visibilityPendingId}
              onVisibilityChange={onVisibilityChange}
            />
          ))}
        </ol>
      )}
    </li>
  );
};

const LoadingState = () => (
  <div className="interaction-details-skeleton" aria-label="Loading interactions">
    <div><i /><span /><span /></div>
    <div><i /><span /><span /></div>
    <div><i /><span /><span /></div>
  </div>
);

const countComments = (comments: InteractionComment[]): number => comments.reduce(
  (total, comment) => total + 1 + countComments(comment.replies),
  0,
);

export function InteractionDetailsPanel({
  state,
  language,
  refreshing,
  onRefresh,
  visibilityPendingId,
  visibilityError,
  onVisibilityChange,
}: Props) {
  const copy = language === 'zh'
    ? {
        likedBy: '点赞', comments: '评论',
        retry: '重新读取', sync: '同步网站互动', loadError: '互动详情读取失败',
        upgradeTitle: '网站服务需要更新',
        upgradeBody: '线上统计接口仍只返回汇总数字，尚未提供点赞者身份和评论记录。部署当前后端后即可读取完整互动。',
        checkAgain: '重新检查',
        people: (count: number) => `${count} 人`, threads: (count: number) => `${count} 条`,
      }
    : {
        likedBy: 'Liked by', comments: 'Comments',
        retry: 'Read again', sync: 'Sync site interactions', loadError: 'Interaction details could not be read',
        upgradeTitle: 'Website service update required',
        upgradeBody: 'The deployed statistics API still returns aggregate counts without liker identities or comment records. Deploy the current backend to make the full interaction feed available.',
        checkAgain: 'Check again',
        people: (count: number) => `${count} ${count === 1 ? 'person' : 'people'}`,
        threads: (count: number) => `${count} ${count === 1 ? 'comment' : 'comments'}`,
      };

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') {
    return (
      <div className="interaction-sync-state" role="status">
        <MessageSquareText aria-hidden="true" />
        <strong>{copy.loadError}</strong>
        <p>{state.message}</p>
        <Button size="sm" variant="secondary" onClick={onRefresh} loading={refreshing}>
          {!refreshing && <RefreshCw aria-hidden="true" />} {copy.retry}
        </Button>
      </div>
    );
  }

  if (state.status === 'remote-upgrade-required') {
    return (
      <div className="interaction-sync-state" role="status">
        <MessageSquareText aria-hidden="true" />
        <strong>{copy.upgradeTitle}</strong>
        <p>{copy.upgradeBody}</p>
        <Button size="sm" variant="secondary" onClick={onRefresh} loading={refreshing}>
          {!refreshing && <RefreshCw aria-hidden="true" />} {copy.checkAgain}
        </Button>
      </div>
    );
  }

  const { likers, comments } = state.details;
  const commentCount = countComments(comments);
  return (
    <div className="interaction-details">
      <section id="interaction-likers" className="interaction-detail-section" aria-labelledby="interaction-likers-heading">
        <header className="interaction-section-heading">
          <div>
            <h3 id="interaction-likers-heading">{copy.likedBy}</h3>
            {likers.length > 0 && <small aria-label={copy.people(likers.length)}>{likers.length}</small>}
          </div>
          <Button size="sm" variant="ghost" onClick={onRefresh} loading={refreshing} aria-label={copy.sync} title={copy.sync}>
            {!refreshing && <RefreshCw aria-hidden="true" />} {language === 'zh' ? '同步' : 'Sync'}
          </Button>
        </header>
        {likers.length > 0 ? (
          <ul className="interaction-liker-list">
            {likers.map((liker, index) => {
              const name = likerName(liker, language);
              const region = countryRegion(liker.country_code, language);
              return (
                <li key={`${liker.kind}-${liker.label}-${liker.visitor_number}-${index}`}>
                  <Avatar
                    name={name}
                    src={liker.avatar_url}
                    countryCode={liker.country_code}
                    visitorNumber={liker.visitor_number}
                    size="liker"
                  />
                  <span>
                    <strong>{name}</strong>
                    {region && <small>{countryFlag(liker.country_code)} {region}</small>}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section id="interaction-comments" className="interaction-detail-section" aria-labelledby="interaction-comments-heading">
        <header className="interaction-section-heading">
          <div>
            <h3 id="interaction-comments-heading">{copy.comments}</h3>
            {commentCount > 0 && <small aria-label={copy.threads(commentCount)}>{commentCount}</small>}
          </div>
        </header>
        {visibilityError && <p className="interaction-action-error" role="alert">{visibilityError}</p>}
        {comments.length > 0 ? (
          <ol className="interaction-comment-tree">
            {comments.map((comment) => (
              <CommentNode
                key={comment.id}
                comment={comment}
                depth={0}
                language={language}
                visibilityPendingId={visibilityPendingId}
                onVisibilityChange={onVisibilityChange}
              />
            ))}
          </ol>
        ) : null}
      </section>
    </div>
  );
}
