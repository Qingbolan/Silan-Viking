import React, { useState } from 'react';
import { BookOpen, Clock, Linkedin } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useLanguage } from '../../LanguageContext';
import { LogoMark } from '../Logo';

export type ShareTarget = 'linkedin' | 'x' | 'reddit' | 'zhihu' | 'weibo' | 'wechat';

interface ArticleMetaProps {
  contributors?: string[];
  publishedAt?: string;
  viewCount?: number;
  ipRegion?: string;
  shareTargets?: ShareTarget[];
  shareTitle?: string;
  shareUrl?: string;
  onShare?: (target: ShareTarget) => void | Promise<void>;
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

const BRAND_PATHS = {
  x: 'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z',
  reddit: 'M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z',
  zhihu: 'M5.721 0C2.251 0 0 2.25 0 5.719V18.28C0 21.751 2.252 24 5.721 24h12.56C21.751 24 24 21.75 24 18.281V5.72C24 2.249 21.75 0 18.281 0zm1.964 4.078c-.271.73-.5 1.434-.68 2.11h4.587c.545-.006.445 1.168.445 1.171H9.384a58.104 58.104 0 01-.112 3.797h2.712c.388.023.393 1.251.393 1.266H9.183a9.223 9.223 0 01-.408 2.102l.757-.604c.452.456 1.512 1.712 1.906 2.177.473.681.063 2.081.063 2.081l-2.794-3.382c-.653 2.518-1.845 3.607-1.845 3.607-.523.468-1.58.82-2.64.516 2.218-1.73 3.44-3.917 3.667-6.497H4.491c0-.015.197-1.243.806-1.266h2.71c.024-.32.086-3.254.086-3.797H6.598c-.136.406-.158.447-.268.753-.594 1.095-1.603 1.122-1.907 1.155.906-1.821 1.416-3.6 1.591-4.064.425-1.124 1.671-1.125 1.671-1.125zM13.078 6h6.377v11.33h-2.573l-2.184 1.373-.401-1.373h-1.219zm1.313 1.219v8.86h.623l.263.937 1.455-.938h1.456v-8.86z',
  weibo: 'M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.737 5.439l-.002.004zM9.05 17.219c-.384.616-1.208.884-1.829.602-.612-.279-.793-.991-.406-1.593.379-.595 1.176-.861 1.793-.601.622.263.82.972.442 1.592zm1.27-1.627c-.141.237-.449.353-.689.253-.236-.09-.313-.361-.177-.586.138-.227.436-.346.672-.24.239.09.315.36.18.601l.014-.028zm.176-2.719c-1.893-.493-4.033.45-4.857 2.118-.836 1.704-.026 3.591 1.886 4.21 1.983.64 4.318-.341 5.132-2.179.8-1.793-.201-3.642-2.161-4.149zm7.563-1.224c-.346-.105-.57-.18-.405-.615.375-.977.42-1.804 0-2.404-.781-1.112-2.915-1.053-5.364-.03 0 0-.766.331-.571-.271.376-1.217.315-2.224-.27-2.809-1.338-1.337-4.869.045-7.888 3.08C1.309 10.87 0 13.273 0 15.348c0 3.981 5.099 6.395 10.086 6.395 6.536 0 10.888-3.801 10.888-6.82 0-1.822-1.547-2.854-2.915-3.284v.01zm1.908-5.092c-.766-.856-1.908-1.187-2.96-.962-.436.09-.706.511-.616.932.09.42.511.691.932.602.511-.105 1.067.044 1.442.465.376.421.466.977.316 1.473-.136.406.089.856.51.992.405.119.857-.105.992-.512.33-1.021.12-2.178-.646-3.035l.03.045zm2.418-2.195c-1.576-1.757-3.905-2.419-6.054-1.968-.496.104-.812.587-.706 1.081.104.496.586.813 1.082.707 1.532-.331 3.185.15 4.296 1.383 1.112 1.246 1.429 2.943.947 4.416-.165.48.106 1.007.586 1.157.479.165.991-.104 1.157-.586.675-2.088.241-4.478-1.338-6.235l.03.045z',
  wechat: 'M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z',
} as const;

const SHARE_TARGETS: Record<ShareTarget, {
  label: string;
  brandClass: string;
  icon: React.ReactNode;
}> = {
  linkedin: { label: 'LinkedIn', brandClass: 'hover:text-[#0A66C2]', icon: <Linkedin /> },
  x: { label: 'X', brandClass: 'hover:text-black dark:hover:text-white', icon: <BrandGlyph path={BRAND_PATHS.x} /> },
  reddit: { label: 'Reddit', brandClass: 'hover:text-[#FF4500]', icon: <BrandGlyph path={BRAND_PATHS.reddit} /> },
  zhihu: { label: 'Zhihu', brandClass: 'hover:text-[#0084FF]', icon: <BrandGlyph path={BRAND_PATHS.zhihu} /> },
  weibo: { label: 'Weibo', brandClass: 'hover:text-[#E6162D]', icon: <BrandGlyph path={BRAND_PATHS.weibo} /> },
  wechat: { label: 'WeChat', brandClass: 'hover:text-[#07C160]', icon: <BrandGlyph path={BRAND_PATHS.wechat} /> },
};

function BrandGlyph({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d={path} />
    </svg>
  );
}

const readableViewCount = (count: number, language: 'en' | 'zh'): string =>
  language === 'zh' ? `${count.toLocaleString()} 次阅读` : `${count.toLocaleString()} reads`;

const ShareButton: React.FC<{
  target: ShareTarget;
  onClick?: () => void;
}> = ({ target, onClick }) => {
  const platform = SHARE_TARGETS[target];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full',
        'text-ds-fg-subtle transition-colors [&_svg]:size-4',
        platform.brandClass,
      )}
      aria-label={`Share to ${platform.label}`}
      title={platform.label}
    >
      {platform.icon}
    </button>
  );
};

