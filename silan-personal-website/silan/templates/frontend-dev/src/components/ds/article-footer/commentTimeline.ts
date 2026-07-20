import type { ArticleComment } from './types';

export interface TimelineMessage {
  comment: ArticleComment;
  showTime: boolean;
}

const TIME_GROUP_INTERVAL_MS = 5 * 60 * 1000;

const readTimestamp = (value: string): number | undefined => {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
};

const flattenConversation = (comments: ArticleComment[]): ArticleComment[] =>
  comments.flatMap((comment) => [
    comment,
    ...flattenConversation(comment.replies),
  ]);

export const buildCommentTimeline = (comments: ArticleComment[]): TimelineMessage[] => {
  const conversation = flattenConversation(comments);

  return conversation.map((comment, index) => {
    if (index === 0) return { comment, showTime: true };

    const current = readTimestamp(comment.createdAt);
    const previous = readTimestamp(conversation[index - 1].createdAt);
    const showTime = current === undefined
      || previous === undefined
      || Math.abs(current - previous) >= TIME_GROUP_INTERVAL_MS;

    return { comment, showTime };
  });
};

const isSameDay = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate();

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const formatTimelineTime = (
  value: string,
  language: 'zh' | 'en',
  now = new Date(),
): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const locale = language === 'zh' ? 'zh-CN' : 'en';
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  if (isSameDay(date, now)) return time;

  const dayDifference = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (dayDifference === 1) {
    return language === 'zh' ? `昨天 ${time}` : `Yesterday ${time}`;
  }

  const dateLabel = new Intl.DateTimeFormat(locale, {
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    month: language === 'zh' ? 'numeric' : 'short',
    day: 'numeric',
  }).format(date);
  return `${dateLabel} ${time}`;
};
