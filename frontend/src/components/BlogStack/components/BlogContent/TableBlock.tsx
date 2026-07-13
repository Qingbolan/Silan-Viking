import React from 'react';
import Markdown from '../../../ui/Markdown';

export interface TableBlockProps {
  header: React.ReactNode[];
  rows: React.ReactNode[][];
}

const TableBlock: React.FC<TableBlockProps> = ({ header, rows }) => {
  const renderCell = (content: React.ReactNode) => {
    if (typeof content !== 'string') return content;
    return <Markdown inline>{content}</Markdown>;
  };

  return (
    <div className="not-prose my-6 overflow-auto rounded-xl border border-theme-card-border bg-theme-surface-elevated shadow-medium">
      <table className="w-full text-sm">
        {header.length > 0 && (
          <thead className="sticky top-0 z-10 bg-theme-surface-secondary">
            <tr className="border-b border-theme-card-border">
              {header.map((h, i) => (
                <th
                  key={`th-${i}`}
                  className="whitespace-nowrap border border-theme-card-border px-4 py-2 text-left align-top font-semibold"
                >
                  <div className="flex items-center gap-2">{renderCell(h)}</div>
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, r) => (
            <tr
              key={`tr-${r}`}
              className={`border-b border-theme-card-border last:border-0 hover:bg-theme-surface-tertiary/40 ${r % 2 === 1 ? 'bg-theme-surface/60' : ''}`}
            >
              {row.map((cell, c) => (
                <td
                  key={`td-${r}-${c}`}
                  className="whitespace-pre-wrap border border-theme-card-border px-4 py-2 align-top"
                >
                  {renderCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TableBlock;
