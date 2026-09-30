import assert from 'node:assert/strict';
import { buildEditorFromExtensions } from '@lexical/extension';
import { $convertFromMarkdownString, $convertToMarkdownString, MdastCommonMarkExtension, MdastExtension } from '@lexical/mdast';
import { $getRoot, defineExtension } from 'lexical';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { $isMarkdownMediaNode, MarkdownMediaExtension } from '../src/components/ui/lexical/MarkdownMediaNode';

const source = '[![Cover](/media/cover.jpg)](/media/clip.mp4)\n\n[Ordinary link](https://example.com)';
const editor = buildEditorFromExtensions(defineExtension({
  name: 'silan/video-verification', namespace: 'verification',
  dependencies: [MdastCommonMarkExtension, MdastExtension, MarkdownMediaExtension],
  $initialEditorState: () => $convertFromMarkdownString(source),
  onError: (error: Error) => { throw error; },
}));
editor.read(() => {
  const node = $getRoot().getFirstDescendant();
  assert.ok($isMarkdownMediaNode(node));
  assert.equal(node.getPoster(), '/media/cover.jpg');
  const html = renderToStaticMarkup(node.decorate());
  assert.match(html, /<video/);
  assert.match(html, /poster="\/media\/cover.jpg"/);
  assert.equal($convertToMarkdownString().trim(), source);
});
editor.dispose();
console.log('Public video cover rendering and ordinary links verified.');

const { firstMomentVideo } = await import('../src/lib/momentMedia');
const { markdownToPlainExcerpt } = await import('../src/lib/markdown');
const servedVideo = '/api/v1/media?f=moment/demo/assets/clip.mp4&v=123';
const servedPoster = '/api/v1/media?f=moment/demo/assets/cover.jpg&v=456';
const servedMarkdown = `[![Cover](${servedPoster})](${servedVideo})\n\nThe caption.`;
assert.deepEqual(firstMomentVideo(servedMarkdown), { src: servedVideo, poster: servedPoster });
assert.equal(markdownToPlainExcerpt(servedMarkdown, 'Title'), 'The caption.');
assert.equal(firstMomentVideo('```md\n![Not a video](/clip.mp4)\n```'), null);
assert.deepEqual(firstMomentVideo('![Clip](silan://resources/moment/demo/assets/clip.mov)'), { src: 'silan://resources/moment/demo/assets/clip.mov' });
const servedEditor = buildEditorFromExtensions(defineExtension({
  name: 'silan/served-video-verification', namespace: 'served-verification',
  dependencies: [MdastCommonMarkExtension, MdastExtension, MarkdownMediaExtension],
  $initialEditorState: () => $convertFromMarkdownString(servedMarkdown),
  onError: (error: Error) => { throw error; },
}));
servedEditor.read(() => {
  const node = $getRoot().getFirstDescendant();
  assert.ok($isMarkdownMediaNode(node));
  assert.match(renderToStaticMarkup(node.decorate()), /<video/);
  assert.equal(node.getPoster(), servedPoster);
});
servedEditor.dispose();
console.log('Published video URLs, feed posters and excerpts verified.');
