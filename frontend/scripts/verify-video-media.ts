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
