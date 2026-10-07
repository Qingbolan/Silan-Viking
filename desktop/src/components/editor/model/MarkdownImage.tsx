import { useResolvedMedia } from '../media/MediaEnvironment';
import { $createLinkNode } from '@lexical/link';
import React from 'react';
import { isVideoResource } from '../../../lib/media';
import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
  configExtension,
  defineExtension,
} from 'lexical';
import {
  MdastImportExtension,
  type MdastExportHandler,
  type MdastImportHandler,
  type MdastNode,
  type MdastParent,
} from '@lexical/mdast';

export type MarkdownImageData = {
  alt: string;
  src: string;
  title: string | null;
  poster?: string;
};

type SerializedMarkdownImageNode = Spread<MarkdownImageData, SerializedLexicalNode>;

function MarkdownImageView({ alt, src, title, poster }: MarkdownImageData) {
  const [loadState, setLoadState] = React.useState<'loading' | 'ready' | 'error'>('loading');

  React.useEffect(() => setLoadState('loading'), [src]);

  const resolved = useResolvedMedia(src);
  const video = isVideoResource(src);
  return (
    <>
      {video ? (
        <video src={resolved} poster={poster} controls playsInline preload="metadata" aria-label={alt || title || 'Video'}
          data-load-state={loadState}
          onLoadedMetadata={() => setLoadState('ready')}
          onError={() => setLoadState('error')}
        />
      ) : <img
        src={resolved}
        alt={alt}
        title={title || undefined}
        draggable={false}
        data-load-state={loadState}
        onLoad={() => setLoadState('ready')}
        onError={() => setLoadState('error')}
      />}
      {loadState === 'error' && (
        <span className="lexical-image-node__error" role="status">
          <strong>{video ? 'Video unavailable' : 'Image unavailable'}</strong>
          <span>{alt || src}</span>
        </span>
      )}
    </>
  );
}

export class MarkdownImageNode extends DecoratorNode<React.ReactNode> {
  __src: string;
  __alt: string;
  __title: string | null;
  __poster?: string;

  static getType() {
    return 'markdown-image';
  }

  static clone(node: MarkdownImageNode) {
    return new MarkdownImageNode(node.__src, node.__alt, node.__title, node.__key, node.__poster);
  }

  static importJSON(serialized: SerializedMarkdownImageNode) {
    return new MarkdownImageNode(serialized.src, serialized.alt, serialized.title, undefined, serialized.poster);
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: (element: HTMLElement): DOMConversionOutput => {
          const image = element as HTMLImageElement;
          return {
            node: $createMarkdownImageNode(
              image.getAttribute('src') || '',
              image.getAttribute('alt') || '',
              image.getAttribute('title'),
            ),
          };
        },
        priority: 1,
      }),
    };
  }

  constructor(src: string, alt = '', title: string | null = null, key?: NodeKey, poster?: string) {
    super(key);
    this.__src = src;
    this.__alt = alt;
    this.__title = title;
    this.__poster = poster;
  }

  exportJSON(): SerializedMarkdownImageNode {
    return {
      ...super.exportJSON(),
      alt: this.__alt,
      src: this.__src,
      title: this.__title,
      poster: this.__poster,
      type: 'markdown-image',
      version: 1,
    };
  }

  exportDOM(): DOMExportOutput {
    if (isVideoResource(this.__src)) {
      const video = document.createElement('video');
      video.src = this.__src;
      video.controls = true;
      if (this.__poster) video.poster = this.__poster;
      video.setAttribute('aria-label', this.__alt);
      return { element: video };
    }
    const image = document.createElement('img');
    image.src = this.__src;
    image.alt = this.__alt;
    if (this.__title) image.title = this.__title;
    return { element: image };
  }

  createDOM(): HTMLElement {
    const element = document.createElement('span');
    element.className = 'lexical-image-node';
    element.dataset.imageNode = 'true';
    return element;
  }

  updateDOM(): false {
    return false;
  }

  decorate() {
    return <MarkdownImageView alt={this.__alt} src={this.__src} title={this.__title} poster={this.__poster} />;
  }

  getTextContent() {
    return this.__alt;
  }

  isInline() {
    return true;
  }

  getSource() {
    return this.getLatest().__src;
  }

  getAltText() {
    return this.getLatest().__alt;
  }

  getPoster() { return this.getLatest().__poster; }

  getTitle() {
    return this.getLatest().__title;
  }

  setSource(src: string) {
    this.getWritable().__src = src;
    return this;
  }

  setAltText(alt: string) {
    this.getWritable().__alt = alt;
    return this;
  }

  setTitle(title: string | null) {
    this.getWritable().__title = title;
    return this;
  }
}

