// src/components/Resume/PublicationsList.tsx
//
// The publications section body — a masonry grid of vertical ds
// PublicationCards. Each entry carries its full structured metadata
// (figure, title, award, venue, abstract, authors, tags, links).
import React from 'react';
import { Masonry } from '../../components/ds';
import PublicationCard, { type PublicationCardData } from './PublicationCard';

interface PublicationsListProps {
  publications: PublicationCardData[];
  /** Author name to emphasise across the cards (the résumé owner). */
  highlightAuthor?: string;
}

const PublicationsList: React.FC<PublicationsListProps> = ({
  publications,
  highlightAuthor,
}) => (
  <Masonry
    items={publications}
    getKey={(item) => item.id}
    gap={20}
    renderItem={(item) => {
      const index = publications.indexOf(item);
      return (
        <PublicationCard
          publication={item}
          index={index}
          highlightAuthor={highlightAuthor}
        />
      );
    }}
  />
);

export default PublicationsList;
