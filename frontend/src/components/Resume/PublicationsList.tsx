// src/components/Resume/PublicationsList.tsx
//
// The publications section body — an editorial reading list. A single column
// keeps title, venue and authors in a stable scan order; masonry made papers
// look like unrelated product tiles and created unnecessary horizontal chrome.
import React from 'react';
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
  <div className="space-y-2">
    {publications.map((publication, index) => (
      <PublicationCard
        key={publication.id}
        publication={publication}
        index={index}
        highlightAuthor={highlightAuthor}
      />
    ))}
  </div>
);

export default PublicationsList;
