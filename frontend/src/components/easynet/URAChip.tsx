import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import easyNetLogo from '../../assets/easynet-logo.webp';

/** Port of EasyNet Frontend/components/easynet-kit's URAChip presentation.
 * Only splits display segments; address resolution belongs to addressNavigation.
 */
export function URAChip({ ura, onSelect }: { ura: string; onSelect?: () => void }) {
  const parts = /^easynet:\/\/\/r\/([^/]+)\/([^/]+)\/(.*)$/.exec(ura);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const content = parts ? <>
    <span className="flex shrink-0 items-center gap-2 border-r border-ds-border bg-ds-surface-2 px-2 py-1.5 text-ds-fg-muted"><img src={easyNetLogo} alt="EasyNet" width={18} height={18} draggable={false} className="size-[18px] shrink-0 object-contain" />easynet:///r/</span>
    <span className="shrink-0 px-1 font-medium text-ds-fg">{parts[1]}</span>
    <span className="shrink-0 text-ds-fg-muted">/</span>
    <span className="shrink-0 px-1 text-ds-fg-muted">{parts[2]}</span>
    <span className="shrink-0 text-ds-fg-muted">/</span>
    <span className="shrink-0 px-1 text-ds-fg">{parts[3]}</span>
  </> : <span className="px-2 py-1.5">{ura}</span>;
  return <span className="inline-flex min-w-0 max-w-full items-stretch overflow-hidden rounded-md border border-ds-border font-mono text-ds-xs" title={ura}>
    <button type="button" onClick={onSelect} aria-label={ura} className="flex min-w-0 items-center overflow-x-auto whitespace-nowrap text-left [scrollbar-width:thin]">{content}</button>
    <button type="button" aria-label={copied ? 'Copied URA' : failed ? 'Copy failed, retry' : 'Copy URA'} title={copied ? 'Copied' : failed ? 'Copy failed, retry' : 'Copy URA'} className="shrink-0 border-l border-ds-border px-2 text-ds-fg-muted hover:bg-ds-surface-2" onClick={async () => {
      try {
        await navigator.clipboard.writeText(ura);
        setFailed(false);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1200);
      } catch { setFailed(true); }
    }}>{copied ? <Check className="size-3" /> : <Copy className="size-3" />}</button>
  </span>;
}
