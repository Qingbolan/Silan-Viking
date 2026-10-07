import React from 'react';
import type { LexicalEditor } from 'lexical';
export const MediaColumnDragContext = React.createContext<{ editor: LexicalEditor; layoutKey: string; source: string; column: string; side: 'left' | 'right'; enabled: boolean } | null>(null);
