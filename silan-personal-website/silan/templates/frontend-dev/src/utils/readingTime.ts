import { BlogContent } from '../components/BlogStack/types/blog';

// Calculate reading time based on average reading speed
// Average reading speed: 200 words per minute for English, 300 characters per minute for Chinese
const WORDS_PER_MINUTE_EN = 200;
const CHARS_PER_MINUTE_ZH = 300;

export function calculateReadingTime(content: BlogContent[], language: 'en' | 'zh' = 'en'): string {
  if (!content || content.length === 0) {
    return language === 'zh' ? '1分钟阅读' : '1 min read';
  }

  let totalWords = 0;
  let totalChars = 0;

  content.forEach(item => {
    if (!item.content) return;

    if (item.type === 'text' || item.type === 'quote') {
      // Count words for English and characters for Chinese
      const text = item.content.replace(/[^\w\s\u4e00-\u9fa5]/g, ' ').trim();

      // Count Chinese characters
      const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
      totalChars += chineseChars;

      // Count English words
      const englishWords = text.replace(/[\u4e00-\u9fa5]/g, '').split(/\s+/).filter(word => word.length > 0).length;
      totalWords += englishWords;
    }
    // Code blocks take longer to read
    else if (item.type === 'code') {
      const lines = item.content.split('\n').length;
      totalWords += lines * 10; // Assume 10 words per line for code
    }
    // Headers contribute less to reading time
    else if (item.type === 'heading') {
      const words = item.content.split(/\s+/).length;
      totalWords += words * 0.5;
    }
  });

  // Calculate time based on mixed content
  let timeInMinutes: number;

  if (language === 'zh' || totalChars > totalWords * 2) {
    // Primarily Chinese content
    timeInMinutes = (totalChars / CHARS_PER_MINUTE_ZH) + (totalWords / WORDS_PER_MINUTE_EN);
  } else {
    // Primarily English content
    timeInMinutes = totalWords / WORDS_PER_MINUTE_EN;
  }

  // Round up to nearest minute, minimum 1 minute
  const minutes = Math.max(1, Math.ceil(timeInMinutes));

  return language === 'zh' ? `${minutes}分钟阅读` : `${minutes} min read`;
}

export function updateReadingTimeDisplay(postElement: HTMLElement, content: BlogContent[], language: 'en' | 'zh' = 'en'): void {
  const readingTime = calculateReadingTime(content, language);
  const readingTimeElements = postElement.querySelectorAll('.reading-time');

  readingTimeElements.forEach(element => {
    element.textContent = readingTime;
  });
}