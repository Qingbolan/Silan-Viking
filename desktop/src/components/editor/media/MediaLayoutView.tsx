import { MediaColumnDragContext } from './MediaColumnDragContext';
import { createPortal } from 'react-dom';
import { mediaColumnPlugins } from './MediaColumnKeys';
import { useMediaText } from './MediaMessages';
import { ResolvedMediaImage, ResolvedMediaVideo } from './MediaEnvironment';
import { MediaCaption } from './MediaReferences';
import React from 'react';
import { START_BLOCK_DRAG } from '../interaction/DocumentBlocks';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLexicalEditable } from '@lexical/react/useLexicalEditable';
import { GripVertical, Code } from 'lucide-react';
import MarkdownEditor from '../../MarkdownEditor';
import { MediaLayoutController } from './MediaLayoutController';
import { MediaLayoutDocument } from './MediaLayout';
import { MediaViewer } from './MediaViewer';
import { useMediaGesture } from './useMediaGesture';
import { canAddText, effectiveWidth, hasTextColumns, isTextOnly, resetWeights, rowOffset, setAlign, setBlockWidth, setCaption, setCaptionAlign, setRowHeight, setSingleWidth, setTextLayout, setValign, setWrap, type ItemPosition, type LayoutModel } from './upstream/src/layout/model';
import type { TextSide } from './upstream/src/format/v2';

