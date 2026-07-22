import React from 'react';
import { User } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { publicAssetUrl } from '../../../utils/publicAsset';

const SITE_AUTHOR_NAMES = new Set([
  'silan hu',
  'hu silan',
  'silan.hu',
  '胡思蓝',
]);

const normalizeAuthorName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export const isSiteAuthor = (name?: string): boolean =>
  Boolean(name && SITE_AUTHOR_NAMES.has(normalizeAuthorName(name)));

interface AuthorBylineProps {
  name: string;
  className?: string;
  avatarClassName?: string;
}

const AuthorByline: React.FC<AuthorBylineProps> = ({
  name,
  className,
  avatarClassName,
}) => {
  const siteAuthor = isSiteAuthor(name);

  return (
    <span className={cn('inline-flex items-center gap-2 text-ds-fg', className)}>
      {siteAuthor ? (
        <img
          src={publicAssetUrl('/image.png')}
          alt=""
          className={cn(
            'size-5 shrink-0 rounded-full object-cover ring-1 ring-ds-border',
            avatarClassName,
          )}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <User className={cn('size-4 shrink-0 text-ds-fg-subtle', avatarClassName)} aria-hidden />
      )}
      <span>{name}</span>
    </span>
  );
};

export default AuthorByline;
