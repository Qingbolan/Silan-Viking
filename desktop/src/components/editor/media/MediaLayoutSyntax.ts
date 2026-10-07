import type { Extension, Tokenizer } from 'micromark-util-types';
import { findV2Blocks } from './upstream/src/format/v2';
declare module 'micromark-util-types' { interface TokenTypeMap { silanMediaBlock: 'silanMediaBlock'; silanMediaData: 'silanMediaData' } }
/** Consume a complete root block before CommonMark assigns its closing comment to a list. */
const tokenize: Tokenizer = function(effects, ok, nok) {
  let line = '', lines: string[] = [], prototype = false;
  const start: ReturnType<Tokenizer> = code => {
    if (code !== 60 || this.now().column !== 1) return nok(code);
    effects.enter('silanMediaBlock');
    return content(code);
  };
  const content: ReturnType<Tokenizer> = code => {
    if (code === null || code === -5 || code === -4 || code === -3) {
      if (!lines.length) {
        if (!/^<!-- (?:vml(?:\s.*)?|silan-media\s.*)-->\s*$/.test(line)) return nok(code);
        prototype = line.startsWith('<!-- silan-media');
      }
      lines.push(line);
      if (lines.length > 1 && line.trim() === (prototype ? '<!-- /silan-media -->' : '<!-- /vml -->')) {
        const blocks = prototype ? null : findV2Blocks(lines);
        if (prototype || blocks?.some(block => block.openLine === 0 && block.closeLine === lines.length - 1)) {
          effects.exit('silanMediaBlock'); return ok(code);
        }
      }
      if (code === null) return nok(code);
      effects.enter('lineEnding'); effects.consume(code); effects.exit('lineEnding');
      line = ''; return content;
    }
    line += code === -2 ? '\t' : code === -1 ? '' : String.fromCodePoint(code);
    effects.enter('silanMediaData'); effects.consume(code); effects.exit('silanMediaData');
    return content;
  };
  return start;
};
export const mediaLayoutSyntax: Extension = { flow: { 60: { name: 'silanMediaBlock', concrete: true, tokenize } } };
