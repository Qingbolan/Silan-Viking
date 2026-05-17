// src/views/Gallery/GalleryPrimitives.tsx
//
// Internal building blocks for the /gallery page itself — section frames,
// the demo "stage" each example sits on, the variant grid, and the token
// table. Not part of the public design system; only the gallery uses them.
import React from 'react';
import { cn } from '../../lib/utils';
import { Divider } from '../../components/ds';
import type { TokenRow } from './galleryData';

/* --- GallerySection — one anchored section of the page -------------------- */

export const GallerySection: React.FC<{
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ id, title, description, children }) => (
  <section id={id} className="scroll-mt-24">
    <div className="space-y-1.5">
      <h2 className="text-ds-2xl font-semibold tracking-[-0.02em] text-ds-fg">
        {title}
      </h2>
      <p className="max-w-2xl text-ds-base text-ds-fg-muted leading-relaxed">
        {description}
      </p>
    </div>
    <Divider className="my-5" />
    <div className="space-y-8">{children}</div>
  </section>
);

/* --- Subsection — a labelled example within a section -------------------- */

export const Subsection: React.FC<{
  title: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ title, hint, children }) => (
  <div className="space-y-3">
    <div className="flex items-baseline gap-2">
      <h3 className="text-ds-sm font-semibold text-ds-fg">{title}</h3>
      {hint && <span className="text-ds-xs text-ds-fg-subtle">{hint}</span>}
    </div>
    {children}
  </div>
);

/* --- Stage — the surface a live example is shown on ----------------------- */

export const Stage: React.FC<{
  children: React.ReactNode;
  className?: string;
  /** Use a darker inset surface (helps glass/elevated examples read). */
  inset?: boolean;
}> = ({ children, className, inset = false }) => (
  <div
    className={cn(
      'flex flex-wrap items-center gap-4 rounded-ds-lg p-6 ds-hairline',
      inset ? 'bg-ds-surface-2' : 'bg-ds-canvas',
      className,
    )}
  >
    {children}
  </div>
);

/* --- TokenTable — name / preview / value / usage rows -------------------- */

export const TokenTable: React.FC<{
  rows: TokenRow[];
  /** Optional cell renderer for a visual preview of the token. */
  preview?: (_row: TokenRow) => React.ReactNode;
}> = ({ rows, preview }) => (
  <div className="overflow-hidden rounded-ds-lg ds-hairline">
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="bg-ds-surface-2 text-ds-2xs uppercase tracking-[0.06em] text-ds-fg-subtle">
          {preview && <th className="w-20 px-4 py-2.5 font-medium">Preview</th>}
          <th className="px-4 py-2.5 font-medium">Token</th>
          <th className="px-4 py-2.5 font-medium">Value</th>
          <th className="px-4 py-2.5 font-medium">Usage</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={row.name}
            className={cn(
              'text-ds-sm',
              i !== 0 && 'border-t border-ds-border',
            )}
          >
            {preview && <td className="px-4 py-2.5">{preview(row)}</td>}
            <td className="px-4 py-2.5 font-mono text-ds-xs text-ds-primary">
              {row.name}
            </td>
            <td className="px-4 py-2.5 font-mono text-ds-xs text-ds-fg-muted">
              {row.value}
            </td>
            <td className="px-4 py-2.5 text-ds-fg-muted">{row.usage}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/* --- CodeSnippet — a copyable usage example ------------------------------ */

export const CodeSnippet: React.FC<{ code: string }> = ({ code }) => (
  <pre className="overflow-x-auto rounded-ds-md bg-ds-surface-3 p-4 ds-hairline">
    <code className="font-mono text-ds-xs leading-relaxed text-ds-fg-muted">
      {code}
    </code>
  </pre>
);
