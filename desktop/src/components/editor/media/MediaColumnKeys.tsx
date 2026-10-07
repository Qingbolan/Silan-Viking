import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, $getSelection, $isRangeSelection, $isTextNode, COMMAND_PRIORITY_HIGH, INDENT_CONTENT_COMMAND, OUTDENT_CONTENT_COMMAND, KEY_DOWN_COMMAND, HISTORY_PUSH_TAG } from 'lexical';
import { INSERT_CHECK_LIST_COMMAND } from '@lexical/list';
import type { MarkdownEditorPlugin } from '../extensionPoints';
import { useMediaWorkspace } from './MediaEnvironment';
import { $createMediaWikiLink } from './MediaWikiLink';
import { linkQueryAt } from './upstream/src/markdown/columnEditing';
import type { MediaNoteLink } from './MediaWorkspace';
type Query = { key: string; text: string; from: number; to: number; items: MediaNoteLink[] };
function MediaColumnKeys() {
  const [editor] = useLexicalComposerContext();
  const workspace = useMediaWorkspace();
  const [query, setQuery] = React.useState<Query | null>(null);
  const [index, setIndex] = React.useState(0);
  const current = React.useRef({ query, index }); current.current = { query, index };
  const choose = React.useCallback((entry: Query, item: MediaNoteLink) => {
    editor.update(() => {
      const node = $getNodeByKey(entry.key);
      if (!$isTextNode(node) || node.getTextContent() !== entry.text) return;
      node.select(entry.from, entry.to).insertNodes([$createMediaWikiLink(`[[${item.path}|${item.title.replace(/[\]|]/g, '')}]]`)]);
    }, { discrete: true, tag: HISTORY_PUSH_TAG });
    setQuery(null);
  }, [editor]);
  React.useEffect(() => editor.registerUpdateListener(() => {
    const next = editor.read((): Query | null => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
      const node = selection.anchor.getNode();
      if (!$isTextNode(node) || node.hasFormat('code')) return null;
      const text = node.getTextContent(), found = linkQueryAt(text, selection.anchor.offset);
      if (!found || found.embed) return null;
      const items = workspace?.searchLinks?.(found.text) || [];
      return items.length ? { key: node.getKey(), text, from: found.from, to: found.to, items } : null;
    });
    setQuery(next); setIndex(0);
  }), [editor, workspace]);
  React.useEffect(() => editor.registerCommand(KEY_DOWN_COMMAND, event => {
    if (event.isComposing || !editor.isEditable()) return false;
    const { query, index } = current.current;
    if (query && ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Escape') setQuery(null);
      else if (event.key === 'Enter') choose(query, query.items[index]);
      else setIndex((index + (event.key === 'ArrowUp' ? -1 : 1) + query.items.length) % query.items.length);
      return true;
    }
    if (event.key === 'Tab') { event.preventDefault(); editor.dispatchCommand(event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND, undefined); return true; }
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'l') { event.preventDefault(); editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined); return true; }
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
    const node = selection.anchor.getNode(), offset = selection.anchor.offset;
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
    if (!$isTextNode(node)) {
      if (!pairs[event.key]) return false;
      event.preventDefault(); selection.insertText(event.key + pairs[event.key]);
      const next = $getSelection();
      if ($isRangeSelection(next) && $isTextNode(next.anchor.getNode())) (next.anchor.getNode() as import('lexical').TextNode).select(next.anchor.offset - 1, next.anchor.offset - 1);
      return true;
    }
    if (node.hasFormat('code')) return false;
    const text = node.getTextContent();
    if (Object.values(pairs).includes(event.key) && text[offset] === event.key) { event.preventDefault(); node.select(offset + 1, offset + 1); return true; }
    if (event.key === 'Backspace' && offset > 0 && pairs[text[offset - 1]] && pairs[text[offset - 1]] === text[offset]) { event.preventDefault(); node.spliceText(offset - 1, 2, ''); node.select(offset - 1, offset - 1); return true; }
    const closing = pairs[event.key];
    if (closing && (!text[offset] || /[\s\])}]/.test(text[offset])) && (event.key !== "'" || !/\w/.test(text[offset - 1] || ''))) {
      event.preventDefault(); node.spliceText(offset, 0, event.key + closing); node.select(offset + 1, offset + 1); return true;
    }
    return false;
  }, COMMAND_PRIORITY_HIGH), [editor, choose]);
  return query ? <div className="vml-link-suggest" role="listbox" aria-label="Note links">{query.items.map((item, at) => <button key={item.path} role="option" aria-selected={at === index} onMouseDown={event => event.preventDefault()} onClick={() => choose(query, item)}>{item.title}<small>{item.path}</small></button>)}</div> : null;
}
export const mediaColumnPlugins: MarkdownEditorPlugin[] = [{ id: 'silan/media-column-keys', Component: MediaColumnKeys }];
