import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $applyNodeReplacement, $getRoot, $isTextNode, DecoratorNode, TextNode, type NodeKey, type SerializedLexicalNode } from 'lexical';
import { $convertToMarkdownString } from '@lexical/mdast';
import { collectRefs, captionText, equationLabel, refText, type RefIndex, type RefLanguage } from './upstream/src/markdown/crossref';
import { readMediaSettings } from './MediaLayoutSettings';

const Context = React.createContext<{ index: RefIndex; language: RefLanguage } | null>(null);
export function useMediaReferences() { return React.useContext(Context); }
export function MediaReferenceProvider({ children }: { children: React.ReactNode }) {
  const [editor] = useLexicalComposerContext();
  const parent = useMediaReferences();
  const [index, setIndex] = React.useState(() => collectRefs([]));
  const [language, setLanguage] = React.useState<RefLanguage>('en');
  React.useEffect(() => {
    if (parent) return;
    const update = () => {
      const next = editor.read(() => collectRefs($convertToMarkdownString().split('\n')));
      setIndex((current) => current.signature === next.signature ? current : next);
    };
    const settings = () => {
      const language = readMediaSettings().refLanguage;
      setLanguage(language === 'auto' ? navigator.language.startsWith('zh') ? 'zh' : 'en' : language);
    };
    settings(); update();
    window.addEventListener('silan-media-settings', settings);
    const unregister = editor.registerUpdateListener(update);
    return () => { unregister(); window.removeEventListener('silan-media-settings', settings); };
  }, [editor, parent]);
  React.useEffect(() => editor.registerNodeTransform(TextNode, (node) => {
    if (node.getType() !== 'text' || node.hasFormat('code') || node.getParents().some((parent) => parent.getType() === 'code')) return;
    const text = node.getTextContent();
    const token = /\{#((?:fig|tbl):[\w][\w.:-]*[\w]|(?:fig|tbl):\w)\}|(?<![\w@\\/])@((?:fig|tbl|eq):[\w][\w.:-]*[\w]|(?:fig|tbl|eq):\w)/.exec(text);
    if (!token) return;
    const start = token.index, end = start + token[0].length;
    const parts = node.splitText(start, end);
    const match = parts[start ? 1 : 0];
    if (match) match.replace($applyNodeReplacement(new MediaReferenceNode(token[0])));
  }), [editor]);
  return <Context.Provider value={parent || { index, language }}>{children}</Context.Provider>;
}
export function ReferenceLabel({ raw }: { raw: string }) {
  const refs = useMediaReferences();
  const label = raw.startsWith('{#'), id = label ? raw.slice(2, -1) : raw.slice(1);
  const target = refs?.index.targets.get(id);
  const text = target && refs ? label ? captionText(target, refs.language) : refText(target, refs.language) : raw;
  const anchor = React.useRef<HTMLSpanElement>(null);
  const [prefixed, setPrefixed] = React.useState(false);
  React.useLayoutEffect(() => {
    if (!label || !target) { setPrefixed(false); return; }
    const paragraph = anchor.current?.closest('p');
    if (!paragraph || anchor.current?.closest('figcaption')) { setPrefixed(false); return; }
    paragraph.dataset.vmlCaption = text;
    paragraph.classList.add('vml-numbered-caption');
    setPrefixed(true);
    return () => { delete paragraph.dataset.vmlCaption; paragraph.classList.remove('vml-numbered-caption'); };
  }, [label, text, target]);
  return label ? <span ref={anchor} className="vml-reference-label" data-vml-label={id} style={prefixed ? { fontSize: 0 } : undefined}>{text}</span>
    : <button className="vml-reference" type="button" title={id} onClick={(event) => {
      let root: Element | Document = event.currentTarget.closest('.novel-editor') || document;
      while (root instanceof Element && root.parentElement?.closest('.novel-editor')) root = root.parentElement.closest('.novel-editor')!;
      const target = Array.from(root.querySelectorAll<HTMLElement>('[data-vml-label]')).find((node) => node.dataset.vmlLabel === id);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }}>{text}</button>;
}
export function MediaCaption({ text }: { text: string }) {
  const match = /\s*\{#((?:fig|tbl):[\w.:-]+)\}\s*$/.exec(text);
  return match ? <><ReferenceLabel raw={`{#${match[1]}}`} /> {text.slice(0, match.index)}</> : <>{text}</>;
}
export function numberedEquation(source: string, refs: ReturnType<typeof useMediaReferences>) {
  const id = equationLabel(source), target = id && refs?.index.targets.get(id);
  return target ? { id, source: source.replace(/\\label\{eq:[^}]+\}/g, '') + (/\\tag\{/.test(source) ? '' : `\\tag{${target.number}}`) } : { id, source };
}
export class MediaReferenceNode extends DecoratorNode<React.ReactNode> {
  __raw: string;
  static getType() { return 'media-reference'; }
  static clone(node: MediaReferenceNode) { return new MediaReferenceNode(node.__raw, node.__key); }
  constructor(raw: string, key?: NodeKey) { super(key); this.__raw = raw; }
  static importJSON(data: SerializedLexicalNode & { raw: string }) { return new MediaReferenceNode(data.raw); }
  exportJSON() { return { ...super.exportJSON(), type: 'media-reference', version: 1, raw: this.__raw }; }
  createDOM() { return document.createElement('span'); }
  updateDOM() { return false; }
  isInline() { return true; }
  getTextContent() { return this.__raw; }
  decorate() { return <ReferenceLabel raw={this.__raw} />; }
}
