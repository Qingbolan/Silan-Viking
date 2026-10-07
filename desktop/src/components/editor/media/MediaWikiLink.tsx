import type { Literal } from 'mdast';
import React from 'react';
import { $applyNodeReplacement, DecoratorNode, type NodeKey, type SerializedLexicalNode } from 'lexical';
import type { Extension, Tokenizer } from 'micromark-util-types';
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown';
import { useMediaWorkspace } from './MediaEnvironment';
declare module 'micromark-util-types' { interface TokenTypeMap { mediaWiki: 'mediaWiki' } }
interface WikiAst extends Literal { type: 'mediaWiki'; value: string }
declare module 'mdast' { interface PhrasingContentMap { mediaWiki: WikiAst } interface RootContentMap { mediaWiki: WikiAst } }
const tokenize: Tokenizer = function(effects, ok, nok) {
  let raw = '';
  const start: ReturnType<Tokenizer> = code => { effects.enter('mediaWiki'); return body(code); };
  const body: ReturnType<Tokenizer> = code => {
    if (code === null || code < 0 || raw.length > 4096) return nok(code);
    raw += String.fromCodePoint(code);
    if (raw.length <= 2 && code !== 91) return nok(code);
    effects.consume(code);
    if (raw.endsWith(']]') && raw.length > 4) { effects.exit('mediaWiki'); return ok; }
    return body;
  };
  return start;
};
export const mediaWikiSyntax: Extension = { text: { 91: { name: 'mediaWiki', tokenize } } };
export const mediaWikiFromMarkdown: FromMarkdownExtension = {
  enter: { mediaWiki(token) { this.enter({ type: 'mediaWiki', value: this.sliceSerialize(token) }, token); } },
  exit: { mediaWiki(token) { this.exit(token); } },
};
function WikiLink({ raw }: { raw: string }) {
  const workspace = useMediaWorkspace();
  const [target, alias] = raw.slice(2, -2).split('|');
  return <button className="vml-reference" type="button" title={target} onClick={() => {
    const results = workspace?.searchLinks?.(target.replace(/\.md$/, '')) || [];
    workspace?.openLink?.(results.find(item => item.path === target || item.title === target)?.path || target);
  }}>{alias || target}</button>;
}
export class MediaWikiLinkNode extends DecoratorNode<React.ReactNode> {
  __raw: string;
  static getType() { return 'media-wiki-link'; }
  static clone(node: MediaWikiLinkNode) { return new MediaWikiLinkNode(node.__raw, node.__key); }
  constructor(raw: string, key?: NodeKey) { super(key); this.__raw = raw; }
  static importJSON(data: SerializedLexicalNode & { raw: string }) { return new MediaWikiLinkNode(data.raw); }
  exportJSON() { return { ...super.exportJSON(), type: 'media-wiki-link', version: 1, raw: this.__raw }; }
  createDOM() { return document.createElement('span'); }
  updateDOM() { return false; }
  isInline() { return true; }
  getTextContent() { return this.__raw; }
  decorate() { return <WikiLink raw={this.__raw} />; }
}
export function $createMediaWikiLink(raw: string) { return $applyNodeReplacement(new MediaWikiLinkNode(raw)); }
