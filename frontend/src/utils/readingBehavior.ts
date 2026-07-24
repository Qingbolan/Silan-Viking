import { getClientFingerprint } from './fingerprint';
import { apiUrl } from '../api/utils';
import { isPrerenderRuntime } from './runtimeContext';

export interface ReadingSession {
  postId: string;
  startTime: number;
  endTime?: number;
  scrollProgress: number;
  readingTime: number;
  fingerprint: string;
}

export interface ReadingProgress {
  scrollPercentage: number;
  timeSpent: number;
  isActive: boolean;
}

class ReadingBehaviorTracker {
  private currentSession: ReadingSession | null = null;
  private progressCallbacks: ((progress: ReadingProgress) => void)[] = [];
  private scrollUpdateTimer: number | null = null;
  private activityTimer: number | null = null;
  private isActive = true;
  private lastActivityTime = Date.now();

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Track user activity
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(eventType => {
      document.addEventListener(eventType, () => {
        this.lastActivityTime = Date.now();
        if (!this.isActive) {
          this.isActive = true;
          this.notifyProgressCallbacks();
        }
      }, true);
    });

    // Check for inactivity every 30 seconds
    this.activityTimer = window.setInterval(() => {
      if (Date.now() - this.lastActivityTime > 30000) { // 30 seconds
        if (this.isActive) {
          this.isActive = false;
          this.notifyProgressCallbacks();
        }
      }
    }, 30000);

    // Track scroll progress
    this.scrollUpdateTimer = window.setInterval(() => {
      if (this.currentSession && this.isActive) {
        this.updateScrollProgress();
      }
    }, 1000);

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseSession();
      } else {
        this.resumeSession();
      }
    });

    // Handle page unload
    window.addEventListener('beforeunload', () => {
      this.endSession();
    });
  }

  startSession(postId: string): void {
    if (this.currentSession?.postId === postId) {
      return; // Already tracking this post
    }

    // End previous session if exists
    if (this.currentSession) {
      this.endSession();
    }

    this.currentSession = {
      postId,
      startTime: Date.now(),
      scrollProgress: 0,
      readingTime: 0,
      fingerprint: getClientFingerprint(),
    };

    this.isActive = true;
    this.lastActivityTime = Date.now();
  }

  endSession(): void {
    if (!this.currentSession) return;

    this.currentSession.endTime = Date.now();
    this.currentSession.readingTime = this.getCurrentReadingTime();

    // Send session data to backend
    this.sendSessionData(this.currentSession);

    this.currentSession = null;
  }

  pauseSession(): void {
    this.isActive = false;
  }

  resumeSession(): void {
    if (this.currentSession) {
      this.isActive = true;
      this.lastActivityTime = Date.now();
    }
  }

  private updateScrollProgress(): void {
    if (!this.currentSession) return;

    const scrollTop = window.scrollY;
    const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercentage = documentHeight > 0 ? (scrollTop / documentHeight) * 100 : 0;

    this.currentSession.scrollProgress = Math.max(this.currentSession.scrollProgress, scrollPercentage);

    this.notifyProgressCallbacks();
  }

  private getCurrentReadingTime(): number {
    if (!this.currentSession) return 0;
    return Date.now() - this.currentSession.startTime;
  }

  private notifyProgressCallbacks(): void {
    if (!this.currentSession) return;

    const progress: ReadingProgress = {
      scrollPercentage: this.currentSession.scrollProgress,
      timeSpent: this.getCurrentReadingTime(),
      isActive: this.isActive,
    };

    this.progressCallbacks.forEach(callback => callback(progress));
  }

  private async sendSessionData(session: ReadingSession): Promise<void> {
    if (isPrerenderRuntime()) return;

    try {
      await fetch(apiUrl(`/api/v1/blog/posts/${session.postId}/views`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          fingerprint: session.fingerprint,
          reading_time: session.readingTime,
          scroll_progress: session.scrollProgress,
          session_start: new Date(session.startTime).toISOString(),
          session_end: session.endTime ? new Date(session.endTime).toISOString() : new Date().toISOString(),
          user_agent_full: navigator.userAgent,
          referrer: document.referrer,
        }),
      });
    } catch (error) {
      console.warn('Failed to send reading session data:', error);
    }
  }

  onProgress(callback: (progress: ReadingProgress) => void): () => void {
    this.progressCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.progressCallbacks.indexOf(callback);
      if (index > -1) {
        this.progressCallbacks.splice(index, 1);
      }
    };
  }

  getCurrentProgress(): ReadingProgress | null {
    if (!this.currentSession) return null;

    return {
      scrollPercentage: this.currentSession.scrollProgress,
      timeSpent: this.getCurrentReadingTime(),
      isActive: this.isActive,
    };
  }

  destroy(): void {
    this.endSession();

    if (this.scrollUpdateTimer) {
      clearInterval(this.scrollUpdateTimer);
    }

    if (this.activityTimer) {
      clearInterval(this.activityTimer);
    }

    this.progressCallbacks = [];
  }
}

// Create a singleton instance
export const readingTracker = new ReadingBehaviorTracker();
