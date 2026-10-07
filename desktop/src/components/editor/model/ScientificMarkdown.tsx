import { numberedEquation, useMediaReferences } from '../media/MediaReferences';
import React from 'react';
import katex from 'katex';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLexicalEditable } from '@lexical/react/useLexicalEditable';
import {
  $applyNodeReplacement, $getNodeByKey, DecoratorNode, configExtension, defineExtension,
  type NodeKey, type SerializedLexicalNode, type Spread,
} from 'lexical';
import { MdastImportExtension, type MdastNode } from '@lexical/mdast';
import { math } from 'micromark-extension-math';
import { mathFromMarkdown, mathToMarkdown } from 'mdast-util-math';
import { latexSyntax, scientificFromMarkdown, scientificToMarkdown } from './ScientificMarkdownSyntax';

export type ScientificData = {
  syntax: 'math' | 'inlineMath' | 'silanLatex' | 'silanMermaid';
  value: string;
  display: boolean;
  meta?: string | null;
  lang?: string;
};
type SerializedScientificNode = Spread<ScientificData, SerializedLexicalNode>;

export function MathPreview({ value, display }: { value: string; display: boolean }) {
  const result = React.useMemo(() => {
    try {
      return { html: katex.renderToString(value, {
        displayMode: display, throwOnError: true, trust: false, strict: 'ignore',
        maxExpand: 1000, maxSize: 20, output: 'htmlAndMathml',
      }) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Invalid formula' };
    }
  }, [value, display]);
  return result.html !== undefined
    ? <span className="scientific-math-preview" dangerouslySetInnerHTML={{ __html: result.html }} />
    : <span role="status" className="scientific-error" title={result.error}>Formula error: <code>{value}</code></span>;
}

let mermaidRuntime: Promise<typeof import('mermaid')['default']> | undefined;
function loadMermaid() {
  return mermaidRuntime ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
      maxTextSize: 50000, flowchart: { htmlLabels: false } });
    return mermaid;
  }).catch((error) => { mermaidRuntime = undefined; throw error; });
}
let diagramSequence = 0;
function MermaidPreview({ value }: { value: string }) {
  const [result, setResult] = React.useState<{ source: string; svg?: string; error?: string }>();
  React.useEffect(() => {
    let cancelled = false;
    const id = `silan-mermaid-${++diagramSequence}`;
    // Debounce source editing; the library loads only when a diagram is present.
    const timer = window.setTimeout(() => {
      void loadMermaid().then((mermaid) => mermaid.render(id, value)).then(({ svg }) => {
        if (!cancelled) setResult({ source: value, svg });
      }).catch((error) => {
        if (!cancelled) setResult({ source: value, error: String(error) });
      });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [value]);
  if (result?.source !== value) return <span role="status">Rendering diagram…</span>;
  if (result.error) return <span role="status" className="scientific-error">Diagram error: {result.error}</span>;
  return <span className="scientific-diagram-preview" role="img" aria-label="Mermaid diagram"
    dangerouslySetInnerHTML={{ __html: result.svg || '' }} />;
}

function ScientificView({ data, nodeKey }: { data: ScientificData; nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const [editing, setEditing] = React.useState(false);
  const diagram = data.syntax === 'silanMermaid';
  const equation = numberedEquation(data.value, useMediaReferences());
  return <span data-vml-label={equation.id} className={`scientific-content${data.display ? ' scientific-content--display' : ''}`}>
    {diagram ? <MermaidPreview value={data.value} /> : <MathPreview value={equation.source} display={data.display} />}
    {editable && <button type="button" className="scientific-edit" aria-label={diagram ? 'Edit diagram' : 'Edit formula'}
      onClick={() => setEditing(!editing)}>{editing ? 'Done' : diagram ? 'Edit diagram' : 'Edit formula'}</button>}
    {editable && editing && <textarea aria-label={diagram ? 'Mermaid source' : 'LaTeX source'}
      className="scientific-source" value={data.value} rows={data.display ? 5 : 2}
      onKeyDown={(event) => event.stopPropagation()}
      onChange={(event) => {
        const value = event.target.value;
        editor.update(() => {
          const node = $getNodeByKey(nodeKey);
          if (node instanceof ScientificMarkdownNode) node.setValue(value);
        });
      }} />}
  </span>;
}

export class ScientificMarkdownNode extends DecoratorNode<React.ReactNode> {
  __data: ScientificData;
  static getType() { return 'scientific-markdown'; }
  static clone(node: ScientificMarkdownNode) { return new ScientificMarkdownNode(node.__data, node.__key); }
  static importJSON(serialized: SerializedScientificNode) {
    const { syntax, value, display, meta, lang } = serialized;
    return new ScientificMarkdownNode({ syntax, value, display, meta, lang });
  }
  constructor(data: ScientificData, key?: NodeKey) { super(key); this.__data = { ...data }; }
  exportJSON(): SerializedScientificNode { return { ...super.exportJSON(), ...this.__data, type: 'scientific-markdown', version: 1 }; }
  createDOM() {
    const element = document.createElement(this.isInline() ? 'span' : 'div');
    element.className = 'lexical-scientific-node';
    return element;
  }
  updateDOM() { return false; }
  isInline() { return this.__data.syntax === 'inlineMath' || this.__data.syntax === 'silanLatex'; }
  getTextContent() { return this.__data.value; }
  getData() { return this.getLatest().__data; }
  setValue(value: string) { this.getWritable().__data = { ...this.getLatest().__data, value }; }
  decorate() { return <ScientificView data={this.__data} nodeKey={this.__key} />; }
}

export const ScientificMarkdownExtension = defineExtension({
  name: 'silan/scientific-markdown',
  nodes: [ScientificMarkdownNode],
  dependencies: [configExtension(MdastImportExtension, {
    micromarkExtensions: [math(), latexSyntax],
    mdastExtensions: [mathFromMarkdown(), scientificFromMarkdown],
    toMarkdownExtensions: [mathToMarkdown(), scientificToMarkdown],
    inlineShortcutTypes: ['inlineMath', 'silanLatex'],
    inlineShortcutTriggers: ['$', ')', ']'],
    importRules: ['math', 'inlineMath', 'silanLatex', 'silanMermaid'].map((type) => ({
      type,
      $import: (node: MdastNode) => {
        const ast = node as MdastNode & { value: string; display?: boolean; meta?: string | null; lang?: string };
        return $applyNodeReplacement(new ScientificMarkdownNode({
          syntax: type as ScientificData['syntax'], value: ast.value,
          display: type === 'math' || type === 'silanMermaid' || !!ast.display,
          meta: ast.meta, lang: ast.lang,
        }));
      },
    })),
    exportRules: [{ type: 'scientific-markdown', $export: (node) => {
      if (!(node instanceof ScientificMarkdownNode)) return null;
      const { syntax, ...data } = node.getData();
      return { type: syntax, ...data } as MdastNode;
    } }],
  })],
});
