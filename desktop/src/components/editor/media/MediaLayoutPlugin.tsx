import { printMediaDocument } from './MediaPrint';
import { registerMediaFloatProjection } from './MediaFloatProjection';
import { MediaGuide, loadMediaGuide } from './MediaGuide';
import { useMediaText } from './MediaMessages';
import type { MediaWorkspacePort, MediaCleanupEntry } from './MediaWorkspace';
import React from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $getSelection, $isRangeSelection, $setSelection, COMMAND_PRIORITY_EDITOR, HISTORY_PUSH_TAG, mergeRegister } from 'lexical';
import { $generateNodesFromMarkdownString } from '@lexical/mdast';
import { $canWrapSelectedBlocks, $wrapSelectedBlocks, OPEN_MEDIA_GUIDE, OPEN_MEDIA_SETTINGS, REVIEW_UNWRAP_MEDIA, WRAP_MEDIA_SELECTION } from './MediaLayoutCommands';
import { readMediaSettings, saveMediaSettings } from './MediaLayoutSettings';
import type { MarkdownImageImporter } from '../extensionPoints';
import { MediaLayoutNode } from './MediaLayoutNode';

export function MediaLayoutPlugin({ disabled, onImportImages, workspace }: { disabled: boolean; onImportImages?: MarkdownImageImporter; workspace?: MediaWorkspacePort }) {
  const t = useMediaText();
  const [editor] = useLexicalComposerContext();
  const [panel, setPanel] = React.useState<'settings' | 'guide' | 'unwrap' | 'workspace-cleanup' | null>(null);
  const [settings, setSettings] = React.useState(readMediaSettings);
  const [menu, setMenu] = React.useState<{ x: number; y: number; state: ReturnType<typeof editor.getEditorState>; selection: ReturnType<typeof $getSelection> } | null>(null);
  const [notice, setNotice] = React.useState('');
  const [cleanup, setCleanup] = React.useState<MediaCleanupEntry[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [unwrap, setUnwrap] = React.useState<{ key: string; source: string }[]>([]);
  React.useEffect(() => registerMediaFloatProjection(editor), [editor]);
  React.useEffect(() => {
    if (disabled) return;
    return mergeRegister(
      editor.registerCommand(WRAP_MEDIA_SELECTION, () => $wrapSelectedBlocks(), COMMAND_PRIORITY_EDITOR),
      editor.registerCommand(OPEN_MEDIA_SETTINGS, () => { setSettings(readMediaSettings()); setPanel('settings'); return true; }, COMMAND_PRIORITY_EDITOR),
      editor.registerCommand(OPEN_MEDIA_GUIDE, () => { setPanel('guide'); return true; }, COMMAND_PRIORITY_EDITOR),
      editor.registerCommand(REVIEW_UNWRAP_MEDIA, () => {
        setUnwrap($getRoot().getChildren().filter((node): node is MediaLayoutNode => node instanceof MediaLayoutNode && node.getDocument().editable).map((node) => ({ key: node.getKey(), source: node.getSource() })));
        setPanel('unwrap'); return true;
      }, COMMAND_PRIORITY_EDITOR),
      editor.registerRootListener((root, previous) => {
        const host = (element: HTMLElement | null, add: boolean) => {
          if (add) { element?.addEventListener('contextmenu', contextMenu); element?.addEventListener('keydown', hotkey); }
          else { element?.removeEventListener('contextmenu', contextMenu); element?.removeEventListener('keydown', hotkey); }
        };
        host(previous, false); host(root, true);
      }),
    );
    function contextMenu(event: MouseEvent) {
      if ((event.target as Element)?.closest('[data-image-node], [data-layout-key]')) return;
      const selection = editor.read(() => { const value = $getSelection(); return $isRangeSelection(value) && !value.isCollapsed() ? value.clone() : null; });
      if (!selection || !editor.read($canWrapSelectedBlocks)) return;
      event.preventDefault(); event.stopPropagation(); setMenu({ x: event.clientX, y: event.clientY, state: editor.getEditorState(), selection });
    }
    function hotkey(event: KeyboardEvent) {
      const shortcut = readMediaSettings().wrapShortcut;
      if (!shortcut || !(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== shortcut.toLowerCase()) return;
      event.preventDefault(); editor.update(() => $wrapSelectedBlocks(), { tag: HISTORY_PUSH_TAG });
    }
  }, [disabled, editor]);
  const createExample = async () => {
    if (!onImportImages) { setNotice('此文档尚未提供媒体导入，请先保存文档。'); return; }
    const state = editor.getEditorState();
    try {
      const guide = await loadMediaGuide();
      const files = guide.assets.map(asset => new File([Uint8Array.from(atob(asset.base64), char => char.charCodeAt(0))], asset.name, { type: asset.type }));
      const imported = await onImportImages(files);
      if (imported.length !== files.length) { setNotice('示例媒体已排队；保存文档后再创建示例。'); return; }
      if (editor.getEditorState() !== state) { setNotice('文档已变化，未插入示例。请再次执行。'); return; }
      const language = readMediaSettings().uiLanguage;
      let source = language === 'zh' || (language === 'auto' && navigator.language.startsWith('zh')) ? guide.zh : guide.en;
      guide.assets.forEach((asset, index) => { source = source.split(`./assets/${asset.name}`).join(imported[index].src); });
      editor.update(() => $getRoot().append(...$generateNodesFromMarkdownString(source)), { discrete: true, tag: HISTORY_PUSH_TAG });
      setPanel(null);
    } catch (reason) { setNotice(String(reason)); }
  };
  const close = () => { setPanel(null); setMenu(null); };
  React.useEffect(() => { if (!menu) return; const dismiss = () => setMenu(null); window.addEventListener('pointerdown', dismiss); return () => window.removeEventListener('pointerdown', dismiss); }, [menu]);
  return <>
    {menu && createPortal(<div className="image-layout-context-menu" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 80) }} onPointerDown={(event) => event.stopPropagation()}>
      <button role="menuitem" onClick={() => {
        if (editor.getEditorState() === menu.state) editor.update(() => { $setSelection(menu.selection); $wrapSelectedBlocks(); }, { discrete: true, tag: HISTORY_PUSH_TAG });
        setMenu(null);
      }}>{t('将选区转换为布局')}</button></div>, document.body)}
    {panel && createPortal(<div className="vml-modal-backdrop" onClick={close}><section className="vml-modal" role="dialog" aria-modal="true" aria-label="Adjustable Media" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') close(); }}>
      <button className="vml-modal-close" onClick={close}>{t('关闭')}</button>
      <h2>{t(panel === 'settings' ? '图片与图文布局设置' : panel === 'guide' ? 'Adjustable Media 功能示例' : panel === 'workspace-cleanup' ? '移除工作空间全部布局…' : '移除当前文档全部布局')}</h2>
      {panel === 'settings' && <>
        <label><input type="checkbox" checked={settings.autoConvert} onChange={(event) => { const next = { ...settings, autoConvert: event.target.checked }; setSettings(next); saveMediaSettings(next); }} />{t('粘贴或导入多个媒体时自动创建布局')}</label>
        <label>{t('界面语言')}<select value={settings.uiLanguage} onChange={(event) => { const next = { ...settings, uiLanguage: event.target.value as typeof settings.uiLanguage }; setSettings(next); saveMediaSettings(next); }}><option value="auto">{t('自动')}</option><option value="zh">{t('中文')}</option><option value="en">English</option></select></label>
        <label>{t('图表公式编号语言')}<select value={settings.refLanguage} onChange={(event) => { const next = { ...settings, refLanguage: event.target.value as typeof settings.refLanguage }; setSettings(next); saveMediaSettings(next); }}><option value="auto">{t('自动')}</option><option value="zh">{t('中文')}</option><option value="en">English</option></select></label>
        <label>{t('选区转布局快捷键：⌘/Ctrl + Shift +')}<input maxLength={1} value={settings.wrapShortcut} onChange={(event) => { const next = { ...settings, wrapShortcut: event.target.value }; setSettings(next); saveMediaSettings(next); }} /></label>
        <button onClick={() => { setPanel(null); void printMediaDocument(editor).catch(error => setNotice(String(error))); }}>{t('打印 / 导出 PDF')}</button>
        <button onClick={() => setPanel('guide')}>{t('查看功能示例')}</button>
        <button onClick={() => editor.dispatchCommand(REVIEW_UNWRAP_MEDIA, undefined)}>{t('移除当前文档全部布局…')}</button>
        {workspace && <button disabled={busy} onClick={() => {
          setBusy(true); setNotice('');
          void workspace.previewCleanup().then(entries => { setCleanup(entries); setPanel('workspace-cleanup'); }).catch(error => setNotice(String(error))).finally(() => setBusy(false));
        }}>{t('移除工作空间全部布局…')}</button>}
        {notice && <p role="status">{notice}</p>}
      </>}
      {panel === 'guide' && <><p>{t('拖动图片手柄可在行间或布局间移动。拖动单图本身可水平定位并吸附；拖动分隔线、行底边、外框和角点可调整尺寸。右键添加文字栏、设置环绕、说明和文字样式。双击图片打开查看器。')}</p><MediaGuide /><button onClick={() => void createExample()}>{t('在文末创建可编辑示例')}</button>{notice && <p role="status">{notice}</p>}</>}
      {panel === 'workspace-cleanup' && <>
        <p>将移除以下 {cleanup.length} 篇文档的布局注释。未保存的文档已跳过。图片与文字保持原样；提交后可通过工作空间版本历史恢复。</p>
        <ul>{cleanup.map(entry => <li key={entry.id}>{entry.path} · {entry.count} 个布局</li>)}</ul>
        <button disabled={busy || !cleanup.length} onClick={() => {
          if (!workspace) return;
          setBusy(true);
          void workspace.applyCleanup(cleanup).then(result => { setNotice(`已修改 ${result.applied.length} 篇；跳过 ${result.skipped.length} 篇发生变化的文档。`); setCleanup([]); }).catch(error => setNotice(String(error))).finally(() => setBusy(false));
        }}>{t('确认修改上述文档')}</button>
        {notice && <p role="status">{notice}</p>}
      </>}
      {panel === 'unwrap' && <><p>将移除 {unwrap.length} 个布局的注释，图片和文字保留。可撤销。</p><ol>{unwrap.map((item) => <li key={item.key}><code>{item.source.split('\n')[1]?.slice(0, 100)}</code></li>)}</ol><button onClick={() => {
        editor.update(() => {
          const nodes = $getRoot().getChildren().filter((node): node is MediaLayoutNode => node instanceof MediaLayoutNode);
          if (unwrap.some((item) => !nodes.some((node) => node.getKey() === item.key && node.getSource() === item.source))) return;
          for (const item of unwrap) {
            const node = nodes.find((entry) => entry.getKey() === item.key)!;
            for (const replacement of $generateNodesFromMarkdownString(item.source.split('\n').slice(1, -1).join('\n'))) node.insertBefore(replacement);
            node.remove();
          }
        }, { discrete: true, tag: HISTORY_PUSH_TAG }); close();
      }}>{t('确认移除上述布局')}</button></>}
    </section></div>, document.body)}
  </>;
}
