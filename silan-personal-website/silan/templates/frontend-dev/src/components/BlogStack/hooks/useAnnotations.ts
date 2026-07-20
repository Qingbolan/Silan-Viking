import { useState, useEffect } from 'react';
import { UserAnnotation, SelectedText } from '../types/blog';
import { getClientFingerprint } from '../../../utils/fingerprint';

export const useAnnotations = (postId?: string) => {
  const [userAnnotations, setUserAnnotations] = useState<Record<string, UserAnnotation>>({});
  const [showAnnotationForm, setShowAnnotationForm] = useState<string | null>(null);
  const [newAnnotationText, setNewAnnotationText] = useState('');
  const [selectedText, setSelectedText] = useState<SelectedText | null>(null);
  const [highlightedAnnotation, setHighlightedAnnotation] = useState<string | null>(null);

  // Load annotations from localStorage when component mounts
  useEffect(() => {
    if (postId) {
      const storageKey = `annotations_${postId}`;
      const storedAnnotations = localStorage.getItem(storageKey);
      if (storedAnnotations) {
        try {
          const parsed = JSON.parse(storedAnnotations);
          setUserAnnotations(parsed);
        } catch (error) {
          console.error('Failed to parse stored annotations:', error);
        }
      }
    }
  }, [postId]);

  // Save annotations to localStorage whenever userAnnotations changes
  useEffect(() => {
    if (postId && Object.keys(userAnnotations).length > 0) {
      const storageKey = `annotations_${postId}`;
      localStorage.setItem(storageKey, JSON.stringify(userAnnotations));
    }
  }, [userAnnotations, postId]);

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || !selection.toString().trim()) {
      return;
    }

    const selectedTextContent = selection.toString().trim();
    const range = selection.getRangeAt(0);
    
    // Find the content container by traversing up the DOM
    let element: Node | null = range.commonAncestorContainer;
    if (element.nodeType === Node.TEXT_NODE) {
      element = element.parentNode;
    }
    
    let contentId = '';
    let containerElement: Element | null = null;

    // Look for the content container with an ID
    while (element && element !== document.body) {
      if ((element as Element).id) {
        contentId = (element as Element).id;
        containerElement = element as Element;
        break;
      }
      element = element.parentNode;
    }
    
    if (!contentId || !containerElement) {
      console.warn('Could not find content container for selection');
      return;
    }

    // Calculate more precise text offsets
    const containerText = containerElement.textContent || '';
    
    // Use the range to get more accurate positioning
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(containerElement);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preCaretRange.toString().length;
    const endOffset = startOffset + selectedTextContent.length;

    // Validate that the selected text matches what we expect
    const extractedText = containerText.substring(startOffset, endOffset);
    if (extractedText.trim() !== selectedTextContent.trim()) {
      // Fallback to indexOf if range calculation fails
      const fallbackStart = containerText.indexOf(selectedTextContent);
      if (fallbackStart !== -1) {
        setSelectedText({ 
          text: selectedTextContent, 
          contentId, 
          startOffset: fallbackStart,
          endOffset: fallbackStart + selectedTextContent.length
        });
      } else {
        console.warn('Could not accurately position selected text');
        return;
      }
    } else {
      setSelectedText({ 
        text: selectedTextContent, 
        contentId, 
        startOffset,
        endOffset
      });
    }
    
    setShowAnnotationForm(contentId);
    
    // Clear the selection to avoid visual confusion
    selection.removeAllRanges();
  };

  const addUserAnnotation = (contentId: string) => {
    if (!newAnnotationText.trim() || !selectedText) {
      return;
    }

    const annotationId = `${contentId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newAnnotation: UserAnnotation = {
      text: newAnnotationText.trim(),
      selectedText: selectedText.text,
      startOffset: selectedText.startOffset,
      endOffset: selectedText.endOffset,
      fingerprint: getClientFingerprint()
    };

    setUserAnnotations(prev => ({
      ...prev,
      [annotationId]: newAnnotation
    }));
    
    // Reset form state
    setNewAnnotationText('');
    setShowAnnotationForm(null);
    setSelectedText(null);
  };

  const removeUserAnnotation = (annotationId: string) => {
    setUserAnnotations(prev => {
      const newAnnotations = { ...prev };
      delete newAnnotations[annotationId];
      
      // Update localStorage immediately
      if (postId) {
        const storageKey = `annotations_${postId}`;
        if (Object.keys(newAnnotations).length === 0) {
          localStorage.removeItem(storageKey);
        } else {
          localStorage.setItem(storageKey, JSON.stringify(newAnnotations));
        }
      }
      
      return newAnnotations;
    });
  };

  const highlightAnnotation = (annotationId: string) => {
    setHighlightedAnnotation(annotationId);
    setTimeout(() => setHighlightedAnnotation(null), 2000);
  };

  const cancelAnnotation = () => {
    setShowAnnotationForm(null);
    setNewAnnotationText('');
    setSelectedText(null);
  };

  // Clear all annotations for the current post
  const clearAllAnnotations = () => {
    setUserAnnotations({});
    if (postId) {
      const storageKey = `annotations_${postId}`;
      localStorage.removeItem(storageKey);
    }
  };

  return {
    userAnnotations,
    showAnnotationForm,
    newAnnotationText,
    selectedText,
    highlightedAnnotation,
    setNewAnnotationText,
    setShowAnnotationForm,
    handleTextSelection,
    addUserAnnotation,
    removeUserAnnotation,
    highlightAnnotation,
    cancelAnnotation,
    clearAllAnnotations
  };
}; 