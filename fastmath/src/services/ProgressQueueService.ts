import { api, setUserProgress, updateTypingSpeed, updateProgressAssessment } from '../config/api';
import { SetUserProgressRequest } from '../types/progress';
import { logError } from '../utils/errorReporting';

// Types for queue items
interface ProgressQueueItem {
  id: string;
  type: 'progress' | 'typing' | 'progressAssessment';
  userId: string;
  payload: any;
  attempts: number;
  timestamp: number;
  priority: number; // Higher number = higher priority
  assessmentId?: string; // For progressAssessment type
}

class ProgressQueueService {
  private queue: ProgressQueueItem[] = [];
  private isProcessing = false;
  private storageKey = 'progress_update_queue';
  private networkRetryTimeout: number | null = null;
  private maxRetries = 5;
  private isOnline = navigator.onLine;
  private isSortNeeded = false; // Flag to track if sorting is needed
  private saveDebounceTimer: number | null = null;

  // Priority constants
  private readonly PRIORITY = {
    PROGRESS: 3,    // Progress updates
    TYPING: 1,      // Typing speed
    ASSESSMENT: 4   // Progress assessment (highest priority)
  };

  // Batch processing constants
  private readonly BATCH_SIZE = 5; // Process up to 5 items in parallel
  private readonly SAVE_DEBOUNCE_TIME = 300; // Debounce time in ms

  constructor() {
    // Load any stored queue items from localStorage on init
    this.loadFromStorage();
    
    // Set up network status event listeners
    window.addEventListener('online', this.handleNetworkChange);
    window.addEventListener('offline', this.handleNetworkChange);
    
    // Delay initial queue processing to avoid blocking UI
    setTimeout(() => {
      console.log('[ProgressQueue] Initiating delayed queue processing.');
      this.processQueue();
    }, 3000); // Delay by 3 seconds, for example
  }

  private handleNetworkChange = () => {
    this.isOnline = navigator.onLine;
    
    if (this.isOnline) {
      console.log('[ProgressQueue] Network connection restored, processing queue...');
      this.processQueue();
    } else {
      console.log('[ProgressQueue] Network connection lost, pausing queue processing');
    }
  }

  // Add a progress update to the queue
  public enqueueProgressUpdate(
    userId: string, 
    progressUpdate: SetUserProgressRequest
  ): void {
    const queueItem: ProgressQueueItem = {
      id: `progress-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'progress',
      userId,
      payload: progressUpdate,
      attempts: 0,
      timestamp: Date.now(),
      priority: this.PRIORITY.PROGRESS
    };
    
    this.queue.push(queueItem);
    this.isSortNeeded = true;
    this.debouncedSaveToStorage();
    this.processQueue();
  }



  // Add a progress assessment update to the queue
  public enqueueProgressAssessmentUpdate(
    userId: string,
    assessmentId: string,
    progressUpdate: { [questionId: string]: { attempts: number; correct: number; timeSpent: number } }
  ): void {
    const queueItem: ProgressQueueItem = {
      id: `assessment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'progressAssessment',
      userId,
      assessmentId,
      payload: progressUpdate,
      attempts: 0,
      timestamp: Date.now(),
      priority: this.PRIORITY.ASSESSMENT
    };
    
    this.queue.push(queueItem);
    this.isSortNeeded = true;
    this.debouncedSaveToStorage();
    this.processQueue();
  }

