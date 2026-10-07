import type React from 'react';
import type {
  AnyLexicalExtensionArgument,
  Klass,
  LexicalEditor,
  LexicalNode,
  PointType,
} from 'lexical';
import type { LucideIcon } from 'lucide-react';
import type { LanguageAuditFinding } from '../../types';

export type EditorReviewFinding = LanguageAuditFinding & {
  id: string;
};

export type MarkdownSelectionAssistAction =
  | 'agent_edit'
  | 'optimize_expression'
  | 'comment_issue';

export type MarkdownSelectionAssistRequest = {
  action: MarkdownSelectionAssistAction;
  selectedText: string;
  beforeContext: string;
  afterContext: string;
  instruction?: string;
};

export type MarkdownSelectionAssistResult = {
  replacement?: string;
  comment?: string;
};

export type MarkdownImageImport = {
  alt: string;
  src: string;
  title?: string | null;
};

export type MarkdownImageImporter = (
  files: readonly File[],
) => Promise<readonly MarkdownImageImport[]>;

export type MarkdownSelectionRange = {
  anchorKey: string;
  anchorOffset: number;
  anchorType: PointType['type'];
  focusKey: string;
  focusOffset: number;
  focusType: PointType['type'];
};

export type MarkdownCommandContext = {
  editor: LexicalEditor;
  range: MarkdownSelectionRange;
  deleteTrigger: () => void;
  insertMarkdown: (markdown: string) => void;
};

export type SlashCommandDefinition = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  run: (context: MarkdownCommandContext) => void;
};

export type MarkdownEditorPluginContext = {
  readOnly: boolean;
};

/**
 * Capability contribution for the Lexical composition root.
 *
 * Nodes and extensions are registered before the editor is constructed;
 * React components are mounted inside the same composer. This keeps schema,
 * behavior, and UI ownership together without exposing Lexical internals to
 * the MarkdownEditor component.
 */
export type MarkdownEditorPlugin = {
  id: string;
  priority?: number;
  nodes?: readonly Klass<LexicalNode>[];
  extensions?: readonly AnyLexicalExtensionArgument[];
  slashCommands?: readonly SlashCommandDefinition[];
  Component?: React.ComponentType<MarkdownEditorPluginContext>;
};

/** Immutable, precompiled contributions shared by the document and UI hosts. */
export class LexicalEditorPluginRegistry {
  readonly #nodes: Klass<LexicalNode>[];
  readonly #extensions: AnyLexicalExtensionArgument[];
  readonly #commands: SlashCommandDefinition[];
  readonly #components: { id: string; Component: React.ComponentType<MarkdownEditorPluginContext> }[];

  constructor(plugins: readonly MarkdownEditorPlugin[]) {
    const pluginIds = new Set<string>();
    for (const plugin of plugins) {
      if (pluginIds.has(plugin.id)) {
        throw new Error(`Duplicate Markdown editor plugin: ${plugin.id}`);
      }
      pluginIds.add(plugin.id);
    }
    const ordered = [...plugins].sort(
      (left, right) => (right.priority || 0) - (left.priority || 0),
    );
    this.#nodes = ordered.flatMap((plugin) => plugin.nodes || []);
    this.#extensions = ordered.flatMap((plugin) => plugin.extensions || []);
    this.#commands = ordered.flatMap((plugin) => plugin.slashCommands || []);
    this.#components = ordered.flatMap((plugin) => (
      plugin.Component ? [{ id: plugin.id, Component: plugin.Component }] : []
    ));
    validateCommandIds(this.#commands);
    Object.freeze(this.#nodes);
    Object.freeze(this.#extensions);
    Object.freeze(this.#commands);
    Object.freeze(this.#components);
  }

  nodes() { return this.#nodes; }
  extensions() { return this.#extensions; }
  slashCommands() { return this.#commands; }
  components() { return this.#components; }

  /** Built-ins first, plugin contributions in priority order, host commands last. */
  composeCommands(
    builtins: readonly SlashCommandDefinition[],
    hostCommands: readonly SlashCommandDefinition[],
  ): SlashCommandDefinition[] {
    const commands = [...builtins, ...this.#commands, ...hostCommands];
    validateCommandIds(commands);
    return commands;
  }
}

function validateCommandIds(commands: readonly SlashCommandDefinition[]) {
  const ids = new Set<string>();
  for (const command of commands) {
    if (ids.has(command.id)) throw new Error(`Duplicate slash command: ${command.id}`);
    ids.add(command.id);
  }
}
