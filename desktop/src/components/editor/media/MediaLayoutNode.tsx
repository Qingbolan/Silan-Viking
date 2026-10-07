import { MediaWikiLinkNode, $createMediaWikiLink, mediaWikiSyntax, mediaWikiFromMarkdown } from './MediaWikiLink';
import { mediaLayoutSyntax } from './MediaLayoutSyntax';
import React from 'react';
import { MediaReferenceNode } from './MediaReferences';
import { $applyNodeReplacement, DecoratorNode, configExtension, defineExtension, type NodeKey, type SerializedLexicalNode } from 'lexical';
import { MdastImportExtension } from '@lexical/mdast';
import { MediaLayoutDocument, mediaLayoutFromMarkdown, migratePrototypeLayout, type MediaLayoutAst } from './MediaLayout';
import { hasTextColumns, effectiveWidth } from './upstream/src/layout/model';
import { MediaLayoutView } from './MediaLayoutView';

type SerializedMediaLayout = SerializedLexicalNode & { source: string };
export class MediaLayoutNode extends DecoratorNode<React.ReactNode> {
  __document: MediaLayoutDocument;
  static getType() { return 'media-layout'; }
  static clone(node: MediaLayoutNode) { return new MediaLayoutNode(node.__document.source, node.__key); }
  static importJSON(data: SerializedMediaLayout) {
    if (data.version === 1 && 'layout' in data) return new MediaLayoutNode(migratePrototypeLayout(data.layout as Parameters<typeof migratePrototypeLayout>[0]));
    if (data.version !== 2) throw new Error('Unsupported media layout node version');
    return new MediaLayoutNode(data.source);
  }
  constructor(source: string, key?: NodeKey) { super(key); this.__document = new MediaLayoutDocument(source); }
  exportJSON(): SerializedMediaLayout { return { ...super.exportJSON(), type: 'media-layout', version: 2, source: this.__document.source }; }
  createDOM() { const element = document.createElement('div'); this.applyDOM(element); return element; }
  updateDOM(_previous: this, element: HTMLElement) { this.applyDOM(element); return false; }
  private applyDOM(element: HTMLElement) {
    const model = this.__document.model;
    element.className = 'lexical-media-layout';
    element.dataset.layoutKey = this.__key;
    element.dataset.wrap = model?.wrap || 'none';
    element.dataset.align = model?.align || 'left';
    const columns = model && hasTextColumns(model);
    element.style.setProperty('--media-width', `${model && !columns ? (effectiveWidth(model) ?? 1) * 100 : 100}%`);
    element.style.width = model?.wrap ? '100%' : 'var(--media-width)';
    element.style.setProperty('--media-skip', String(model?.skip || 0));
  }
  isInline() { return false; }
  getDocument() { return this.getLatest().__document; }
  getSource() { return this.getDocument().source; }
  setSource(source: string) { this.getWritable().__document = new MediaLayoutDocument(source); }
  getTextContent() { return this.__document.source; }
  decorate() { return <MediaLayoutView nodeKey={this.__key} document={this.__document} />; }
}
export function $createMediaLayout(source: string) { return $applyNodeReplacement(new MediaLayoutNode(source)); }
export const MediaLayoutExtension = defineExtension({
  name: 'silan/adjustable-media', nodes: [MediaLayoutNode, MediaReferenceNode, MediaWikiLinkNode],
  dependencies: [configExtension(MdastImportExtension, {
    micromarkExtensions: [mediaLayoutSyntax, mediaWikiSyntax],
    mdastExtensions: [mediaLayoutFromMarkdown, mediaWikiFromMarkdown],
    importRules: [{ type: 'mediaWiki', $import: node => $createMediaWikiLink((node as { value: string }).value) }, { type: 'silanMediaLayout', $import: (node) => $createMediaLayout((node as MediaLayoutAst).source) }],
    exportRules: [{ type: 'media-wiki-link', $export: node => ({ type: 'html', value: node.getTextContent() }) }, { type: 'media-reference', $export: (node) => ({ type: 'text', value: node.getTextContent() }) }, { type: 'media-layout', $export: (node) => node instanceof MediaLayoutNode ? { type: 'html', value: node.getSource() } : null }],
  })],
});
