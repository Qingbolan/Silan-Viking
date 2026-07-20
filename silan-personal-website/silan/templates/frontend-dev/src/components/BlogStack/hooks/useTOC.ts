import { useMemo } from 'react';
import { BlogData, Section } from '../types/blog';

export const useTOC = (blog: BlogData | null) => {
  // Generate sections from blog content using useMemo for better performance
  const sections = useMemo<Section[]>(() => {
    if (!blog) return [];
    
    const headings = blog.content.filter(item => item.type === 'heading');
    
    // If all headings have the same level, create artificial hierarchy based on content length and position
    const hasVariedLevels = headings.some(item => (item.level || 1) !== (headings[0]?.level || 1));
    
    if (!hasVariedLevels && headings.length > 1) {
      // Create artificial hierarchy based on title length and keywords
      return headings.map((item, index) => {
        let level = item.level || 1;
        const title = item.content.replace(/^#+\s*/, '').trim();
        
        // Apply heuristics to determine level
        // Shorter titles are likely to be main sections
        // Titles with certain keywords are likely subsections
        const isLikelySubsection = title.length > 25 || 
                                   title.toLowerCase().includes('approach') ||
                                   title.toLowerCase().includes('solution') ||
                                   title.toLowerCase().includes('implementation') ||
                                   title.toLowerCase().includes('benefits') ||
                                   title.toLowerCase().includes('features') ||
                                   title.toLowerCase().includes('integration') ||
                                   title.toLowerCase().includes('phase') ||
                                   title.toLowerCase().includes('step');
        
        // Every 3rd-4th item becomes a subsection for visual variety
        const isPositionalSubsection = index % 3 === 1 || index % 4 === 2;
        
        if (isLikelySubsection || isPositionalSubsection) {
          level = 2;
        }
        
        return {
          id: item.id,
          title,
          level
        };
      });
    }
    
    // Use original levels if they vary
    return headings.map((item) => ({
      id: item.id,
      title: item.content.replace(/^#+\s*/, '').trim(),
      level: item.level || 1
    }));
  }, [blog]);

  return {
    sections
  };
};