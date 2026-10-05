import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { Copy, Scissors, Clipboard, FolderPlus, FolderInput, Lock, PencilLine } from 'lucide-react';
import type { ContentGroup, EpisodeSeries } from '../types';
export type LibrarySeriesSource = {
    slug: string;
    title: string;
    description: string;
    cover_url: string;
};
type Operation = {
    operation: 'create_series';
    title: string;
} | {
    operation: 'transfer';
    document_id: string;
    series: string | null;
    copy: boolean;
} | {
    operation: 'import_markdown';
    name: string;
    markdown: string;
    series: string;
};
const MIME = 'application/x-silan-content';
type Props = {
    enabled: boolean;
    children: ReactNode;
    groups: ContentGroup[];
    series: EpisodeSeries[];
    selectedSeries: EpisodeSeries | null;
    dirty: boolean;
    onRefresh: () => Promise<unknown>;
    onPrivate: (group: ContentGroup) => void;
    onOpen: (group: ContentGroup) => void;
};
export function ContentLibrary({ enabled, children, groups, series, selectedSeries, dirty, onRefresh, onPrivate, onOpen }: Props) {
    const [menu, setMenu] = useState<{
        x: number;
        y: number;
        group?: ContentGroup;
    } | null>(null);
    const [clipboard, setClipboard] = useState<{
        id: string;
        copy: boolean;
    } | null>(null);
    const [dialog, setDialog] = useState<{
        type: 'create';
    } | {
        type: 'move';
        group: ContentGroup;
    } | null>(null);
    const [title, setTitle] = useState('');
    const [destination, setDestination] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [dropTarget, setDropTarget] = useState('');
    const [selected, setSelected] = useState<ContentGroup | null>(null);
    const active = useRef(false);
    const root = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const findGroup = (target: EventTarget | null) => groups.find(g => g.id === (target as HTMLElement)?.closest<HTMLElement>('[data-library-id]')?.dataset.libraryId);
    const targetSeries = (target: EventTarget | null) => (target as HTMLElement)?.closest<HTMLElement>('[data-series-target]')?.dataset.seriesTarget || selectedSeries?.slug || null;
    const execute = async (operations: Operation[]) => {
        if (active.current)
            return false;
        if (dirty) {
            setError('请先保存正在编辑的内容');
            return false;
        }
        active.current = true;
        setBusy(true);
        setError('');
        setMenu(null);
        try {
            for (const operation of operations)
                await invoke('operate_content_library', { operation });
            setDialog(null);
            await onRefresh();
            return true;
        }
        catch (reason) {
            setError(String(reason));
            await onRefresh().catch(() => { });
            return false;
        }
        finally {
            active.current = false;
            setBusy(false);
        }
    };
    const paste = (target: string | null) => {
        if (!clipboard)
            return;
        void execute([{ operation: 'transfer', document_id: clipboard.id, series: target, copy: clipboard.copy }]).then(ok => { if (ok && !clipboard.copy)
            setClipboard(null); });
    };
    const nativeDrop = useRef<(paths: string[], target: Element | null) => void>(() => { });
    nativeDrop.current = (paths, target) => {
        const series = targetSeries(target);
        if (!series || !root.current?.contains(target))
            return;
        if (paths.some(path => !path.toLowerCase().endsWith('.md'))) {
            setError('请拖入 Markdown 文件');
            return;
        }
        void Promise.all(paths.map(async (path) => {
            const bytes = await invoke<ArrayBuffer>('read_capture_attachment', { path });
            return { operation: 'import_markdown' as const, series, name: path.split(/[\\/]/).pop() || 'note.md', markdown: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
        })).then(execute).catch(reason => setError(String(reason)));
    };
    useEffect(() => {
        if (!enabled || !isTauri())
            return;
        let disposed = false;
        let unlisten: (() => void) | undefined;
        void getCurrentWebview().onDragDropEvent(({ payload }) => {
            if (payload.type === 'leave') {
                setDropTarget('');
                return;
            }
            const target = document.elementFromPoint(payload.position.x / window.devicePixelRatio, payload.position.y / window.devicePixelRatio);
            if (payload.type === 'drop') {
                setDropTarget('');
                nativeDrop.current(payload.paths, target);
            }
            else
                setDropTarget(root.current?.contains(target) ? target?.closest<HTMLElement>('[data-series-target]')?.dataset.seriesTarget || '' : '');
        }).then(stop => { if (disposed)
            stop();
        else
            unlisten = stop; }).catch(reason => setError(String(reason)));
        return () => { disposed = true; unlisten?.(); };
    }, [enabled]);
    useEffect(() => {
        if (!menu)
            return;
        menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
        const close = () => setMenu(null);
        const key = (event: KeyboardEvent) => { if (event.key === 'Escape')
            close(); };
        window.addEventListener('pointerdown', close);
        window.addEventListener('resize', close);
        window.addEventListener('scroll', close, true);
        window.addEventListener('keydown', key);
        return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', key); };
    }, [menu]);
    const transferable = menu?.group && menu.group.cardKind !== 'series' && ['blog', 'episode'].includes(menu.group.kind);
    return <div ref={root} className="content-library" tabIndex={0} onClick={event => setSelected(findGroup(event.target) || null)} onKeyDown={event => {
            if (!enabled || !(event.metaKey || event.ctrlKey) || (event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]'))
                return;
            if (['c', 'x'].includes(event.key.toLowerCase()) && selected && selected.cardKind !== 'series') {
                event.preventDefault();
                setClipboard({ id: selected.documents[0].id, copy: event.key.toLowerCase() === 'c' });
            }
            if (event.key.toLowerCase() === 'v' && clipboard) {
                event.preventDefault();
                paste(selected?.cardKind === 'series' ? selected.slug : selectedSeries?.slug || null);
            }
        }} aria-busy={busy} data-drop-series={dropTarget} onContextMenu={event => {
            if (!enabled)
                return;
            if ((event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]'))
                return;
            event.preventDefault();
            setMenu({ x: Math.min(event.clientX, window.innerWidth - 232), y: Math.min(event.clientY, window.innerHeight - 330), group: findGroup(event.target) });
        }} onDragStart={event => { const group = findGroup(event.target); if (!group || group.cardKind === 'series')
        return; event.dataTransfer.setData(MIME, group.documents[0]?.id || ''); event.dataTransfer.effectAllowed = 'copyMove'; }} onDragOver={event => { if (!enabled)
        return; const target = targetSeries(event.target); if (target && (event.dataTransfer.types.includes(MIME) || event.dataTransfer.types.includes('Files'))) {
        event.preventDefault();
        event.dataTransfer.dropEffect = event.altKey ? 'copy' : 'move';
        setDropTarget(target);
    } }} onDragLeave={event => { if (!root.current?.contains(event.relatedTarget as Node))
        setDropTarget(''); }} onDrop={event => {
            if (!enabled)
                return;
            const target = targetSeries(event.target);
            setDropTarget('');
            if (!target)
                return;
            event.preventDefault();
            const id = event.dataTransfer.getData(MIME);
            if (id) {
                void execute([{ operation: 'transfer', document_id: id, series: target, copy: event.altKey }]);
                return;
            }
            const files = Array.from(event.dataTransfer.files);
            if (files.some(file => !file.name.toLowerCase().endsWith('.md'))) {
                setError('请拖入 Markdown 文件');
                return;
            }
            void Promise.all(files.map(async (file) => ({ operation: 'import_markdown' as const, name: file.name, markdown: await file.text(), series: target }))).then(execute).catch(reason => setError(String(reason)));
        }}>
    {error && <p className="library-error" role="status">{error}<button type="button" onClick={() => setError('')}>关闭</button></p>}
    {busy && <p className="library-status" role="status">正在保存…</p>}
    {children}
    {menu && createPortal(<div ref={menuRef} role="menu" className="library-context-menu" style={{ left: menu.x, top: Math.max(8, menu.y) }} onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
                if (!['ArrowDown', 'ArrowUp'].includes(event.key))
                    return;
                event.preventDefault();
                const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
                const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
            }}>
      {menu.group && <button role="menuitem" onClick={() => { onOpen(menu.group!); setMenu(null); }}><PencilLine size={16}/>打开</button>}
      {transferable && <><button role="menuitem" onClick={() => { setClipboard({ id: menu.group!.documents[0].id, copy: true }); setMenu(null); root.current?.focus(); }}><Copy size={16}/>复制</button><button role="menuitem" onClick={() => { setClipboard({ id: menu.group!.documents[0].id, copy: false }); setMenu(null); root.current?.focus(); }}><Scissors size={16}/>剪切</button><button role="menuitem" onClick={() => { setDialog({ type: 'move', group: menu.group! }); setDestination(selectedSeries?.slug || ''); setMenu(null); }}><FolderInput size={16}/>移动到…</button></>}
      {(!menu.group || menu.group.cardKind === 'series') && <button role="menuitem" disabled={!clipboard || busy} onClick={() => paste(menu.group?.cardKind === 'series' ? menu.group.slug : selectedSeries?.slug || null)}><Clipboard size={16}/>粘贴</button>}
      {menu.group && <button role="menuitem" disabled={busy || dirty || menu.group.visibility.toLowerCase() === 'private'} onClick={() => { onPrivate(menu.group!); setMenu(null); }}><Lock size={16}/>设为私密</button>}
      <button role="menuitem" disabled={busy} onClick={() => { setTitle(''); setDialog({ type: 'create' }); setMenu(null); }}><FolderPlus size={16}/>新建系列</button>
    </div>, document.body)}
    {dialog && createPortal(<div className="library-dialog-scrim" onClick={() => { if (!busy)
            setDialog(null); }}><form className="library-dialog" role="dialog" aria-modal="true" aria-label={dialog.type === 'create' ? '新建系列' : '移动到'} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape' && !busy)
            setDialog(null); if (e.key === 'Tab') {
            const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input,select,button:not(:disabled)'));
            const first = controls[0], last = controls[controls.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        } }} onSubmit={event => { event.preventDefault(); void execute([dialog.type === 'create' ? { operation: 'create_series', title } : { operation: 'transfer', document_id: dialog.group.documents[0].id, series: destination || null, copy: false }]); }}>
      <h2>{dialog.type === 'create' ? '新建系列' : '移动到'}</h2>
      {dialog.type === 'create' ? <input autoFocus aria-label="系列名称" required value={title} onChange={e => setTitle(e.target.value)} placeholder="系列名称"/> : <select autoFocus aria-label="目标系列" value={destination} onChange={e => setDestination(e.target.value)}><option value="">独立文章</option>{series.map(s => <option key={s.slug} value={s.slug}>{s.title}</option>)}</select>}
      <div><button type="button" disabled={busy} onClick={() => setDialog(null)}>取消</button><button type="submit" disabled={busy}>{busy ? '保存中…' : dialog.type === 'create' ? '创建' : '移动'}</button></div>
    </form></div>, document.body)}
  </div>;
}
