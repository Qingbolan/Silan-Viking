import type { Extension } from 'mdast-util-from-markdown';
import type { Html, Root, RootContent } from 'mdast';
import type { Token } from 'micromark-util-types';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { markdownForImage, type MarkdownImageData } from '../model/MarkdownImage';
import { findV2Blocks, serializeOpener, serializeRow, type V2Block } from './upstream/src/format/v2';
import { metaFromModel, modelFromBlock, type LayoutModel } from './upstream/src/layout/model';
import { applyEditsToText, isEditable, keepListOpen, planModelEdit, type BlockEdit } from './upstream/src/layout/edits';

export type MediaLayoutData = LayoutModel;
export function modelSource(model: LayoutModel): string {
  const body = [...(model.text.left?.split('\n') || []),
    ...model.rows.map((row) => serializeRow(row.items.map((item) => item.embed))),
    ...(model.text.right?.split('\n') || [])];
  return [serializeOpener(metaFromModel(model)), ...keepListOpen(body), '<!-- /vml -->'].join('\n');
}

/** Immutable source owns presentation and exact embeds; upstream plans own changes. */
export class MediaLayoutDocument {
  readonly block: V2Block | null;
  readonly model: LayoutModel | null;
  readonly editable: boolean;
  constructor(readonly source: string) {
    const blocks = findV2Blocks(source.split('\n'));
    this.block = blocks.length === 1 && blocks[0].openLine === 0 && blocks[0].closeLine === source.split('\n').length - 1 ? blocks[0] : null;
    this.model = this.block ? modelFromBlock(this.block) : null;
    this.editable = !!this.block && isEditable(this.block);
  }
  apply(edit: BlockEdit | null): string {
    if (!edit || !this.editable) return this.source;
    const result = applyEditsToText(this.source, [edit]);
    if (!result.ok) throw new Error(`Media layout edit rejected: ${result.reason}`);
    return result.text;
  }
  change(model: LayoutModel): string { return this.apply(this.block ? planModelEdit(this.block, model) : null); }
}

export function sourceFromImages(items: readonly MarkdownImageData[], columns = 2): string {
  const rows: string[] = [];
  const count = Math.max(1, Math.min(4, columns));
  for (let i = 0; i < items.length; i += count) rows.push(items.slice(i, i + count).map(markdownForImage).join(' '));
  return ['<!-- vml {"v":2} -->', ...rows, '<!-- /vml -->'].join('\n');
}

// One-time prototype migration: all writes use vml v2; there is no old renderer.
export function migratePrototypeLayout(data: { version: number; items: MarkdownImageData[]; width?: number; align?: string; columns?: number; height?: number; weights?: number[] }): string {
  if (data.version !== 1 || !Array.isArray(data.items)) throw new Error('Unsupported prototype media layout');
  const doc = new MediaLayoutDocument(sourceFromImages(data.items, data.columns));
  if (!doc.model) throw new Error('Invalid prototype media layout');
  const model = doc.model;
  model.width = Math.max(.2, Math.min(1, (data.width || 100) / 100));
  model.align = data.align === 'center' || data.align === 'right' ? data.align : null;
  let index = 0;
  for (const row of model.rows) {
    row.height = data.height || 240;
    for (const item of row.items) { item.weight = data.weights?.[index++] || 1; }
  }
  return modelSource(model);
}

function migratePrototypeSource(source: string): string {
  const opening = source.split('\n')[0];
  const settings = JSON.parse(opening.slice('<!-- silan-media '.length, -4));
  const items: MarkdownImageData[] = [];
  const root = fromMarkdown(source);
  for (const block of root.children) {
    if (block.type !== 'paragraph') continue;
    for (const node of block.children) {
      if (node.type === 'image') items.push({ src: node.url, alt: node.alt || '', title: node.title || null });
      else if (node.type === 'link' && node.children.length === 1 && node.children[0].type === 'image') {
        const image = node.children[0];
        items.push({ src: node.url, alt: image.alt || '', title: image.title || null, poster: image.url });
      } else if (node.type !== 'text' || node.value.trim()) throw new Error('Mixed prototype content');
    }
  }
  return migratePrototypeLayout({ ...settings, items });
}

export interface MediaLayoutAst { type: 'silanMediaLayout'; source: string; children: RootContent[]; position?: Html['position'] }
declare module 'mdast' {
  interface RootContentMap { silanMediaLayout: MediaLayoutAst }
  interface BlockContentMap { silanMediaLayout: MediaLayoutAst }
}
/** Root layout tokens own their exact source; body Markdown is rendered in column editors. */
export const mediaLayoutFromMarkdown: Extension = {
  enter: { silanMediaBlock(token) {
    let source = this.sliceSerialize(token);
    if (source.startsWith('<!-- silan-media')) {
      try { source = migratePrototypeSource(source); } catch { /* Keep unsupported source for repair. */ }
    }
    this.enter({ type: 'silanMediaLayout', source, children: [] }, token);
  } },
  exit: { silanMediaBlock(token) { this.exit(token); } },
};
