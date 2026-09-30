import { $createLinkNode } from '@lexical/link';
import React, { type JSX } from 'react';
import {
  MdastImportExtension,
  type MdastExportHandler,
  type MdastImportHandler,
  type MdastNode,
  type MdastParent,
} from '@lexical/mdast';
import {
  $applyNodeReplacement,
  configExtension,
  DecoratorNode,
  defineExtension,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import { isVideoResource, mediaUrl } from '../../../api/utils';

type SerializedMarkdownMediaNode = Spread<
  {
    altText: string;
    src: string;
    title?: string;
    poster?: string;
  },
  SerializedLexicalNode
>;

const trustedMediaSource = (source: string): string => {
  const normalized = source.trim();
  if (
    !normalized
    || !(
      normalized.startsWith('/')
      || normalized.startsWith('./')
      || normalized.startsWith('../')
      || normalized.startsWith('resources/')
      || normalized.startsWith('silan://resources/')
      || /^https?:\/\//i.test(normalized)
    )
  ) {
    return '';
  }
  return mediaUrl(normalized);
};

const MarkdownMedia: React.FC<{
  altText: string;
  src: string;
  title?: string;
  poster?: string;
}> = ({ altText, src, title, poster }) => {
  const resolvedSource = trustedMediaSource(src);
  if (!resolvedSource) return null;

  return isVideoResource(src) ? (
    <video controls playsInline poster={poster ? trustedMediaSource(poster) : undefined} preload="metadata" aria-label={altText || title || 'Embedded video'}>
      <source src={resolvedSource} />
    </video>
  ) : (
    <img
      src={resolvedSource}
      alt={altText}
      title={title}
      loading="lazy"
      decoding="async"
    />
  );
};

export class MarkdownMediaNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText: string;
  __title?: string;
  __poster?: string;

  $config() {
    return this.config('markdown-media', { extends: DecoratorNode });
  }

  static clone(node: MarkdownMediaNode): MarkdownMediaNode {
    return new MarkdownMediaNode(node.__src, node.__altText, node.__title, node.__key, node.__poster);
  }

  static importJSON(serializedNode: SerializedMarkdownMediaNode): MarkdownMediaNode {
    return $createMarkdownMediaNode({
      altText: serializedNode.altText,
      src: serializedNode.src,
      title: serializedNode.title,
      poster: serializedNode.poster,
    });
  }

  constructor(src = '', altText = '', title?: string, key?: NodeKey, poster?: string) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__title = title;
    this.__poster = poster;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('span');
    const className = config.theme.image;
    if (typeof className === 'string') element.className = className;
    return element;
  }

  updateDOM(): false {
    return false;
  }

  isInline(): true {
    return true;
  }

  exportJSON(): SerializedMarkdownMediaNode {
    return {
      ...super.exportJSON(),
      altText: this.getAltText(),
      src: this.getSrc(),
      title: this.getTitle(),
      poster: this.getPoster(),
    };
  }

  getSrc(): string {
    return this.getLatest().__src;
  }

  getAltText(): string {
    return this.getLatest().__altText;
  }

  getPoster(): string | undefined { return this.getLatest().__poster; }

  getTitle(): string | undefined {
    return this.getLatest().__title;
  }

  getTextContent(): string {
    return this.getAltText();
  }

  decorate(): JSX.Element {
    return <MarkdownMedia src={this.__src} altText={this.__altText} title={this.__title} poster={this.__poster} />;
  }
}

export const $createMarkdownMediaNode = ({
  altText,
  src,
  title,
  poster,
}: {
  altText: string;
  src: string;
  title?: string;
  poster?: string;
}): MarkdownMediaNode => (
  $applyNodeReplacement(new MarkdownMediaNode(src, altText, title, undefined, poster))
);

export const $isMarkdownMediaNode = (
  node: LexicalNode | null | undefined,
): node is MarkdownMediaNode => node instanceof MarkdownMediaNode;

type ImageAstNode = MdastNode & {
  alt?: string;
  identifier?: string;
  title?: string | null;
  type: 'image' | 'imageReference';
  url?: string;
};

const $importMedia: MdastImportHandler = (node, context) => {
  const image = node as ImageAstNode;
  if (image.type === 'image') {
    return $createMarkdownMediaNode({
      altText: image.alt ?? '',
      src: image.url ?? '',
      title: image.title ?? undefined,
    });
  }
  if (image.type === 'imageReference' && image.identifier) {
    const definition = context.getDefinition(image.identifier);
    if (definition) {
      return $createMarkdownMediaNode({
        altText: image.alt ?? '',
        src: definition.url,
        title: definition.title ?? undefined,
      });
    }
  }
  return null;
};

const $importVideoPoster: MdastImportHandler = (node, context) => {
  const link = node as MdastNode & { url?: string; title?: string; children?: ImageAstNode[] };
  const image = link.children?.[0];
  if (!link.url) return null;
  if (!isVideoResource(link.url) || link.children?.length !== 1 || image?.type !== 'image' || !image.url) {
    return $createLinkNode(link.url, { title: link.title }).append(...context.importChildren(node as MdastParent));
  }
  return $createMarkdownMediaNode({ src: link.url, altText: image.alt || '', title: image.title || undefined, poster: image.url });
};

const $exportMedia: MdastExportHandler = (node) => {
  if (!$isMarkdownMediaNode(node)) return null;
  if (node.getPoster()) return { type: 'link', url: node.getSrc(), children: [{ type: 'image', url: node.getPoster(), alt: node.getAltText(), title: node.getTitle() ?? null }] } as MdastNode;
  return {
    alt: node.getAltText(),
    title: node.getTitle() ?? null,
    type: 'image',
    url: node.getSrc(),
  } as MdastNode;
};

export const MarkdownMediaExtension = defineExtension({
  dependencies: [
    configExtension(MdastImportExtension, {
      exportRules: [{ $export: $exportMedia, type: 'markdown-media' }],
      importRules: [
        { $import: $importVideoPoster, type: 'link' },
        { $import: $importMedia, type: 'image' },
        { $import: $importMedia, type: 'imageReference' },
      ],
    }),
  ],
  name: 'silan/public-markdown-media',
  nodes: [MarkdownMediaNode],
});
