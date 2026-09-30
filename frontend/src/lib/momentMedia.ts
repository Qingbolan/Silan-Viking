import { fromMarkdown } from 'mdast-util-from-markdown';
import type { RootContent } from 'mdast';
import { isVideoResource } from '../api/utils';

export type MomentVideo = { src: string; poster?: string };

/** Read the same linked-poster and video-image syntax as the Markdown renderer. */
export function firstMomentVideo(markdown: string): MomentVideo | null {
  const visit = (node: RootContent): MomentVideo | null => {
    if (node.type === 'link' && isVideoResource(node.url)) {
      const image = node.children.length === 1 && node.children[0].type === 'image' ? node.children[0] : null;
      if (image) return { src: node.url, poster: image.url };
    }
    if (node.type === 'image' && isVideoResource(node.url)) return { src: node.url };
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
    if (video) return video;
  }
  return null;
}
