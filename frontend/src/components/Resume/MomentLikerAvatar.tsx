import React, { useState } from 'react';
import { Globe2, UserRound } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { MomentLiker } from '../../api/moments/momentApi';

interface MomentLikerAvatarProps {
  liker: MomentLiker;
  language: 'en' | 'zh';
  showVisitorNumber?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const countryName = (code: string, language: 'en' | 'zh'): string => {
  try {
    return new Intl.DisplayNames([language === 'zh' ? 'zh-CN' : 'en'], {
      type: 'region',
    }).of(code) ?? code;
  } catch {
    return code;
  }
};

const MomentLikerAvatar: React.FC<MomentLikerAvatarProps> = ({
  liker,
  language,
  showVisitorNumber = true,
  size = 'md',
  className,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const countryCode = liker.country_code?.toUpperCase() ?? '';
  const isVisitor = liker.kind === 'visitor';
  const boxSize = size === 'sm' ? 'size-7' : 'size-8';
  const iconSize = size === 'sm' ? 'size-3.5' : 'size-4';
  const label = liker.label || (
    isVisitor
      ? countryCode
        ? language === 'zh'
          ? `来自${countryName(countryCode, language)}的访客 ${liker.visitor_number}`
          : `Visitor ${liker.visitor_number} from ${countryName(countryCode, language)}`
        : language === 'zh'
          ? `访客 ${liker.visitor_number}`
          : `Visitor ${liker.visitor_number}`
      : language === 'zh' ? '已登录用户' : 'Signed-in user'
  );

  return (
    <span
      className={cn('group relative inline-flex shrink-0', boxSize, className)}
      title={label}
      aria-label={label}
    >
      {isVisitor && countryCode && !imageFailed ? (
        <img
          src={`https://flagcdn.com/w80/${countryCode.toLowerCase()}.png`}
          alt=""
          className={cn(boxSize, 'rounded-[7px] border border-ds-border bg-white object-contain p-[1px] shadow-sm')}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : liker.avatar_url && !imageFailed ? (
        <img
          src={liker.avatar_url}
          alt=""
          className={cn(boxSize, 'rounded-[7px] border border-ds-border object-cover shadow-sm')}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className={cn(
          'flex items-center justify-center rounded-[7px] border border-ds-border bg-ds-surface-1 text-ds-fg-subtle shadow-sm',
          boxSize,
          isVisitor ? 'bg-ds-surface-2' : 'bg-ds-primary/10 text-ds-primary',
        )}>
          {isVisitor ? <Globe2 className={iconSize} /> : <UserRound className={iconSize} />}
        </span>
      )}

      {showVisitorNumber && isVisitor && liker.visitor_number && (
        <span className="absolute bottom-0 right-0 flex min-w-[16px] items-center justify-center rounded-[5px] border border-ds-surface-1 bg-ds-fg px-0.5 font-mono text-[8px] font-semibold leading-[12px] tabular-nums text-ds-surface-1 shadow-sm">
          {liker.visitor_number}
        </span>
      )}
    </span>
  );
};

export default MomentLikerAvatar;
