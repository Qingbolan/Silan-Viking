import { useState, useEffect, useCallback } from 'react';

export const useReadingProgress = () => {
  const [readingProgress, setReadingProgress] = useState(0);

  const calculateReadingProgress = useCallback(() => {
    const scrollTop = window.scrollY;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    // Simple calculation: total scroll progress
    const totalScrollableHeight = documentHeight - windowHeight;
    
    if (totalScrollableHeight <= 0) {
      setReadingProgress(0);
      return;
    }
    
    const progress = (scrollTop / totalScrollableHeight) * 100;
    setReadingProgress(Math.max(0, Math.min(100, progress)));
  }, []);

  useEffect(() => {
    let ticking = false;
    
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          calculateReadingProgress();
          ticking = false;
        });
        ticking = true;
      }
    };
    
    // Initial calculation
    setTimeout(() => {
      calculateReadingProgress();
    }, 100); // Small delay to ensure DOM is ready
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, [calculateReadingProgress]);

  return readingProgress;
}; 