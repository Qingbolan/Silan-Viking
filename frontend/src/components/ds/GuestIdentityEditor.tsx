import React, { useEffect, useState } from 'react';
import { Check, LoaderCircle, LogIn, Pencil, UserCheck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../LanguageContext';
import { dsRoot } from './dsAttr';

export interface GuestIdentityEditorProps {
  name: string;
  onChange: (name: string) => void;
  signedInName?: string;
  signedInAvatar?: string;
  onUseSignedIn?: () => void | Promise<void>;
  useSignedInPending?: boolean;
  onSignIn?: () => void | Promise<void>;
  signInPending?: boolean;
  className?: string;
}

// A compact editor for the site-wide guest display name. Storage and geo
// enrichment stay in useCommenterIdentity; this component only owns the
// transient edit state.
export const GuestIdentityEditor: React.FC<GuestIdentityEditorProps> = ({
  name,
  onChange,
  signedInName,
  signedInAvatar,
  onUseSignedIn,
  useSignedInPending = false,
  onSignIn,
  signInPending = false,
  className,
}) => {
  const { language } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const signedInInitial = signedInName?.trim().charAt(0).toUpperCase() || '?';

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [editing, name]);

  const commit = () => {
    onChange(draft);
    setEditing(false);
  };

  return (
    <div className={cn('flex min-w-0 items-center gap-1.5 text-ds-xs text-ds-fg-subtle', className)}>
      <span className="shrink-0">{language === 'zh' ? '访客身份' : 'Guest identity'}</span>
      {editing ? (
        <>
          <input
            {...dsRoot}
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit();
              }
              if (event.key === 'Escape') {
                setDraft(name);
                setEditing(false);
              }
            }}
            maxLength={100}
            aria-label={language === 'zh' ? '编辑访客名称' : 'Edit guest name'}
            className="h-7 min-w-0 max-w-72 flex-1 rounded-ds-sm border border-ds-border bg-ds-surface-1 px-2 font-mono text-ds-xs text-ds-fg outline-none focus:border-ds-primary"
          />
          <Check className="size-3.5 shrink-0 text-ds-primary" aria-hidden />
        </>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex min-w-0 items-center gap-1 rounded-ds-sm px-1.5 py-0.5 font-mono text-ds-fg-muted transition-colors hover:bg-ds-surface-3 hover:text-ds-fg"
        >
          <span className="truncate">{name}</span>
          <Pencil className="size-3 shrink-0" aria-hidden />
        </button>
      )}
      {signedInName && onUseSignedIn && (
        <button
          type="button"
          onClick={() => { void onUseSignedIn(); }}
          disabled={useSignedInPending}
          className="ml-1 inline-flex max-w-56 items-center gap-1.5 rounded-ds-sm border border-ds-border bg-ds-surface-1 px-2 py-1 text-ds-xs font-medium text-ds-fg-muted transition-colors hover:border-ds-primary/45 hover:text-ds-fg disabled:cursor-wait disabled:opacity-60"
        >
          {signedInAvatar ? (
            <img src={signedInAvatar} alt="" className="size-4 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-ds-primary-soft text-[9px] font-semibold text-ds-primary">
              {signedInInitial}
            </span>
          )}
          <span className="min-w-0 truncate">
            {language === 'zh' ? `用 ${signedInName} 发言` : `Use ${signedInName}`}
          </span>
          {useSignedInPending
            ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden />
            : <UserCheck className="size-3.5 shrink-0" aria-hidden />}
        </button>
      )}
      {!signedInName && onSignIn && (
        <button
          type="button"
          onClick={() => { void onSignIn(); }}
          disabled={signInPending}
          className="ml-1 inline-flex items-center gap-1.5 rounded-ds-sm border border-ds-border bg-ds-surface-1 px-2 py-1 text-ds-xs font-medium text-ds-fg-muted transition-colors hover:border-ds-primary/45 hover:text-ds-fg disabled:cursor-wait disabled:opacity-60"
        >
          {signInPending
            ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden />
            : <LogIn className="size-3.5 shrink-0" aria-hidden />}
          {language === 'zh' ? '登录发言' : 'Sign in'}
        </button>
      )}
    </div>
  );
};