const ArticleMeta: React.FC<ArticleMetaProps> = ({
  contributors,
  publishedAt,
  viewCount,
  ipRegion,
  shareTargets = ['linkedin', 'x', 'reddit', 'zhihu', 'weibo', 'wechat'],
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

  const openShareWindow = (destination: URL) => {
    window.open(destination.toString(), '_blank', 'noopener,noreferrer,width=720,height=560');
  };

  const handleShare = async (target: ShareTarget) => {
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
        openShareWindow(destination);
        setShareFeedback(language === 'zh' ? '已打开微博分享' : 'Weibo share opened');
      } else if (target === 'linkedin') {
        const destination = new URL('https://www.linkedin.com/sharing/share-offsite/');
        destination.searchParams.set('url', url);
        openShareWindow(destination);
        setShareFeedback(language === 'zh' ? '已打开 LinkedIn 分享' : 'LinkedIn share opened');
      } else if (target === 'x') {
        const destination = new URL('https://twitter.com/intent/tweet');
        destination.searchParams.set('url', url);
        destination.searchParams.set('text', title);
        openShareWindow(destination);
        setShareFeedback(language === 'zh' ? '已打开 X 分享' : 'X share opened');
      } else if (target === 'reddit') {
        const destination = new URL('https://www.reddit.com/submit');
        destination.searchParams.set('url', url);
        destination.searchParams.set('title', title);
        openShareWindow(destination);
        setShareFeedback(language === 'zh' ? '已打开 Reddit 分享' : 'Reddit share opened');
      } else if (target === 'zhihu') {
        await copyLink(url);
        setShareFeedback(language === 'zh' ? '链接已复制，可粘贴到知乎' : 'Link copied for Zhihu');
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
          <MetaItem icon={<LogoMark size={22} />}>
            <span className="max-w-[280px] truncate">{contributors.join(', ')}</span>
          </MetaItem>
        )}
        {publishedAt && (
          <MetaItem icon={<Clock />}>{publishedAt}</MetaItem>
        )}
        {typeof viewCount === 'number' && (
          <MetaItem icon={<BookOpen />}>{readableViewCount(viewCount, language)}</MetaItem>
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
