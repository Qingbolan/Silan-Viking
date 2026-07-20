import React from 'react';
import { BlogContent } from '../../types/blog';
import Markdown from '../../../ui/Markdown';

interface QuoteContentProps {
  item: BlogContent;
}

export const QuoteContent: React.FC<QuoteContentProps> = ({ item }) => (
  <section className="my-16 break-inside-avoid">
    <div className="px-6">
      <div className="relative">
        <div
          className="pointer-events-none absolute -top-8 -translate-x-1/2 select-none font-serif text-8xl leading-none text-theme-accent/20"
          aria-hidden="true"
        >
          "
        </div>
        <blockquote className="relative z-10 px-8 py-12 text-center">
          <Markdown className="mx-auto max-w-3xl text-lg leading-[1.6] text-theme-text-primary sm:text-xl lg:text-2xl">
            {item.content}
          </Markdown>
        </blockquote>
      </div>
    </div>
  </section>
);
