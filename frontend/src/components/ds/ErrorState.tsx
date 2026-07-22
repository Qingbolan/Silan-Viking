// src/components/ds/ErrorState.tsx
//
// Branded error states, in three escalating sizes:
//
//   <ErrorState variant="inline" /> — a strip, for form / list-level errors
//   <ErrorState variant="card" />   — a panel, for a failed region
//   <ErrorState variant="page" />   — full block, for routes / boundaries;
//                                     carries the brand mark with a red slash
//
// Plus <ErrorBoundary> (catches render crashes → page error) and the
// NotFoundError / NetworkError presets.
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  RefreshCw,
  Home,
  ArrowLeft,
  WifiOff,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';
import { Button, buttonVariants } from './Button';
import { LogoMark } from './Logo';
import { NoiseBackground } from './NoiseBackground';

/** Pull a human string out of whatever was thrown. */
function extractMessage(error?: unknown): string | null {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/* --- ErrorMessage — the mono error block --------------------------------- */
//
// A copyable, wrapping error message. Clamps to 3 lines; if the content
// overflows, a "Show more" toggle expands it to at most 5 lines (then
// scrolls). Used by all three ErrorState variants.

const ErrorMessage: React.FC<{ message: string; className?: string }> = ({
  message,
  className,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [overflows, setOverflows] = React.useState(false);
  const textRef = React.useRef<HTMLPreElement>(null);

  // Detect whether the collapsed text actually overflows 3 lines, so the
  // toggle only appears when it's needed.
  React.useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight - el.clientHeight > 2);
  }, [message]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <div
      {...dsRoot}
      className={cn(
        'group relative mx-auto max-w-md overflow-hidden rounded-ds-sm border border-ds-border bg-ds-surface-2',
        className,
      )}
    >
      <pre
        ref={textRef}
        className={cn(
          'whitespace-pre-wrap break-words px-3 py-2 pr-9 text-left font-mono text-ds-2xs leading-relaxed text-ds-fg-muted',
          // Collapsed: clamp to 3 lines. Expanded: up to 5, then scroll.
          expanded
            ? 'max-h-[7.5em] overflow-y-auto'
            : 'line-clamp-3',
        )}
      >
        {message}
      </pre>

      {/* Copy button — top-right, always reachable. */}
      <button
        {...dsRoot}
        type="button"
        onClick={copy}
        aria-label={copied ? t('ds.error.copied') : t('ds.error.copy')}
        title={copied ? t('ds.error.copied') : t('ds.error.copy')}
        className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-ds-sm text-ds-fg-subtle transition-colors duration-ds-fast hover:bg-ds-surface-3 hover:text-ds-fg"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>

      {/* Show more / less — only when the text overflows when collapsed. */}
      {(overflows || expanded) && (
        <button
          {...dsRoot}
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-center justify-center gap-1 border-t border-ds-border py-1 text-ds-2xs font-medium text-ds-fg-muted transition-colors duration-ds-fast hover:bg-ds-surface-3 hover:text-ds-fg"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" /> {t('ds.error.showLess')}
            </>
          ) : (
            <>
              <ChevronDown className="size-3" /> {t('ds.error.showMore')}
            </>
          )}
        </button>
      )}
    </div>
  );
};

export interface ErrorStateProps {
  variant?: 'inline' | 'card' | 'page';
  title?: string;
  description?: string;
  /** The thrown error — its message is shown in a mono block. */
  error?: unknown;
  /** Retry handler — renders a "Try again" button. */
  onRetry?: () => void;
  /** Show a "Home" link (page variant). */
  showHome?: boolean;
  /** Extra action nodes, placed after the built-in buttons. */
  actions?: React.ReactNode;
  className?: string;
}

/* --- inline --------------------------------------------------------------- */

