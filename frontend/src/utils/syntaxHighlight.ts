type TokenRule = {
  className: string;
  pattern: RegExp;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const keywordPattern = (words: string[]): RegExp =>
  new RegExp(`^(?:${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=\\b)`);

const bashRules: TokenRule[] = [
  { className: 'comment', pattern: /^#.*/ },
  { className: 'string', pattern: /^"(?:\\.|[^"\\])*"|^'(?:\\.|[^'\\])*'|^`(?:\\.|[^`\\])*`/ },
  { className: 'variable', pattern: /^\$\{?[A-Za-z_][\w]*\}?|^\$[0-9@*#$?!-]/ },
  {
    className: 'keyword',
    pattern: keywordPattern([
      'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done',
      'case', 'esac', 'in', 'function', 'select', 'time', 'coproc',
    ]),
  },
  {
    className: 'builtin',
    pattern: keywordPattern([
      'alias', 'bg', 'cd', 'command', 'echo', 'eval', 'exec', 'export', 'fg',
      'jobs', 'let', 'local', 'printf', 'pwd', 'read', 'readonly', 'return',
      'set', 'shift', 'source', 'test', 'trap', 'type', 'ulimit', 'unset',
    ]),
  },
  { className: 'number', pattern: /^\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)\b/ },
  { className: 'operator', pattern: /^(?:&&|\|\||>>?|<<|[|&;=<>!])/ },
  { className: 'parameter', pattern: /^-{1,2}[\w-]+/ },
  { className: 'function', pattern: /^[A-Za-z_./-][\w./-]*(?=\s|$)/ },
];

const cRules: TokenRule[] = [
  { className: 'comment', pattern: /^\/\/.*|^\/\*[\s\S]*?\*\// },
  { className: 'string', pattern: /^"(?:\\.|[^"\\])*"|^'(?:\\.|[^'\\])*'/ },
  {
    className: 'keyword',
    pattern: keywordPattern([
      'auto', 'break', 'case', 'const', 'continue', 'default', 'do', 'else',
      'enum', 'extern', 'for', 'goto', 'if', 'inline', 'register', 'restrict',
      'return', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union',
      'volatile', 'while',
    ]),
  },
  {
    className: 'type',
    pattern: keywordPattern([
      'bool', 'char', 'double', 'float', 'int', 'long', 'short', 'signed',
      'size_t', 'ssize_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
      'unsigned', 'void',
    ]),
  },
  { className: 'number', pattern: /^\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:[uUlLfF]+)?)\b/ },
  { className: 'function', pattern: /^[A-Za-z_]\w*(?=\s*\()/ },
  { className: 'operator', pattern: /^(?:->|\+\+|--|==|!=|<=|>=|&&|\|\||<<|>>|[+\-*/%=&|^~!<>?:])/ },
  { className: 'punctuation', pattern: /^[{}()[\],.;]/ },
];

const rustRules: TokenRule[] = [
  { className: 'comment', pattern: /^\/\/.*|^\/\*[\s\S]*?\*\// },
  { className: 'string', pattern: /^r#*"(?:[\s\S]*?)"#*|^"(?:\\.|[^"\\])*"|^'(?:\\.|[^'\\])+'/ },
  {
    className: 'keyword',
    pattern: keywordPattern([
      'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn',
      'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in',
      'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return',
      'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type',
      'unsafe', 'use', 'where', 'while',
    ]),
  },
  {
    className: 'type',
    pattern: keywordPattern([
      'bool', 'char', 'f32', 'f64', 'i8', 'i16', 'i32', 'i64', 'i128',
      'isize', 'str', 'String', 'u8', 'u16', 'u32', 'u64', 'u128',
      'usize', 'Vec', 'Option', 'Result',
    ]),
  },
  { className: 'number', pattern: /^\b(?:0x[\da-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?)(?:[iu](?:8|16|32|64|128|size)|f(?:32|64))?\b/ },
  { className: 'lifetime', pattern: /^'[A-Za-z_]\w*/ },
  { className: 'macro', pattern: /^[A-Za-z_]\w*!/ },
  { className: 'function', pattern: /^[A-Za-z_]\w*(?=\s*\()/ },
  { className: 'operator', pattern: /^(?:=>|->|::|\.\.|==|!=|<=|>=|&&|\|\||[+\-*/%=&|^~!<>?:])/ },
  { className: 'punctuation', pattern: /^[{}()[\],.;]/ },
];

const pythonRules: TokenRule[] = [
  { className: 'comment', pattern: /^#.*/ },
  { className: 'string', pattern: /^(?:[rRuUbBfF]{0,2})("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/ },
  {
    className: 'keyword',
    pattern: keywordPattern([
      'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
      'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
      'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
      'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
      'while', 'with', 'yield',
    ]),
  },
  {
    className: 'builtin',
    pattern: keywordPattern([
      'dict', 'enumerate', 'float', 'int', 'len', 'list', 'map', 'open',
      'print', 'range', 'set', 'str', 'sum', 'tuple', 'zip',
    ]),
  },
  { className: 'number', pattern: /^\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)\b/ },
  { className: 'decorator', pattern: /^@[A-Za-z_]\w*/ },
  { className: 'function', pattern: /^[A-Za-z_]\w*(?=\s*\()/ },
  { className: 'operator', pattern: /^(?:==|!=|<=|>=|\/\/|\*\*|:=|[+\-*/%=&|^~!<>?:])/ },
  { className: 'punctuation', pattern: /^[{}()[\],.;]/ },
];

const languageRules: Record<string, TokenRule[]> = {
  bash: bashRules,
  sh: bashRules,
  shell: bashRules,
  zsh: bashRules,
  c: cRules,
  h: cRules,
  rust: rustRules,
  rs: rustRules,
  python: pythonRules,
  py: pythonRules,
};

const aliases: Record<string, string> = {
  bash: 'bash',
  c: 'c',
  h: 'c',
  py: 'python',
  python: 'python',
  rs: 'rust',
  rust: 'rust',
  shell: 'bash',
  sh: 'bash',
  zsh: 'bash',
};

export const normalizeCodeLanguage = (language?: string): string => {
  const raw = (language || '').toLowerCase().trim().replace(/^language-/, '');
  return aliases[raw] || raw;
};

export const inferCodeLanguage = (code: string): string => {
  const text = code.trim();
  if (!text) return '';
  if (/^\s*(fn|use|impl|pub|let\s+mut|match)\b/m.test(text)) return 'rust';
  if (/^\s*(#include|int\s+main|typedef|struct\s+\w+\s*\{|void\s+\w+\s*\()/m.test(text)) return 'c';
  if (/^\s*(def|class|import|from|async\s+def)\b/m.test(text)) return 'python';
  if (/^\s*(?:\$|[A-Za-z_./-][\w./-]*(?:\s+|$))/m.test(text) && !/[{};]/.test(text)) return 'bash';
  return '';
};

export const codeLanguageClass = (language?: string): string => {
  const normalized = normalizeCodeLanguage(language);
  return normalized ? `language-${normalized}` : '';
};

export const highlightCodeToHtml = (code: string, language?: string): string => {
  const normalized = normalizeCodeLanguage(language) || inferCodeLanguage(code);
  const rules = languageRules[normalized];
  if (!rules) return escapeHtml(code);

  let html = '';
  let rest = code;

  while (rest.length > 0) {
    const whitespace = rest.match(/^\s+/)?.[0];
    if (whitespace) {
      html += escapeHtml(whitespace);
      rest = rest.slice(whitespace.length);
      continue;
    }

    const token = rules
      .map((rule) => ({ rule, match: rest.match(rule.pattern)?.[0] }))
      .find((entry) => entry.match);

    if (token?.match) {
      html += `<span class="token ${token.rule.className}">${escapeHtml(token.match)}</span>`;
      rest = rest.slice(token.match.length);
      continue;
    }

    html += escapeHtml(rest[0]);
    rest = rest.slice(1);
  }

  return html;
};

export const highlightCodeElement = (codeElement: HTMLElement) => {
  const explicitLanguage = Array.from(codeElement.classList)
    .find((className) => className.startsWith('language-'))
    ?.replace(/^language-/, '');
  const preLanguage = Array.from(codeElement.parentElement?.classList || [])
    .find((className) => className.startsWith('language-'))
    ?.replace(/^language-/, '');
  const raw = codeElement.textContent || '';
  const language = normalizeCodeLanguage(explicitLanguage || preLanguage) || inferCodeLanguage(raw);
  const highlightKey = `${language}:${raw}`;
  if (!languageRules[language]) return;
  if (
    codeElement.dataset.syntaxHighlighted === highlightKey &&
    codeElement.querySelector('.token')
  ) {
    return;
  }

  codeElement.classList.add(`language-${language}`);
  codeElement.parentElement?.classList.add(`language-${language}`);
  codeElement.innerHTML = highlightCodeToHtml(raw, language);
  codeElement.dataset.syntaxHighlighted = highlightKey;
};
