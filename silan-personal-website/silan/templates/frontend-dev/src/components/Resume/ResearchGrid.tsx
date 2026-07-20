// src/components/Resume/ResearchGrid.tsx
//
// The research section body — research projects shown as a ds ProjectCard
// masonry grid (cover, title, summary, tags, year) instead of a flat
// timeline. A research project reads like a project: visual-led.
import React from 'react';
import { Masonry, ProjectCard, type ProjectCardData } from '../../components/ds';

export interface ResearchGridItem {
  id: string;
  title: string;
  location: string;
  date: string;
  details: string[];
  image?: string;
  tags?: string[];
}

interface ResearchGridProps {
  items: ResearchGridItem[];
}

// Pull a 4-digit year out of the date string for the card meta strip.
const extractYear = (date: string): string | undefined =>
  date.match(/\b(19|20)\d{2}\b/)?.[0];

const toCardData = (item: ResearchGridItem): ProjectCardData => ({
  id: item.id,
  title: item.title,
  // The first detail bullet reads as the project summary.
  description: item.details[0],
  tags: item.tags,
  year: extractYear(item.date),
  author: item.location || undefined,
  coverImage: item.image,
});

const ResearchGrid: React.FC<ResearchGridProps> = ({ items }) => (
  <Masonry
    items={items}
    getKey={(item) => item.id}
    gap={16}
    renderItem={(item) => (
      <ProjectCard project={toCardData(item)} coverSize="standard" hoverChrome={false} />
    )}
  />
);

export default ResearchGrid;