  // Add a typing speed update to the queue
  public enqueueTypingUpdate(
    userId: string,
    typingData: { count: number; time: number }
  ): void {
    const queueItem: ProgressQueueItem = {
      id: `typing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'typing',
      userId,
      payload: typingData,
      attempts: 0,
      timestamp: Date.now(),
      priority: this.PRIORITY.TYPING
    };
    
    this.queue.push(queueItem);
    this.isSortNeeded = true;
    this.debouncedSaveToStorage();
    this.processQueue();
  }

  // Debounce the save operation to reduce localStorage writes
  private debouncedSaveToStorage(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    
    this.saveDebounceTimer = window.setTimeout(() => {
      this.saveToStorage();
      this.saveDebounceTimer = null;
    }, this.SAVE_DEBOUNCE_TIME);
  }

  // Process items in the queue
  private async processQueue(): Promise<void> {
    // If already processing or offline, don't start another processing cycle
    if (this.isProcessing || !this.isOnline) {
      return;
    }

    this.isProcessing = true;

    try {
      // Only sort the queue if needed (when new items added or after failed attempts)
      if (this.isSortNeeded && this.queue.length > 1) {
        this.queue.sort((a, b) => 
          b.priority !== a.priority
            ? b.priority - a.priority  // Higher priority first
            : a.timestamp - b.timestamp // Then older timestamps first
        );
        this.isSortNeeded = false;
      }

      while (this.queue.length > 0) {
        // If we're offline, stop processing and save current state
        if (!navigator.onLine) {
          console.log('[ProgressQueue] Network is offline, pausing queue processing');
          break;
        }

        // Process items in batches for better performance
        const batchSize = Math.min(this.BATCH_SIZE, this.queue.length);
        
        // Group progress updates together but prioritize other types first
        let batch: ProgressQueueItem[] = [];
        let progressItems: ProgressQueueItem[] = [];
        
        for (let i = 0; i < batchSize && i < this.queue.length; i++) {
          const item = this.queue[i];
          if (item.type === 'progress') {
            progressItems.push(item);
          } else {
            batch.push(item);
          }
          
          // If we've reached the batch size with high priority items, break
          if (batch.length >= batchSize) break;
        }
        
        // If we didn't fill the batch with high priority items, add progress items
        const remainingSlots = batchSize - batch.length;
        if (remainingSlots > 0 && progressItems.length > 0) {
          batch = batch.concat(progressItems.slice(0, remainingSlots));
        }
        
        // If batch is empty but we have progress items, use those
        if (batch.length === 0 && progressItems.length > 0) {
          batch = progressItems.slice(0, batchSize);
        }
        
        // Process all items in the batch concurrently
        const results = await Promise.allSettled(batch.map(item => this.processItem(item)));
        
        // Handle the results of each item in the batch
        let hasChanges = false;
        let hasNetworkError = false;
        
        results.forEach((result, index) => {
          const item = batch[index];
          
          if (result.status === 'fulfilled') {
            // Success - remove from queue
            this.queue = this.queue.filter(qItem => qItem.id !== item.id);
            hasChanges = true;
          } else {
            // Failed - handle retry logic
            item.attempts++;
            
            if (item.attempts >= this.maxRetries) {
              // Log and remove after max retries
              console.error(`[ProgressQueue] Max retries (${this.maxRetries}) reached for item:`, item);
              logError(result.reason, {
                component: 'ProgressQueueService',
                userId: item.userId,
                queueItemType: item.type,
                attempts: item.attempts,
                errorMessage: result.reason.message,
                status: result.reason.response?.status,
                networkConnected: navigator.onLine,
                connectionType: (navigator as any).connection?.effectiveType || 'unknown'
              });
              
              // Remove failed item
              this.queue = this.queue.filter(qItem => qItem.id !== item.id);
              hasChanges = true;
            } else {
              // Leave in queue but mark for sorting
              this.isSortNeeded = true;
              hasChanges = true;
              
              // Check if it's a network error
              if (!result.reason.response) {
                hasNetworkError = true;
              }
            }
          }
        });
        
        // Save changes if needed
        if (hasChanges) {
          this.saveToStorage();
        }
        
        // If there was a network error, pause processing with exponential backoff
        if (hasNetworkError) {
          console.log('[ProgressQueue] Network error, will retry later');
          
          // Clear any existing retry timeout
          if (this.networkRetryTimeout) {
            clearTimeout(this.networkRetryTimeout);
          }
          
          // Use the highest attempt count for backoff calculation
          const maxAttempts = Math.max(...batch.map(item => item.attempts));
          const retryDelay = Math.min(Math.pow(2, maxAttempts) * 1000, 30000);
          
          this.networkRetryTimeout = window.setTimeout(() => {
            this.networkRetryTimeout = null;
            this.processQueue();
          }, retryDelay);
          
          break; // Stop processing for now
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // Process a single queue item
  private async processItem(item: ProgressQueueItem): Promise<any> {
    // Add debug logging for accuracy practice
    const isAccuracyPractice = window.location.pathname.includes('accuracy-practice');
    if (isAccuracyPractice) {
      console.log(`[ProgressQueue] Processing item during accuracy practice:`, {
        type: item.type,
        userId: item.userId,
        timestamp: new Date().toISOString(),
        attempts: item.attempts
      });
    }
    
    switch (item.type) {
      case 'progress':
        return setUserProgress(item.userId, item.payload);
      case 'typing':
        return updateTypingSpeed(item.userId, item.payload);
      case 'progressAssessment':
        if (item.assessmentId) {
          return updateProgressAssessment(item.userId, item.assessmentId, item.payload);
        }
        throw new Error('Missing assessmentId for progressAssessment item');
      default:
        throw new Error(`Unknown queue item type: ${(item as any).type}`);
    }
  }

  // Save queue to localStorage
  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch (error) {
      console.error('[ProgressQueue] Error saving queue to localStorage:', error);
    }
  }

  // Load queue from localStorage
  private loadFromStorage(): void {
    try {
      const storedQueue = localStorage.getItem(this.storageKey);
      if (storedQueue) {
        this.queue = JSON.parse(storedQueue);
        this.isSortNeeded = true; // Mark for sorting after loading
      }
    } catch (error) {
      console.error('[ProgressQueue] Error loading queue from localStorage:', error);
      // If there's an error loading, just start with an empty queue
      this.queue = [];
    }
  }

  // Get queue stats (for debugging/monitoring)
  public getStats() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      isOnline: navigator.onLine,
      batchSize: this.BATCH_SIZE
    };
  }

  // Clean up event listeners (call this when app unmounts if needed)
  public cleanup() {
    window.removeEventListener('online', this.handleNetworkChange);
    window.removeEventListener('offline', this.handleNetworkChange);
    if (this.networkRetryTimeout) {
      clearTimeout(this.networkRetryTimeout);
    }
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
  }


}

// Create and export a singleton instance
export const progressQueue = new ProgressQueueService(); 