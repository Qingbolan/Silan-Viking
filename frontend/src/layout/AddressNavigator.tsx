import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { URAChip } from '../components/easynet/URAChip';
import { Modal } from '../components/ds';
import { resolveAddress, siteAddressUra } from '../lib/addressNavigation';

export default function AddressNavigator({ open, onClose, zh }: { open: boolean; onClose: () => void; zh: boolean }) {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const current = siteAddressUra(window.location.href);
  const target = resolveAddress(value, window.location.origin);
  const go = () => {
    if (!target) return;
    if (target.navigation === 'document') window.location.assign(target.href);
    else navigate(target.href);
    onClose();
  };
  return <Modal open={open} onClose={onClose} ariaLabel={zh ? '地址导航' : 'Navigate to address'} hideClose appearance="plain" size="lg">
    <form onSubmit={event => { event.preventDefault(); go(); }} className="space-y-4">
      <input autoFocus value={value} onChange={event => setValue(event.target.value)} aria-label={zh ? '网址或 EasyNet URA' : 'URL or EasyNet URA'} placeholder={zh ? '输入网址、站内路径或 easynet:/// URA' : 'Enter URL, site path or easynet:/// URA'} className="w-full bg-transparent py-2 text-ds-lg text-ds-fg outline-none" autoComplete="off" spellCheck={false} />
      {value && (target ? <button type="submit" className="flex w-full items-center gap-3 rounded-ds-md bg-ds-surface-2 p-3 text-left">
        {target.external ? <ExternalLink className="size-4 shrink-0" /> : <ArrowRight className="size-4 shrink-0" />}
        <span className="min-w-0"><span className="block text-ds-sm">{zh ? '前往' : 'Open'} {target.label}</span><span className="block break-all text-ds-xs text-ds-fg-muted">{target.href}</span></span>
      </button> : <p role="status" className="text-ds-sm text-ds-fg-muted">{zh ? '请输入有效网址、站内路径，或受支持的设备 / Agent / 能力 / 资源 URA。' : 'Enter a URL, site path, or supported device / agent / ability / resource URA.'}</p>)}
      <div className="flex items-center gap-2 border-t border-ds-border pt-3">
        <URAChip ura={current} onSelect={() => setValue(current)} />
      </div>
      <div className="flex flex-wrap gap-2 text-ds-sm">
        {[['Home', '/'], ['Moments', '/moments/'], ['Blog', '/blog/'], ['Projects', '/projects/']].map(([name, path]) => <button type="button" key={path} onClick={() => { navigate(path); onClose(); }} className="rounded-full bg-ds-surface-2 px-3 py-1.5">{name}</button>)}
        <a href="https://easynet.run/control_plane/devices" className="rounded-full bg-ds-surface-2 px-3 py-1.5">EasyNet ↗</a>
      </div>
    </form>
  </Modal>;
}
