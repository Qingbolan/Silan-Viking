import { fromMarkdown } from 'mdast-util-from-markdown';
import type { RootContent } from 'mdast';
import { isVideoResource } from '../api/utils';

export type MomentVideo = { src: string; poster?: string };

/** Read the same linked-poster and video-image syntax as the Markdown renderer. */
export function momentVideoContent(markdown: string): { video: MomentVideo | null; body: string } {
  let range: [number, number] | undefined;
  const visit = (node: RootContent): MomentVideo | null => {
    if (node.type === 'link' && isVideoResource(node.url)) {
      const image = node.children.length === 1 && node.children[0].type === 'image' ? node.children[0] : null;
      if (image) {
        range = [node.position!.start.offset!, node.position!.end.offset!];
        return { src: node.url, poster: image.url };
      }
    }
    if (node.type === 'image' && isVideoResource(node.url)) {
      range = [node.position!.start.offset!, node.position!.end.offset!];
      return { src: node.url };
    }
    if ('children' in node) {
      for (const child of node.children) {
        const video = visit(child as RootContent);
        if (video) return video;
      }
    }
    return null;
  };
  for (const node of fromMarkdown(markdown || '').children) {
    const video = visit(node);
    if (video && range) return { video, body: (markdown.slice(0, range[0]) + markdown.slice(range[1])).trim() };
  }
  return { video: null, body: markdown };
}

export function firstMomentVideo(markdown: string): MomentVideo | null {
  return momentVideoContent(markdown).video;
}