function MediaColumn({ value, side, editable, controller, source, model, owner, layoutKey }: { value: string; side: TextSide; editable: boolean; controller: MediaLayoutController; source: string; model: LayoutModel; owner: import('lexical').LexicalEditor; layoutKey: string }) {
  const [draft, setDraft] = React.useState(value);
  const [error, setError] = React.useState('');
  React.useEffect(() => setDraft(value), [value]);
  return <div className="vml-text-column" style={{ '--vml-cols': isTextOnly(model) ? model.cols || 1 : 1, '--vml-gap': `${model.gap ?? 2}em`, fontSize: `${model.size || 1}em`, textAlign: model.textAlign || 'left' } as React.CSSProperties}
    onKeyDown={(event) => event.stopPropagation()}>
    <MediaColumnDragContext.Provider value={{ editor: owner, layoutKey, source, column: value, side, enabled: draft === value && !error }}>
    <MarkdownEditor autoFocus={false} plugins={mediaColumnPlugins} value={draft} readOnly={!editable} toolbarVisible={false} ariaLabel={`${side} layout text`} onChange={(next) => {
      setDraft(next);
      if (!controller.text(source, side, next)) setError('此编辑会改变布局结构。请通过“源码”完成修改。'); else setError('');
    }} />
    </MediaColumnDragContext.Provider>
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function MediaLayoutView({ document: doc, nodeKey }: { document: MediaLayoutDocument; nodeKey: string }) {
  const t = useMediaText();
  const [editor] = useLexicalComposerContext();
  const editorEditable = useLexicalEditable();
  const editable = editorEditable && doc.editable;
  const controller = React.useMemo(() => new MediaLayoutController(editor, nodeKey), [editor, nodeKey]);
  const frame = React.useRef<HTMLDivElement>(null);
  const [panel, setPanel] = React.useState<'source' | 'settings' | { mode: 'actions' | 'caption'; position: ItemPosition | 'block'; x: number; y: number } | null>(null);
  const sourceOpen = panel === 'source', settingsOpen = panel === 'settings';
  const menu = typeof panel === 'object' ? panel : null;
  const menuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>(menu.mode === 'caption' ? 'textarea' : 'button')?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setPanel(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setPanel(null); frame.current?.focus({ preventScroll: true }); } };
    window.addEventListener('pointerdown', dismiss); window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', escape, true); };
  }, [menu]);
  const [sourceDraft, setSourceDraft] = React.useState(doc.source);
  const [captionDraft, setCaptionDraft] = React.useState('');
  const [viewer, setViewer] = React.useState<number | null>(null);
  const [sizes, setSizes] = React.useState<Record<string, { w: number; h: number }>>({});
  const [canJoin, setCanJoin] = React.useState(false);
  React.useEffect(() => { const refresh = () => setCanJoin(controller.canJoinNext()); refresh(); return editor.registerUpdateListener(refresh); }, [controller, editor]);
  React.useEffect(() => { if (!sourceOpen) setSourceDraft(doc.source); }, [doc.source, sourceOpen]);
  const gesture = useMediaGesture(editor, nodeKey, doc, frame, editable);
  const model = gesture.preview || doc.model;
  const change = (next: LayoutModel) => { controller.commit(doc.source, next); if (menu) setPanel(null); };
  const images = model?.rows.flatMap((row) => row.items.filter((item) => item.embed.kind === 'image').map((item) => ({ src: item.embed.target, alt: item.caption || item.embed.alt }))) || [];
  const openImage = (target: string) => setViewer(Math.max(0, images.findIndex((image) => image.src === target)));
  const addText = (side: TextSide) => { if (model && canAddText(model)) controller.text(doc.source, side, side === 'left' ? '在此输入左侧文字。' : '在此输入右侧文字。'); setPanel(null); };
  const saveSource = () => { controller.source(doc.source, sourceDraft); setPanel(null); };
  if (!model || !doc.editable) return <div className="vml-invalid"><p role="alert">布局源码需要修复：{doc.block?.metaError || '未识别的布局结构'}</p>{editorEditable ? <div className="vml-source"><textarea aria-label="Layout Markdown source" value={sourceDraft} onChange={event => setSourceDraft(event.target.value)} /><button onClick={saveSource}>{t('保存源码')}</button></div> : <pre>{doc.source}</pre>}</div>;
  const menuPosition = menu && typeof menu.position === 'object' ? menu.position : null;
  const selected = menuPosition ? model.rows[menuPosition.row]?.items[menuPosition.index] : null;
  const resizeControls = <>{editable && !sourceOpen && <>
      <button className={`vml-frame-width${model.wrap === 'right' || model.align === 'right' ? ' vml-left-edge' : ''}`} title={t('拖动边缘调整宽度')} aria-label={t('调整布局宽度')} {...gesture.handle('frame-width')} />
      <button className="vml-frame-height" title={t('拖动底边调整高度')} aria-label={t('调整布局高度')} {...gesture.handle('frame-height')} />
      <button className={`vml-frame-scale${model.wrap === 'right' || model.align === 'right' ? ' vml-left-edge' : ''}`} title={t('拖动角点等比例缩放')} aria-label={t('等比例缩放布局')} {...gesture.handle('frame-scale')} />
    </>}</>;
  return <div ref={frame} className={`vml-layout${hasTextColumns(model) ? ' vml-columns' : ''}`} data-editable={editable} onClickCapture={gesture.onClickCapture} contentEditable={false} tabIndex={editable ? 0 : undefined}
    onContextMenu={(event) => { if (!editable) return; event.preventDefault(); event.stopPropagation(); setPanel({ mode: 'actions', position: 'block', x: event.clientX, y: event.clientY }); }}>
    {editable && <div className="vml-toolbar" role="toolbar" aria-label={t('布局操作')}>
      <button type="button" title={t('拖动整个布局；左右侧落点启用正文环绕')} style={{ touchAction: 'none', cursor: 'grab' }} onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
        editor.dispatchCommand(START_BLOCK_DRAG, { key: nodeKey, pointerId: event.pointerId, x: event.clientX, y: event.clientY });
      }}><GripVertical size={14} /></button>
      <button type="button" title={t('编辑布局源码')} onClick={() => { setSourceDraft(doc.source); setPanel(sourceOpen ? null : 'source'); }}><Code size={14} /></button>
    </div>}
    {editable && settingsOpen && <div className="vml-settings" onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') setPanel(null); }}>
      <button onClick={() => setPanel(null)}>{t('关闭')}</button>
      <label>{t('布局宽度')}<input aria-label="Layout width percent" type="number" min="20" max="100" value={Math.round((effectiveWidth(model) || 1) * 100)} onChange={(event) => change(setBlockWidth(model, Number(event.target.value) / 100))} />%</label>
      <label>{t('正文环绕')}<select value={model.wrap || 'none'} disabled={hasTextColumns(model)} onChange={(event) => change(setWrap(model, event.target.value === 'none' ? null : event.target.value as 'left' | 'right'))}>
        <option value="none">{t('不环绕')}</option><option value="left">{t('浮动左侧')}</option><option value="right">{t('浮动右侧')}</option></select></label>
      <label>{t('整体对齐')}<select value={model.align || 'left'} onChange={(event) => change(setTextLayout(model, { align: event.target.value as 'left' | 'center' | 'right' }))}><option>left</option><option>center</option><option>right</option></select></label>
      {canAddText(model) && <><button onClick={() => addText('left')}>{t('添加左侧文字')}</button><button onClick={() => addText('right')}>{t('添加右侧文字')}</button></>}
      {hasTextColumns(model) && <label>{t('文字垂直对齐')}<select value={model.valign || 'top'} onChange={(event) => change(setValign(model, event.target.value as 'top' | 'center' | 'bottom'))}><option>top</option><option>center</option><option>bottom</option></select></label>}
      {(model.text.left || model.text.right) && <>
        {isTextOnly(model) && <label>{t('文字列数')}<input type="number" min="1" max="4" value={model.cols || 1} onChange={(event) => change(setTextLayout(model, { cols: Number(event.target.value) }))} /></label>}
        <label>{t('列间距 em')}<input type="number" min="0" max="6" step=".25" value={model.gap ?? 2} onChange={(event) => change(setTextLayout(model, { gap: Number(event.target.value) }))} /></label>
        <label>{t('字号倍数')}<input type="number" min=".5" max="2" step=".05" value={model.size || 1} onChange={(event) => change(setTextLayout(model, { size: Number(event.target.value) }))} /></label>
        <label>{t('文字对齐')}<select value={model.textAlign || 'left'} onChange={(event) => change(setTextLayout(model, { textAlign: event.target.value as 'left' | 'center' | 'right' | 'justify' }))}><option>left</option><option>center</option><option>right</option><option>justify</option></select></label>
      </>}
    </div>}
    {sourceOpen && editable ? <div className="vml-source" onKeyDown={(event) => event.stopPropagation()}>
      <textarea aria-label="Layout Markdown source" value={sourceDraft} onChange={(event) => setSourceDraft(event.target.value)} rows={Math.min(18, sourceDraft.split('\n').length + 1)} />
      <button onClick={saveSource}>{t('保存源码')}</button><button onClick={() => setPanel(null)}>{t('取消')}</button>
    </div> : <div className="vml-content" style={{ alignItems: model.valign === 'center' ? 'center' : model.valign === 'bottom' ? 'flex-end' : 'flex-start' }}>
      {model.text.left !== null && <MediaColumn owner={editor} layoutKey={nodeKey} value={model.text.left} side="left" editable={editable} controller={controller} source={doc.source} model={model} />}
      {!!model.rows.length && <div className="vml-media" style={{ width: hasTextColumns(model) ? `${(effectiveWidth(model) || .4) * 100}%` : '100%' }}>
        {model.rows.map((row, rowIndex) => {
          const single = row.items.length === 1;
          const weights = row.items.map((item) => item.weight ?? ((sizes[item.embed.target]?.w || 1) / (sizes[item.embed.target]?.h || 1)));
          return <div className="vml-row" data-row={rowIndex} key={rowIndex} style={{ gridTemplateColumns: single ? undefined : weights.map((weight) => `minmax(0, ${weight}fr)`).join(' ') }}>
            {row.items.map((item, index) => {
              const position = { row: rowIndex, index }, dimensions = sizes[item.embed.target];
              const share = row.width;
              const width = single ? share ? `${share * 100}%` : item.embed.nativeWidth || dimensions?.w || '100%' : undefined;
              return <figure tabIndex={editable ? 0 : undefined} onKeyDown={event => {
                  if (editable && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
                    event.preventDefault(); event.stopPropagation(); const box = event.currentTarget.getBoundingClientRect();
                    setCaptionDraft(item.caption || ''); setPanel({ mode: 'actions', position, x: box.left + 16, y: box.top + 16 });
                  }
                }} className={`vml-item${gesture.dragging?.position.row === rowIndex && gesture.dragging.position.index === index ? ' vml-item-moving' : ''}`} data-index={index} key={index} style={{ width, maxWidth: '100%', marginLeft: single ? `${rowOffset(row) * 100}%` : undefined, transform: single ? `translateX(-${rowOffset(row) * 100}%)` : undefined }}
                onContextMenu={(event) => { if (!editable) return; event.preventDefault(); event.stopPropagation(); setCaptionDraft(item.caption || ''); setPanel({ mode: 'actions', position, x: event.clientX, y: event.clientY }); }}>
                <div className="vml-asset" style={{ height: single ? undefined : row.height || 220 }}>
                  {item.embed.kind === 'video' ? <ResolvedMediaVideo src={item.embed.target} controls playsInline preload="metadata" aria-label={item.embed.alt || 'Video'} onLoadedMetadata={(event) => { const media = event.currentTarget; setSizes((old) => ({ ...old, [item.embed.target]: { w: media.videoWidth, h: media.videoHeight } })); }} />
                    : <ResolvedMediaImage title={editable ? t('拖动图片移动；单图在本行内横移定位；双击放大；右键更多操作') : undefined} src={item.embed.target} alt={item.embed.alt} draggable={false} {...(editable ? gesture.handle('item', position) : {})}
                      onLoad={(event) => { const image = event.currentTarget; setSizes((old) => ({ ...old, [item.embed.target]: { w: image.naturalWidth, h: image.naturalHeight } })); }}
                      onDoubleClick={() => openImage(item.embed.target)} onClick={() => { if (!editable) openImage(item.embed.target); }} />}
                </div>
                {item.caption && <figcaption style={{ textAlign: row.captionAlign || 'center' }}><MediaCaption text={item.caption} /></figcaption>}
                {editable && <>
                  {item.embed.kind === 'video' && <button className="vml-grip" title={t('拖动到另一行或另一布局')} aria-label={`Move media ${rowIndex + 1}-${index + 1}`} {...gesture.handle('item', position)}><GripVertical size={16} /></button>}
                  {single && <button className="vml-single-width" title={t('拖动边缘调整单图宽度')} aria-label={t('调整单图宽度')} {...gesture.handle('single-width', position)} />}
                  {!single && index < row.items.length - 1 && <button className="vml-divider" title={t('拖动间隙调整比例；双击恢复')} aria-label={t('调整列比例；双击恢复')} {...gesture.handle('columns', position)} onDoubleClick={() => change(resetWeights(model, rowIndex))} />}
                </>}
              </figure>;
            })}
            {editable && !single && <button className="vml-row-height" title={t('拖动底边调整行高')} aria-label={`调整第 ${rowIndex + 1} 行高度`} {...gesture.handle('row-height', { row: rowIndex, index: 0 })} />}
          </div>;
        })}
        {hasTextColumns(model) && resizeControls}
      </div>}
      {model.text.right !== null && <MediaColumn owner={editor} layoutKey={nodeKey} value={model.text.right} side="right" editable={editable} controller={controller} source={doc.source} model={model} />}
    </div>}
    {!hasTextColumns(model) && resizeControls}
    {menu && editable && createPortal(<div ref={menuRef} className="vml-menu" style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 270)), top: Math.max(8, Math.min(menu.y, window.innerHeight - 410)) }} role="menu" onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') setPanel(null); }}>
      {menu.mode === 'caption' && selected && menuPosition ? <>
        <label>{t('图片说明')}<textarea autoFocus aria-label="Media caption" value={captionDraft} onChange={(event) => setCaptionDraft(event.target.value)} /></label>
        <button onClick={() => change(setCaption(model, menuPosition, captionDraft))}>{t('保存说明')}</button>
        <button onClick={() => change(setCaptionAlign(setCaption(model, menuPosition, captionDraft), menuPosition.row, 'left'))}>{t('说明靠左')}</button><button onClick={() => change(setCaptionAlign(setCaption(model, menuPosition, captionDraft), menuPosition.row, 'center'))}>{t('说明居中')}</button>
        <button onClick={() => setPanel({ ...menu, mode: 'actions' })}>{t('返回')}</button>
      </> : <>
      {selected && menuPosition && <>
        <button role="menuitem" onClick={() => setPanel({ ...menu, mode: 'caption' })}>{t('编辑说明…')}</button>
        {model.rows[menuPosition.row].items.length === 1 && (['left', 'center', 'right'] as const).map((align) => <button role="menuitem" key={align} onClick={() => change(setAlign(model, menuPosition.row, align))}>{t(align === 'left' ? '图片靠左' : align === 'center' ? '图片居中' : '图片靠右')}</button>)}
        <button role="menuitem" onClick={() => { controller.moveOut(menuPosition); setPanel(null); }}>{t('移出布局，保留图片')}</button>
      </>}
      {canAddText(model) && <><button onClick={() => addText('left')}>{t('添加左侧文字')}</button><button onClick={() => addText('right')}>{t('添加右侧文字')}</button></>}
      {!hasTextColumns(model) && <><button onClick={() => change(setWrap(model, 'left'))}>{t('浮动左侧，正文环绕')}</button><button onClick={() => change(setWrap(model, 'right'))}>{t('浮动右侧，正文环绕')}</button><button onClick={() => change(setWrap(model, null))}>{t('取消环绕')}</button></>}
      <button onClick={() => setPanel('settings')}>{t('文字与布局设置…')}</button>
      {canJoin && <button onClick={() => { controller.joinNext(); setPanel(null); }}>{t('合并下一个布局或图片段落')}</button>}
      <button onClick={() => { controller.unwrap(); setPanel(null); }}>{t('移除布局，保留内容')}</button>
      </>}
    </div>, window.document.body)}
    {gesture.outside && createPortal(<div className="vml-document-drop" style={{ top: gesture.outside.top, left: gesture.outside.left, width: gesture.outside.width }}><span>松开移出到正文</span></div>, window.document.body)}
    {gesture.dragging && createPortal(<div className="vml-drag-ghost" style={{ left: gesture.dragging.x + 16, top: gesture.dragging.y + 16 }} aria-hidden="true">
      {model.rows[gesture.dragging.position.row]?.items[gesture.dragging.position.index]?.embed.kind === 'image'
        ? <ResolvedMediaImage src={model.rows[gesture.dragging.position.row].items[gesture.dragging.position.index].embed.target} alt="" /> : <GripVertical size={24} />}
    </div>, window.document.body)}
    {viewer !== null && images.length > 0 && <MediaViewer images={images} initial={viewer} onClose={() => setViewer(null)} />}
  </div>;
}