export function $createMarkdownImageNode(src: string, alt = '', title: string | null = null, poster?: string) {
  return $applyNodeReplacement(new MarkdownImageNode(src, alt, title, undefined, poster));
}

export function $isMarkdownImageNode(node: LexicalNode | null | undefined): node is MarkdownImageNode {
  return node instanceof MarkdownImageNode;
}

type ImageAstNode = MdastNode & {
  alt?: string;
  identifier?: string;
  title?: string | null;
  type: 'image' | 'imageReference';
  url?: string;
};

const $importImage: MdastImportHandler = (node, context) => {
  const image = node as ImageAstNode;
  if (image.type === 'image') {
    return $createMarkdownImageNode(image.url || '', image.alt || '', image.title || null);
  }
  if (image.type === 'imageReference' && image.identifier) {
    const definition = context.getDefinition(image.identifier);
    if (definition) {
      return $createMarkdownImageNode(
        definition.url,
        image.alt || '',
        definition.title || null,
      );
    }
  }
  return null;
};

// Standard linked-image Markdown stores both assets without hiding media
// references in custom attributes: [![caption](poster)](video).
const $importVideoPoster: MdastImportHandler = (node, context) => {
  const link = node as MdastNode & { url?: string; title?: string; children?: ImageAstNode[] };
  const image = link.children?.[0];
  if (!link.url) return null;
  if (!isVideoResource(link.url) || link.children?.length !== 1 || image?.type !== 'image' || !image.url) {
    return $createLinkNode(link.url, { title: link.title }).append(...context.importChildren(node as MdastParent));
  }
  return $createMarkdownImageNode(link.url, image.alt || '', image.title || null, image.url);
};

const $exportImage: MdastExportHandler = (node) => {
  if (!$isMarkdownImageNode(node)) return null;
  if (node.getPoster()) return { type: 'link', url: node.getSource(), children: [{ type: 'image', url: node.getPoster(), alt: node.getAltText(), title: node.getTitle() }] } as MdastNode;
  return {
    alt: node.getAltText(),
    title: node.getTitle(),
    type: 'image',
    url: node.getSource(),
  } as MdastNode;
};

export const MarkdownImageExtension = defineExtension({
  dependencies: [
    configExtension(MdastImportExtension, {
      exportRules: [{ $export: $exportImage, type: 'markdown-image' }],
      importRules: [
        { $import: $importVideoPoster, type: 'link' },
        { $import: $importImage, type: 'image' },
        { $import: $importImage, type: 'imageReference' },
      ],
    }),
  ],
  name: 'silan/markdown-image',
  nodes: [MarkdownImageNode],
});

const escapeAltText = (value: string) => value.replace(/([\\\]])/g, '\\$1');
const escapeTitle = (value: string) => value.replace(/([\\"])/g, '\\$1');

export function markdownForImage({ alt, src, title, poster }: MarkdownImageData): string {
  if (poster) return `[${markdownForImage({ alt, src: poster, title })}](${src})`;
  const destination = /[\s()]/.test(src) ? `<${src.replace(/>/g, '%3E')}>` : src;
  const titleSuffix = title ? ` "${escapeTitle(title)}"` : '';
  return `![${escapeAltText(alt)}](${destination}${titleSuffix})`;
}
