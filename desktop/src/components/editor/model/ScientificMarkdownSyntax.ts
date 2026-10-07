import type { Extension, Tokenizer } from 'micromark-util-types';
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown';
import type { Options as ToMarkdownExtension } from 'mdast-util-to-markdown';
import type { Literal, Root } from 'mdast';

export interface LatexNode extends Literal {
  type: 'silanLatex';
  display: boolean;
}
export interface MermaidAstNode extends Literal {
  type: 'silanMermaid';
  lang: string;
  meta?: string | null;
}
declare module 'micromark-util-types' {
  interface TokenTypeMap { silanLatex: 'silanLatex'; silanLatexData: 'silanLatexData' }
}
declare module 'mdast' {
  interface PhrasingContentMap { silanLatex: LatexNode }
  interface RootContentMap { silanLatex: LatexNode; silanMermaid: MermaidAstNode }
  interface BlockContentMap { silanMermaid: MermaidAstNode }
}

// Tokenize before CommonMark's backslash escapes. Code spans/fences remain opaque,
// and positions still refer to the original source (no regex preprocessing).
const tokenizeLatex: Tokenizer = function(effects, ok, nok) {
  let closing = 0;
  const start: ReturnType<Tokenizer> = (code) => {
    if (code !== 92) return nok(code);
    effects.enter('silanLatex');
    effects.consume(code);
    return opener;
  };
  const opener: ReturnType<Tokenizer> = (code) => {
    if (code !== 40 && code !== 91) return nok(code);
    closing = code === 40 ? 41 : 93;
    effects.consume(code);
    return body;
  };
  const body: ReturnType<Tokenizer> = (code) => {
    if (code === null) return nok(code);
    if (code === -5 || code === -4 || code === -3) {
      effects.enter('lineEnding'); effects.consume(code); effects.exit('lineEnding');
    } else { effects.enter('silanLatexData'); effects.consume(code); effects.exit('silanLatexData'); }
    return code === 92 ? afterSlash : body;
  };
  const afterSlash: ReturnType<Tokenizer> = (code) => {
    if (code === closing) {
      effects.enter('silanLatexData'); effects.consume(code); effects.exit('silanLatexData');
      effects.exit('silanLatex');
      return ok;
    }
    // A doubled slash belongs to TeX, never to the closing delimiter.
    if (code === 92) { effects.enter('silanLatexData'); effects.consume(code); effects.exit('silanLatexData'); return body; }
    return body(code);
  };
  return start;
};

export const latexSyntax: Extension = {
  text: { 92: { name: 'silanLatex', tokenize: tokenizeLatex } },
};

export const scientificFromMarkdown: FromMarkdownExtension = {
  enter: {
    silanLatex(token) {
      const raw = this.sliceSerialize(token);
      this.enter({ type: 'silanLatex', display: raw[1] === '[', value: raw.slice(2, -2) }, token);
    },
  },
  exit: { silanLatex(token) { this.exit(token); } },
  transforms: [(tree: Root) => {
    const visit = (node: Root | Root['children'][number]) => {
      if (node.type === 'code' && node.lang?.toLowerCase() === 'mermaid') {
        // Preserve ordinary code's official Lexical importer and fence semantics.
        Object.assign(node, { type: 'silanMermaid' });
      }
      if ('children' in node) node.children.forEach((child) => visit(child as Root['children'][number]));
    };
    visit(tree);
  }],
};

export const scientificToMarkdown: ToMarkdownExtension = {
  handlers: {
    silanLatex(node) {
      return node.display ? `\\[${node.value}\\]` : `\\(${node.value}\\)`;
    },
    silanMermaid(node, parent, state, info) {
      return state.handle({ ...node, type: 'code' }, parent, state, info);
    },
  },
};