const InlineError: React.FC<ErrorStateProps> = ({
  title,
  description,
  error,
  onRetry,
  actions,
  className,
}) => {
  const { t } = useTranslation();
  const message = extractMessage(error);
  return (
    <div
      {...dsRoot}
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-ds-md border border-ds-error/25 bg-ds-error-soft px-3.5 py-2.5',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ds-error" />
      <div className="min-w-0 flex-1 text-ds-sm">
        {title && <div className="font-semibold leading-tight text-ds-fg">{title}</div>}
        {description && <div className="mt-0.5 text-ds-fg-muted">{description}</div>}
        {message && <ErrorMessage message={message} className="mt-1.5 max-w-none" />}
      </div>
      {(onRetry || actions) && (
        <div className="flex shrink-0 items-center gap-1">
          {onRetry && (
            <Button variant="ghost" size="sm" onClick={onRetry} leadingIcon={<RefreshCw />}>
              {t('ds.error.retry')}
            </Button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
};

/* --- card ----------------------------------------------------------------- */

const CardError: React.FC<ErrorStateProps> = ({
  title,
  description,
  error,
  onRetry,
  actions,
  className,
}) => {
  const { t } = useTranslation();
  const message = extractMessage(error);
  return (
    <div
      {...dsRoot}
      role="alert"
      className={cn(
        'relative overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface-1 p-6 text-center sm:p-8',
        className,
      )}
    >
      {/* Soft red halo behind the icon — a cue, not an alarm. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28"
        style={{
          background:
            'radial-gradient(ellipse 60% 90% at 50% 0%, var(--ds-color-error-soft), transparent 72%)',
        }}
      />
      <div className="relative">
        <div className="mb-4 inline-flex size-12 items-center justify-center rounded-full border border-ds-error/25 bg-ds-error-soft">
          <AlertTriangle className="size-6 text-ds-error" />
        </div>
        <h3 className="text-ds-lg font-semibold tracking-tight text-ds-fg">
          {title ?? t('ds.error.title')}
        </h3>
        {description && (
          <p className="mx-auto mt-2 max-w-md text-ds-sm leading-relaxed text-ds-fg-muted">
            {description}
          </p>
        )}
        {message && (
          <ErrorMessage message={message} className="mt-3" />
        )}
        {(onRetry || actions) && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {onRetry && (
              <Button size="sm" onClick={onRetry} leadingIcon={<RefreshCw />}>
                {t('ds.error.retry')}
              </Button>
            )}
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

/* --- page ----------------------------------------------------------------- */

const PageError: React.FC<ErrorStateProps> = ({
  title,
  description,
  error,
  onRetry,
  showHome = true,
  actions,
  className,
}) => {
  const { t } = useTranslation();
  const message = extractMessage(error);
  return (
    <div
      {...dsRoot}
      role="alert"
      className={cn(
        // Fill a full viewport-height route surface edge-to-edge. Footer is
        // rendered after route content in MainLayout, so this block must not
        // use a negative bottom margin or the footer enters the first screen.
        'relative flex min-h-dvh items-center justify-center overflow-hidden',
        '-mx-4 -mt-2 px-6 py-16 sm:-mx-6 lg:-mx-8',
        className,
      )}
    >
      <NoiseBackground glow="nus" intensity={0.05} />

      <div className="relative z-10 w-full max-w-md text-center">
        {/* Brand mark with a decorative red slash — communicates "error"
            without abandoning brand identity. The slash is aria-hidden. */}
        <div className="relative mb-6 inline-block">
          <LogoMark size={64} />
          <span aria-hidden className="absolute inset-0 flex items-center justify-center">
            <span className="block h-[74px] w-[3px] rotate-45 rounded-full bg-ds-error/75" />
          </span>
        </div>

        {/* Apologetic eyebrow above the title. */}
        <div className="mb-1.5 text-ds-xs font-medium uppercase tracking-[0.12em] text-ds-primary">
          {t('ds.error.sorry')}
        </div>
        <h1 className="text-ds-3xl font-semibold tracking-tight text-ds-fg">
          {title ?? t('ds.error.title')}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-ds-base leading-relaxed text-ds-fg-muted">
          {description ?? t('ds.error.description')}
        </p>

        {message && (
          <ErrorMessage message={message} className="mt-5" />
        )}

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          {onRetry && (
            <Button onClick={onRetry} leadingIcon={<RefreshCw />}>
              {t('ds.error.retry')}
            </Button>
          )}
          {showHome && (
            // Button renders a <button>; for navigation we style a Link
            // with the same variant classes instead.
            <Link
              {...dsRoot}
              to="/"
              className={cn(buttonVariants({ variant: 'outline', size: 'md' }))}
            >
              <Home className="size-[1.05em]" />
              {t('ds.error.home')}
            </Link>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
};

/* --- public ErrorState ---------------------------------------------------- */

export const ErrorState: React.FC<ErrorStateProps> = ({ variant = 'card', ...props }) => {
  if (variant === 'inline') return <InlineError {...props} />;
  if (variant === 'page') return <PageError {...props} />;
  return <CardError {...props} />;
};

/* --- presets -------------------------------------------------------------- */

/** Full-page 404. */
export const NotFoundError: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { t } = useTranslation();
  return (
    <PageError
      title={t('ds.error.notFoundTitle')}
      description={t('ds.error.notFoundDescription')}
      actions={
        onBack ? (
          <Button variant="ghost" onClick={onBack} leadingIcon={<ArrowLeft />}>
            {t('ds.error.goBack')}
          </Button>
        ) : null
      }
    />
  );
};

/** Card-level network failure. */
export const NetworkError: React.FC<{ onRetry?: () => void; error?: unknown }> = ({
  onRetry,
  error,
}) => {
  const { t } = useTranslation();
  return (
    <div {...dsRoot} role="alert" className="relative overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface-1 p-6 text-center sm:p-8">
      <div className="mb-4 inline-flex size-12 items-center justify-center rounded-full border border-ds-error/25 bg-ds-error-soft">
        <WifiOff className="size-6 text-ds-error" />
      </div>
      <h3 className="text-ds-lg font-semibold tracking-tight text-ds-fg">
        {t('ds.error.networkTitle')}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-ds-sm leading-relaxed text-ds-fg-muted">
        {t('ds.error.networkDescription')}
      </p>
      {extractMessage(error) && (
        <ErrorMessage message={extractMessage(error)!} className="mt-3" />
      )}
      {onRetry && (
        <div className="mt-5">
          <Button size="sm" onClick={onRetry} leadingIcon={<RefreshCw />}>
            {t('ds.error.retry')}
          </Button>
        </div>
      )}
    </div>
  );
};

/* --- ErrorBoundary -------------------------------------------------------- */

interface BoundaryProps {
  children: React.ReactNode;
  /** Custom fallback; receives the error and a reset callback. */
  fallback?: (_error: Error, _reset: () => void) => React.ReactNode;
}
interface BoundaryState {
  error: Error | null;
}

/**
 * Catches render-time crashes in its subtree and shows the branded page
 * error instead of a blank screen. Wrap the app (or a risky route) in it.
 */
export class ErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep the original stack visible in devtools even though the
    // fallback UI replaces the crashed subtree.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      // A class component can't call useTranslation; the functional
      // CrashFallback does, so the default fallback stays localised.
      return <CrashFallback error={error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

/** Localised default fallback for ErrorBoundary. */
const CrashFallback: React.FC<{ error: Error; onReset: () => void }> = ({
  error,
  onReset,
}) => {
  const { t } = useTranslation();
  return (
    <PageError
      title={t('ds.error.crashTitle')}
      description={t('ds.error.crashDescription')}
      error={error}
      onRetry={onReset}
    />
  );
};
