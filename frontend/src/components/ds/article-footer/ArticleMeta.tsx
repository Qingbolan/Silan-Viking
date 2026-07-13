import React, { useState } from 'react';
import { Users, Clock, BookOpen } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useLanguage } from '../../LanguageContext';

interface ArticleMetaProps {
  contributors?: string[];
  publishedAt?: string;
  viewCount?: number;
  ipRegion?: string;
  shareTargets?: ('weibo' | 'wechat')[];
  shareTitle?: string;
  shareUrl?: string;
  onShare?: (target: 'weibo' | 'wechat') => void | Promise<void>;
}

const MetaItem: React.FC<{ icon?: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <span className="inline-flex items-center gap-1.5 text-ds-sm text-ds-fg-muted">
    {icon && <span className="text-ds-fg-subtle [&_svg]:size-[15px]">{icon}</span>}
    {children}
  </span>
);

// Minimal Weibo / WeChat glyphs as inline SVG — avoids pulling a new icon set.
const WeiboGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
    <path d="M10.1 18.6c-3.4.3-6.3-1.2-6.5-3.4-.2-2.2 2.4-4.3 5.8-4.6 3.4-.3 6.3 1.2 6.5 3.4.2 2.2-2.4 4.3-5.8 4.6zm-1.1-3c-.4.6-1.3.9-2 .6-.7-.3-.9-1-.5-1.6.4-.6 1.3-.9 2-.6.7.3.9 1 .5 1.6zm2-1.8c-.1.3-.5.4-.8.3-.3-.1-.4-.4-.3-.6.1-.3.5-.4.8-.3.3.1.4.4.3.6zm9.9-3.9c-.5-.5-1.4-.7-2-.4-.2.1-.4 0-.4-.2-.1-.5 0-1-.3-1.4-.7-.8-2.4-.7-3.9.3-.2.1-.4 0-.5-.1 0-.2.1-.4.3-.5 1.8-1.2 4-1.4 5-.2.4.5.6 1 .5 1.6 0 .2.2.4.4.3.7-.2 1.4 0 1.7.6.2.4.1.9-.2 1.3-.1.2-.4.2-.5 0-.2-.1-.2-.4-.1-.5.1-.2.1-.4 0-.5z" />
  </svg>
);

const WechatGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
    <path d="M8.6 13c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.5 1-1 1zm5 0c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.5 1-1 1zM9 3C4.6 3 1 5.9 1 9.5c0 1.9 1 3.6 2.6 4.7l-.6 1.9 2.2-1.1c.7.2 1.5.3 2.3.4-.1-.4-.2-.8-.2-1.2 0-3 2.9-5.5 6.4-5.5h.4C13.7 5.6 11.6 3 9 3zm14 11.6c0-2.7-2.9-4.9-6.1-4.9-3.4 0-6.1 2.2-6.1 4.9 0 2.7 2.7 4.9 6.1 4.9.7 0 1.4-.1 2-.3l1.8.9-.5-1.6c1.7-.9 2.8-2.3 2.8-3.9zm-8 0c-.4 0-.7-.3-.7-.7 0-.4.3-.7.7-.7s.7.3.7.7-.3.7-.7.7zm4 0c-.4 0-.7-.3-.7-.7 0-.4.3-.7.7-.7s.7.3.7.7-.3.7-.7.7z" />
  </svg>
);

const ShareButton: React.FC<{
  target: 'weibo' | 'wechat';
  onClick?: () => void;
}> = ({ target, onClick }) => {
  const colour = target === 'weibo' ? 'hover:text-[#E6162D]' : 'hover:text-[#1AAD19]';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full',
        'text-ds-fg-subtle transition-colors',
        colour,
      )}
      aria-label={`Share to ${target}`}
    >
      {target === 'weibo' ? <WeiboGlyph /> : <WechatGlyph />}
    </button>
  );
};

const ArticleMeta: React.FC<ArticleMetaProps> = ({
  contributors,
  publishedAt,
  viewCount,
  ipRegion,
  shareTargets = ['weibo', 'wechat'],
  shareTitle,
  shareUrl,
  onShare,
}) => {
  const { language } = useLanguage();
  const [shareFeedback, setShareFeedback] = useState<string>();

  const copyLink = async (value: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Copy command failed');
  };

  const handleShare = async (target: 'weibo' | 'wechat') => {
    if (onShare) {
      await onShare(target);
      return;
    }

    const url = shareUrl || window.location.href.split('#')[0];
    const title = shareTitle || document.title;
    try {
      if (target === 'weibo') {
        const destination = new URL('https://service.weibo.com/share/share.php');
        destination.searchParams.set('url', url);
        destination.searchParams.set('title', title);
        window.open(destination.toString(), '_blank', 'noopener,noreferrer,width=720,height=560');
        setShareFeedback(language === 'zh' ? '已打开微博分享' : 'Weibo share opened');
      } else if (navigator.share) {
        await navigator.share({ title, url });
        setShareFeedback(language === 'zh' ? '分享面板已打开' : 'Share sheet opened');
      } else {
        await copyLink(url);
        setShareFeedback(language === 'zh' ? '链接已复制，可粘贴到微信' : 'Link copied for WeChat');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareFeedback(language === 'zh' ? '分享失败，请重试' : 'Sharing failed. Please retry.');
    }
  };

  return (
    <div className="border-t border-ds-border pt-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {contributors && contributors.length > 0 && (
          <MetaItem icon={<Users />}>
            <span className="max-w-[280px] truncate">{contributors.join(', ')}</span>
          </MetaItem>
        )}
        {publishedAt && (
          <MetaItem icon={<Clock />}>{publishedAt}</MetaItem>
        )}
        {typeof viewCount === 'number' && (
          <MetaItem icon={<BookOpen />}>{viewCount.toLocaleString()}</MetaItem>
        )}
        {ipRegion && <MetaItem>{language === 'zh' ? '发布于' : 'Published from'} {ipRegion}</MetaItem>}

        {shareTargets.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-ds-sm text-ds-fg-muted">
            {language === 'zh' ? '分享：' : 'Share:'}
            {shareTargets.map((t) => (
              <ShareButton key={t} target={t} onClick={() => void handleShare(t)} />
            ))}
          </span>
        )}
      </div>
      <div className="mt-2 min-h-4 text-right text-ds-xs text-ds-fg-subtle" aria-live="polite">
        {shareFeedback}
      </div>
    </div>
  );
};

export default ArticleMeta;
