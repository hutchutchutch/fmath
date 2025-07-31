import { v4 as uuidv4 } from 'uuid';
import { dynamoDB } from '../config/aws';
import { 
  SessionData as BaseSessionData, 
  PageTransition, 
  PageTransitionRequest, 
  SessionAnalyticsQueryParams,
  SessionAnalyticsAggregateResponse,
  ActivityType as SessionActivityType,
  PageType,
  FactsByStage,
  FactWithStatusTracking
} from '../types/sessionAnalytics';
import { PutCommand, QueryCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { normalizeDateToDay, addDays } from '../utils/dateUtils';
import caliperEventService, { ActivityType } from './caliperEventService';
import activityMetricsService from './activityMetricsService';

// Constants
const SESSION_TABLE = process.env.SESSION_TABLE || 'FastMath2';
const SESSION_TIMEOUT_MINUTES = 5; // Session expires after 5 minutes of inactivity
const MAX_ATTEMPTS = 3; // Maximum attempts for optimistic locking retries

// Map page types to activity types for time tracking
const PAGE_TO_ACTIVITY_MAP: Record<PageType, SessionActivityType> = {
  'learn': 'learning',
  'practice': 'learning',           // Regular practice is also learning
  'timed-practice': 'learning',     // Timed practice is also learning
  'accuracy-practice': 'accuracyPractice',
  'fluency-practice': 'fluencyPractice',
  'assessment': 'assessment',
  'onboarding': 'onboarding',
  'dashboard': 'other',
  'other': 'other'
};

// The SK for session items will be a constant, as sessions are no longer per-track.
const SESSION_SK = 'SESSION';

class SessionAnalyticsService {
  /**
   * Record a page transition
   */
  async recordPageTransition(data: PageTransitionRequest): Promise<{ success: boolean; sessionId?: string; message?: string }> {
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
      try {
        const { userId, trackId, page, factsByStage } = data;
        const timestamp = new Date().toISOString();
        
        // Create page transition object, now including trackId
        const pageTransition: PageTransition = {
          timestamp,
          page,
          trackId, // A session now spans across tracks
          ...(factsByStage && Object.keys(factsByStage).length > 0 ? { factsByStage } : {})
        };

        // Check if there's an active session for this user
        const { activeSession, currentVersion } = await this.getActiveSessionAndVersion(userId);
        
        if (activeSession) {
          // Check if this is a duplicate transition
          const lastTransition = activeSession.pageTransitions[activeSession.pageTransitions.length - 1];
          
          // Check for same-page duplicate (for fact merging or skipping)
          const isDuplicatePageTransition = lastTransition && 
            lastTransition.page === page && 
            lastTransition.trackId === trackId &&
            // Only merge if the last transition was within 5 seconds (to handle navigation duplicates)
            (new Date(timestamp).getTime() - new Date(lastTransition.timestamp).getTime()) < 5000;
          
          let updatedPageTransitions: PageTransition[];
          
          if (isDuplicatePageTransition && factsByStage && Object.keys(factsByStage).length > 0) {
            // Merge facts data into the last transition instead of creating a new one
            // Create a copy of transitions and update the last one
            updatedPageTransitions = [...activeSession.pageTransitions];
            const mergedFactsByStage = { ...lastTransition.factsByStage };
            
            // Merge each stage's facts, avoiding duplicates
            Object.entries(factsByStage).forEach(([stage, facts]) => {
              const existingFacts = mergedFactsByStage[stage as keyof FactsByStage] || [];
              const newFacts = facts.filter(f => !existingFacts.includes(f));
              mergedFactsByStage[stage as keyof FactsByStage] = [...existingFacts, ...newFacts];
            });
            
            updatedPageTransitions[updatedPageTransitions.length - 1] = {
              ...lastTransition,
              factsByStage: mergedFactsByStage
              // Don't update timestamp to avoid affecting time calculations
            };
          } else if (isDuplicatePageTransition) {
            // Duplicate without new facts - skip it
            return { success: true, sessionId: activeSession.sessionId };
          } else {
            // Add new transition as normal
            updatedPageTransitions = [...activeSession.pageTransitions, pageTransition];
          }
          
          // Only proceed with calculation if we have at least 2 transitions
          if (updatedPageTransitions.length >= 2) {
            // Calculate all required updates in memory without DB operations
            // These times are now totals across all tracks for the session
            const updatedTimes = this.calculateActivityTimesFromTransitions(updatedPageTransitions);
            
            // Skip time logging if we merged facts (no new time was added)
            
            // Prepare update parameters
            let updateExpression = [
              'SET pageTransitions = :pageTransitions',
              'endTime = :endTime',
              'totalDuration = :totalDuration',
              'learningTime = :learningTime', 
              'accuracyPracticeTime = :accuracyPracticeTime',
              'fluency6PracticeTime = :fluency6PracticeTime', 
              'fluency3PracticeTime = :fluency3PracticeTime',
              'fluency2PracticeTime = :fluency2PracticeTime', 
              'fluency1_5PracticeTime = :fluency1_5PracticeTime',
              'fluency1PracticeTime = :fluency1PracticeTime',
              'assessmentTime = :assessmentTime', 
              'otherTime = :otherTime',
              'version = :newVersion'
            ].join(', ');
            
            let expressionAttributeValues: Record<string, any> = {
              ':pageTransitions': updatedPageTransitions,
              ':endTime': timestamp,  // Always update endTime to keep session active
              ':totalDuration': updatedTimes.totalDuration,
              ':learningTime': updatedTimes.learningTime,
              ':accuracyPracticeTime': updatedTimes.accuracyPracticeTime,
              ':fluency6PracticeTime': updatedTimes.fluency6PracticeTime,
              ':fluency3PracticeTime': updatedTimes.fluency3PracticeTime,
              ':fluency2PracticeTime': updatedTimes.fluency2PracticeTime,
              ':fluency1_5PracticeTime': updatedTimes.fluency1_5PracticeTime,
              ':fluency1PracticeTime': updatedTimes.fluency1PracticeTime,
              ':assessmentTime': updatedTimes.assessmentTime,
              ':otherTime': updatedTimes.otherTime,
              ':version': currentVersion,
              ':newVersion': currentVersion + 1
            };
            
            // Determine if factsCovered needs updating
            let updatedFactsCovered = activeSession.factsCovered || {
              learning: [],
              accuracyPractice: [],
              fluency6Practice: [],
              fluency3Practice: [],
              fluency2Practice: [],
              fluency1_5Practice: [],
              fluency1Practice: []
            };
            
            // Get the previous transition's factsByStage if it exists
            let previousFactsByStage: FactsByStage | undefined;
            const sortedTransitions = [...updatedPageTransitions].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            
            if (sortedTransitions.length > 1) {
              const previousTransition = sortedTransitions[sortedTransitions.length - 2];
              if (previousTransition && previousTransition.factsByStage) {
                previousFactsByStage = previousTransition.factsByStage;
              }
            }
            
            // If either the current or previous transition has facts, update factsCovered
            const currentTransitionFacts = pageTransition.factsByStage;
            if ((currentTransitionFacts && Object.keys(currentTransitionFacts).length > 0) || 
                (previousFactsByStage && Object.keys(previousFactsByStage).length > 0)) {
              
              updatedFactsCovered = await this.calculateFactsCoveredData(
                userId,
                trackId, // We still need trackId for context on which progress to check against
                activeSession.factsCovered || {
                  learning: [],
                  accuracyPractice: [],
                  fluency6Practice: [],
                  fluency3Practice: [],
                  fluency2Practice: [],
                  fluency1_5Practice: [],
                  fluency1Practice: []
                },
                currentTransitionFacts || {}, 
                previousFactsByStage || {}
              );
              
              updateExpression += ', factsCovered = :factsCovered';
              expressionAttributeValues[':factsCovered'] = updatedFactsCovered;
            }
            
            // Send real-time activity events for completed activity
            await this.sendRealTimeActivityEvents(
              userId,
              activeSession.sessionId,
              trackId,
              sortedTransitions,
              updatedFactsCovered,
              timestamp,
              isDuplicatePageTransition // Pass this flag to skip event sending when merging
            );
            
            // Update session with optimistic locking
            await dynamoDB.send(new UpdateCommand({
              TableName: SESSION_TABLE,
              Key: {
                PK: `USER#${userId}#SESSION#${activeSession.sessionId}`,
                SK: SESSION_SK
              },
              UpdateExpression: updateExpression,
              ConditionExpression: 'version = :version',
              ExpressionAttributeValues: expressionAttributeValues
            }));
            
            return { success: true, sessionId: activeSession.sessionId };
          } else {
            // Simple update for first transition (not enough data for calculations)
            await dynamoDB.send(new UpdateCommand({
              TableName: SESSION_TABLE,
              Key: {
                PK: `USER#${userId}#SESSION#${activeSession.sessionId}`,
                SK: SESSION_SK
              },
              UpdateExpression: 'SET pageTransitions = :pageTransitions, endTime = :endTime, version = :newVersion',
              ConditionExpression: 'version = :version',
              ExpressionAttributeValues: {
                ':pageTransitions': updatedPageTransitions,
                ':endTime': timestamp,
                ':version': currentVersion,
                ':newVersion': currentVersion + 1
              }
            }));
            
            return { success: true, sessionId: activeSession.sessionId };
          }
        } else {
          // Create a new session with version 1
          const sessionId = uuidv4();
          
          // Clear any leftover delta metrics from previous sessions
          await activityMetricsService.clearDeltas(userId);
          
          // Initialize a new session
          const newSession: BaseSessionData = {
            PK: `USER#${userId}#SESSION#${sessionId}`,
            SK: SESSION_SK,
            userId,
            sessionId,
            trackId: trackId, // We can store the initial trackId for reference
            startTime: timestamp,
            endTime: timestamp,
            totalDuration: 0,
            learningTime: 0,
            accuracyPracticeTime: 0,
            fluency6PracticeTime: 0,
            fluency3PracticeTime: 0,
            fluency2PracticeTime: 0,
            fluency1_5PracticeTime: 0,
            fluency1PracticeTime: 0,
            assessmentTime: 0,
            otherTime: 0,
            pageTransitions: [pageTransition],
            factsCovered: {
              learning: [],
              accuracyPractice: [],
              fluency6Practice: [],
              fluency3Practice: [],
              fluency2Practice: [],
              fluency1_5Practice: [],
              fluency1Practice: []
            },
            
            // Initialize Caliper metrics
            totalActiveTime: 0,
            totalWasteTime: 0,
            totalXpEarned: 0,
            totalQuestions: 0,
            correctQuestions: 0,
            
            version: 1 // Initialize version for new sessions
          };

          // Store session in DynamoDB
          await dynamoDB.send(new PutCommand({
            TableName: SESSION_TABLE,
            Item: newSession
          }));

          return { success: true, sessionId };
        }
      } catch (error) {
        // Handle optimistic locking failures
        if (error instanceof ConditionalCheckFailedException) {
          attempts++;
          
          // If we've reached max attempts, return failure
          if (attempts >= MAX_ATTEMPTS) {
            console.error('Max retry attempts reached for optimistic locking', error);
            return { success: false, message: 'Failed to record page transition after multiple attempts' };
          }
          
          // Small delay before retry to reduce contention
          await new Promise(resolve => setTimeout(resolve, 100 * attempts));
        } else {
          console.error('Error recording page transition:', error);
          return { success: false, message: 'Failed to record page transition' };
        }
      }
    }
    
    // Should never reach here due to the return in the catch block
    return { success: false, message: 'Failed to record page transition' };
  }

  /**
   * Send real-time activity events for completed activities during a page transition
   * Note: This is where XP is sent to the external API (not on session completion)
   */
  private async sendRealTimeActivityEvents(
    userId: string, 
    sessionId: string, 
    trackId: string, 
    transitions: PageTransition[],
    updatedFactsCovered: {
      learning: FactWithStatusTracking[];
      accuracyPractice: FactWithStatusTracking[];
      fluency6Practice: FactWithStatusTracking[];
      fluency3Practice: FactWithStatusTracking[];
      fluency2Practice: FactWithStatusTracking[];
      fluency1_5Practice: FactWithStatusTracking[];
      fluency1Practice: FactWithStatusTracking[];
    },
    timestamp: string,
    isFactMerge: boolean = false
  ): Promise<void> {
    // Skip if this is just a fact merge (no new activity segment)
    if (isFactMerge) {
      return;
    }
    
    // We need at least 2 transitions to detect a completed activity
    if (transitions.length < 2) return;
    
    // Get the current and previous transition
    const currentTransition = transitions[transitions.length - 1];
    const previousTransition = transitions[transitions.length - 2];
    
    // Calculate duration of the activity segment that just ended
    const segmentDuration = (new Date(currentTransition.timestamp).getTime() - new Date(previousTransition.timestamp).getTime()) / 1000;



    // Only send events if we're moving from one activity to another AND there's a valid duration
    if (currentTransition.page === previousTransition.page || segmentDuration <= 0) {
      return;
    }

    const activityType = this.mapPageToCaliperActivityType(previousTransition.page);
    
    // Calculate raw and active time
    const rawSeconds = segmentDuration;
    const activeSeconds = Math.min(rawSeconds, 15); // Cap at 15 seconds for transitions
    

    
    // Only accumulate deltas - let flush handle all event sending
    await activityMetricsService.addDelta(userId, { 
      timeSpent: rawSeconds,
      activeTime: activeSeconds
    });
    
    // Immediately flush the metrics
    if (activityType) {
      // Capture metrics from flush
      const flushResult = await activityMetricsService.flush(userId, sessionId, activityType);

      if (flushResult) {
        // Update session with atomic ADD operations (no version conflicts)
        const metricsUpdate = new UpdateCommand({
          TableName: SESSION_TABLE,
          Key: {
            PK: `USER#${userId}#SESSION#${sessionId}`,
            SK: SESSION_SK
          },
          UpdateExpression: `
            ADD totalActiveTime :activeTime,
                totalWasteTime :wasteTime,
                totalXpEarned :xpEarned
                ${flushResult.totalQuestions ? ', totalQuestions :totalQuestions' : ''}
                ${flushResult.correctQuestions ? ', correctQuestions :correctQuestions' : ''}
          `,
          ExpressionAttributeValues: {
            ':activeTime': flushResult.activeTime,
            ':wasteTime': flushResult.wasteTime,
            ':xpEarned': flushResult.xpEarned,
            ...(flushResult.totalQuestions && { ':totalQuestions': flushResult.totalQuestions }),
            ...(flushResult.correctQuestions && { ':correctQuestions': flushResult.correctQuestions })
          }
        });
        
        try {
          await dynamoDB.send(metricsUpdate);
        } catch (error) {
          console.error('Failed to update session with Caliper metrics:', error);
          // Don't throw - this is not critical for the main flow
        }
      }
    }
  }

  /**
   * Get active session for a user (within the last 5 minutes) and its current version.
   * A user has only one active session at a time, regardless of track.
   */
  private async getActiveSessionAndVersion(userId: string): Promise<{
    activeSession: BaseSessionData | null;
    currentVersion: number;
  }> {
    try {
      const result = await dynamoDB.send(new QueryCommand({
        TableName: SESSION_TABLE,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        },
        ScanIndexForward: false, // Sort in descending order (newest first)
        Limit: 1
      }));
      
      if (!result.Items || result.Items.length === 0) {
        return { activeSession: null, currentVersion: 0 };
      }
      
      // Take the most recent session
      const mostRecentSession = result.Items[0] as BaseSessionData;
      const currentVersion = mostRecentSession.version || 1;
      
      // Check if the session is still active (within the timeout period)
      const lastActivityTime = new Date(mostRecentSession.endTime).getTime();
      const currentTime = new Date().getTime();
      const minutesSinceLastActivity = (currentTime - lastActivityTime) / (1000 * 60);
      
      if (minutesSinceLastActivity <= SESSION_TIMEOUT_MINUTES) {
        // Session is still active, return it
        return { activeSession: mostRecentSession, currentVersion };
      } else {
        // Session has expired - flush any pending deltas before sending completion event
        try {
          // Extract last activity type from page transitions
          let lastActivityType: SessionActivityType = 'other'; // Default fallback
          if (mostRecentSession.pageTransitions && mostRecentSession.pageTransitions.length > 0) {
            const sortedTransitions = [...mostRecentSession.pageTransitions].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            const lastTransition = sortedTransitions[sortedTransitions.length - 1];
            lastActivityType = PAGE_TO_ACTIVITY_MAP[lastTransition.page] || 'other';
          }
          
          // Flush any pending deltas with retry to ensure no data loss
          const maxRetries = 3;
          let retryCount = 0;
          let flushSuccess = false;
          
          while (retryCount < maxRetries && !flushSuccess) {
            try {
              // Convert SessionActivityType to ActivityType enum
              const caliperActivityType = lastActivityType === 'learning' ? ActivityType.LEARNING :
                                        lastActivityType === 'accuracyPractice' ? ActivityType.ACCURACY_PRACTICE :
                                        lastActivityType === 'fluencyPractice' ? ActivityType.FLUENCY_PRACTICE :
                                        lastActivityType === 'assessment' ? ActivityType.ASSESSMENT :
                                        lastActivityType === 'onboarding' ? ActivityType.ONBOARDING :
                                        ActivityType.DAILY_GOALS; // fallback for 'other'
              const flushResult = await activityMetricsService.flush(userId, mostRecentSession.sessionId, caliperActivityType);
              
              if (flushResult) {
                // Update session with atomic ADD operations for the final metrics
                const metricsUpdate = new UpdateCommand({
                  TableName: SESSION_TABLE,
                  Key: {
                    PK: `USER#${userId}#SESSION#${mostRecentSession.sessionId}`,
                    SK: SESSION_SK
                  },
                  UpdateExpression: `
                    ADD totalActiveTime :activeTime,
                        totalWasteTime :wasteTime,
                        totalXpEarned :xpEarned
                        ${flushResult.totalQuestions ? ', totalQuestions :totalQuestions' : ''}
                        ${flushResult.correctQuestions ? ', correctQuestions :correctQuestions' : ''}
                  `,
                  ExpressionAttributeValues: {
                    ':activeTime': flushResult.activeTime,
                    ':wasteTime': flushResult.wasteTime,
                    ':xpEarned': flushResult.xpEarned,
                    ...(flushResult.totalQuestions && { ':totalQuestions': flushResult.totalQuestions }),
                    ...(flushResult.correctQuestions && { ':correctQuestions': flushResult.correctQuestions })
                  }
                });
                
                try {
                  await dynamoDB.send(metricsUpdate);
                } catch (updateError) {
                  console.error('Failed to update expired session with final Caliper metrics:', updateError);
                  // Don't throw - this is not critical for the main flow
                }
              }
              console.log(`[SessionExpiration] Successfully flushed pending deltas for expired session ${mostRecentSession.sessionId}`);
              flushSuccess = true;
            } catch (retryError) {
              retryCount++;
              if (retryCount < maxRetries) {
                const backoffDelay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000); // Exponential backoff: 1s, 2s, 4s (max 5s)
                console.warn(`[SessionExpiration] Flush attempt ${retryCount} failed, retrying in ${backoffDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
              } else {
                throw retryError; // Re-throw on final attempt to trigger outer catch
              }
            }
          }
        } catch (flushError) {
          console.error(`[SessionExpiration] Failed to flush deltas for expired session ${mostRecentSession.sessionId}:`, flushError);
          // Continue with session completion even if flush fails
        }
        
        // Send Caliper event for the completed session
        caliperEventService.sendSessionCompletedEvent(
          userId, 
          mostRecentSession.sessionId, 
          mostRecentSession.trackId, // Use the initial trackId for the event
          mostRecentSession
        ).catch(error => console.error('Failed to send session completed Caliper event:', error));
        
        // Return null to indicate no active session
        return { activeSession: null, currentVersion: 0 };
      }
    } catch (error) {
      console.error('Error getting active session:', error);
      return { activeSession: null, currentVersion: 0 };
    }
  }

  private mapPageToCaliperActivityType(page: PageType): ActivityType | null {
    switch (page) {
      case 'learn':
      case 'practice':
      case 'timed-practice':
        return ActivityType.LEARNING;
      case 'accuracy-practice':
        return ActivityType.ACCURACY_PRACTICE;
      case 'fluency-practice':
        return ActivityType.FLUENCY_PRACTICE;
      case 'assessment':
        return ActivityType.ASSESSMENT;
      case 'onboarding':
        return ActivityType.ONBOARDING;
      default:
        return null;
    }
  }

  /**
   * Calculate activity times based on page transitions (pure function)
   */
  private calculateActivityTimesFromTransitions(transitions: PageTransition[]): {
    totalDuration: number;
    learningTime: number;
    accuracyPracticeTime: number;
    fluency6PracticeTime: number;
    fluency3PracticeTime: number;
    fluency2PracticeTime: number;
    fluency1_5PracticeTime: number;
    fluency1PracticeTime: number;
    assessmentTime: number;
    otherTime: number;
  } {
    // Reset all activity times
    let learningTime = 0;
    let accuracyPracticeTime = 0;
    let fluency6PracticeTime = 0;
    let fluency3PracticeTime = 0;
    let fluency2PracticeTime = 0;
    let fluency1_5PracticeTime = 0;
    let fluency1PracticeTime = 0;
    let assessmentTime = 0;
    let otherTime = 0;
    let totalDuration = 0;

    // Sort transitions by timestamp
    const sortedTransitions = [...transitions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // Calculate time spent in each page
    for (let i = 0; i < sortedTransitions.length - 1; i++) {
      const currentTransition = sortedTransitions[i];
      const nextTransition = sortedTransitions[i + 1];
      
      const startTime = new Date(currentTransition.timestamp).getTime();
      const endTime = new Date(nextTransition.timestamp).getTime();
      const durationSeconds = Math.round((endTime - startTime) / 1000);
      
      // Skip if duration is negative or unreasonably long (more than 2 hours)
      if (durationSeconds < 0 || durationSeconds > 7200) {
        continue;
      }
      
      totalDuration += durationSeconds;
      
      // Assign time to the appropriate activity based on the current page
      const activityType = PAGE_TO_ACTIVITY_MAP[currentTransition.page];
      
      switch (activityType) {
        case 'learning':
          learningTime += durationSeconds;
          break;
        case 'accuracyPractice':
          accuracyPracticeTime += durationSeconds;
          break;
        case 'fluencyPractice':
          // Determine which specific fluency level this is by checking the factsByStage in the transition
          if (currentTransition.factsByStage) {
            if (currentTransition.factsByStage.fluency6Practice && currentTransition.factsByStage.fluency6Practice.length > 0) {
              fluency6PracticeTime += durationSeconds;
            } else if (currentTransition.factsByStage.fluency3Practice && currentTransition.factsByStage.fluency3Practice.length > 0) {
              fluency3PracticeTime += durationSeconds;
            } else if (currentTransition.factsByStage.fluency2Practice && currentTransition.factsByStage.fluency2Practice.length > 0) {
              fluency2PracticeTime += durationSeconds;
            } else if (currentTransition.factsByStage.fluency1_5Practice && currentTransition.factsByStage.fluency1_5Practice.length > 0) {
              fluency1_5PracticeTime += durationSeconds;
            } else if (currentTransition.factsByStage.fluency1Practice && currentTransition.factsByStage.fluency1Practice.length > 0) {
              fluency1PracticeTime += durationSeconds;
            }
          }
          break;
        case 'assessment':
          assessmentTime += durationSeconds;
          break;
        case 'onboarding':
          assessmentTime += durationSeconds;
          break;
        default:
          otherTime += durationSeconds;
          break;
      }
    }

    return {
      totalDuration,
      learningTime,
      accuracyPracticeTime,
      fluency6PracticeTime,
      fluency3PracticeTime,
      fluency2PracticeTime,
      fluency1_5PracticeTime,
      fluency1PracticeTime,
      assessmentTime,
      otherTime
    };
  }

  /**
   * Get fact statuses from user progress
   * @param userId User ID
   * @param trackId Track ID
   * @param factIds List of fact IDs to check
   * @returns Map of fact IDs to their current status
   */
  private async getFactStatuses(
    userId: string, 
    trackId: string, 
    factIds: string[]
  ): Promise<Map<string, string>> {
    const statusMap = new Map<string, string>();
    
    if (factIds.length === 0) {
      return statusMap;
    }
    
    try {
      // Get user progress to check current fact statuses
      const progressResult = await dynamoDB.send(new QueryCommand({
        TableName: SESSION_TABLE,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': `PROGRESS#${trackId}`
        }
      }));
      
      if (progressResult.Items && progressResult.Items.length > 0) {
        const userProgress = progressResult.Items[0];
        const facts = userProgress.facts || {};
        
        // Map each fact ID to its current status
        for (const factId of factIds) {
          statusMap.set(factId, facts[factId]?.status || 'unknown');
        }
      }
    } catch (error) {
      console.error('Error getting fact statuses:', error);
    }
    
    return statusMap;
  }

  /**
   * Calculate updated factsCovered data (pure function)
   */
  private async calculateFactsCoveredData(
    userId: string,
    trackId: string,
    currentFactsCovered: {
      learning: FactWithStatusTracking[];
      accuracyPractice: FactWithStatusTracking[];
      fluency6Practice: FactWithStatusTracking[];
      fluency3Practice: FactWithStatusTracking[];
      fluency2Practice: FactWithStatusTracking[];
      fluency1_5Practice: FactWithStatusTracking[];
      fluency1Practice: FactWithStatusTracking[];
    },
    currentFactsByStage: FactsByStage,
    previousFactsByStage: FactsByStage
  ): Promise<typeof currentFactsCovered> {
    // Validate if we have any facts to update
    if ((!currentFactsByStage || Object.keys(currentFactsByStage).length === 0) &&
        (!previousFactsByStage || Object.keys(previousFactsByStage).length === 0)) {
      return currentFactsCovered; // Nothing to update
    }
    
    // Get combined lists of *string* fact IDs from current and previous transitions
    const allLearningFacts: string[] = [];
    const allAccuracyFacts: string[] = [];
    const allFluency6Facts: string[] = [];
    const allFluency3Facts: string[] = [];
    const allFluency2Facts: string[] = [];
    const allFluency1_5Facts: string[] = [];
    const allFluency1Facts: string[] = [];
    
    // Helper function to collect *string* fact IDs
    const collectFacts = (
      factIdArray: string[], 
      currentStageFacts?: string[], // Expecting string[] from FactsByStage
      previousStageFacts?: string[] // Expecting string[] from FactsByStage
    ) => {
      if (currentStageFacts && Array.isArray(currentStageFacts)) {
        currentStageFacts.forEach(factId => {
          if (typeof factId === 'string' && !factIdArray.includes(factId)) {
            factIdArray.push(factId);
          }
        });
      }
      
      if (previousStageFacts && Array.isArray(previousStageFacts)) {
        previousStageFacts.forEach(factId => {
          if (typeof factId === 'string' && !factIdArray.includes(factId)) {
            factIdArray.push(factId);
          }
        });
      }
    };
    
    // Collect facts for each type using the helper
    collectFacts(allLearningFacts, currentFactsByStage.learning, previousFactsByStage.learning);
    collectFacts(allAccuracyFacts, currentFactsByStage.accuracyPractice, previousFactsByStage.accuracyPractice);
    collectFacts(allFluency6Facts, currentFactsByStage.fluency6Practice, previousFactsByStage.fluency6Practice);
    collectFacts(allFluency3Facts, currentFactsByStage.fluency3Practice, previousFactsByStage.fluency3Practice);
    collectFacts(allFluency2Facts, currentFactsByStage.fluency2Practice, previousFactsByStage.fluency2Practice);
    collectFacts(allFluency1_5Facts, currentFactsByStage.fluency1_5Practice, previousFactsByStage.fluency1_5Practice);
    collectFacts(allFluency1Facts, currentFactsByStage.fluency1Practice, previousFactsByStage.fluency1Practice);
    
    // Start with copies of the current facts
    let updatedLearningFacts = [...currentFactsCovered.learning];
    let updatedAccuracyPracticeFacts = [...currentFactsCovered.accuracyPractice];
    let updatedFluency6Facts = [...currentFactsCovered.fluency6Practice];
    let updatedFluency3Facts = [...currentFactsCovered.fluency3Practice];
    let updatedFluency2Facts = [...currentFactsCovered.fluency2Practice];
    let updatedFluency1_5Facts = [...currentFactsCovered.fluency1_5Practice];
    let updatedFluency1Facts = [...currentFactsCovered.fluency1Practice];
    
    // Combine all unique fact IDs collected across stages
    const allFactIds = [
      ...new Set([ // Use Set to ensure uniqueness before getting statuses
          ...allLearningFacts, ...allAccuracyFacts, ...allFluency6Facts, 
          ...allFluency3Facts, ...allFluency2Facts, ...allFluency1_5Facts, 
          ...allFluency1Facts
      ])
    ];
    
    if (allFactIds.length > 0) {
      const factStatusMap = await this.getFactStatuses(userId, trackId, allFactIds);
      
      // Helper function to process facts, updating existing FactWithStatusTracking objects
      const processFactsWithStatusTracking = (
        allStageFactIds: string[], // String IDs for the current stage being processed
        existingStageFacts: FactWithStatusTracking[], // The existing array from currentFactsCovered
      ): FactWithStatusTracking[] => {
        const existingFactsMap = new Map<string, FactWithStatusTracking>();
        const result: FactWithStatusTracking[] = [];
        
        // Populate map from existing facts
        (existingStageFacts || []).forEach(fact => existingFactsMap.set(fact.factId, fact));

        for (const factId of allStageFactIds) {
          const existingFact = existingFactsMap.get(factId);
          const currentStatus = factStatusMap.get(factId) || 'unknown';
          
          if (existingFact) {
             // Fact already exists in this stage's list for the session
             if (existingFact.initialStatus === undefined) {
               // First time encountering this fact in *this specific stage* during the session update cycle
               existingFact.initialStatus = currentStatus;
               existingFact.statusChanged = false; // Status hasn't changed *yet*
             } else if (existingFact.statusChanged !== true && currentStatus !== existingFact.initialStatus) {
               // Status has changed since initial status was recorded for this stage
               existingFact.statusChanged = true;
             }
             // Add the (potentially updated) existing fact to the results
             result.push(existingFact); 
             // Remove from map to track which existing facts were processed
             existingFactsMap.delete(factId);
          } else {
            // New fact for this stage in this session
            result.push({
              factId,
              initialStatus: currentStatus,
              statusChanged: false // Initial status is recorded, no change yet
            });
          }
        }
        
        // Add back any existing facts from the map that were *not* in the current/previous transition update
        // These facts were covered earlier in the session but not in this specific segment
        existingFactsMap.forEach(fact => result.push(fact));
        
        return result;
      };
      
      // Process each fact type
      updatedLearningFacts = processFactsWithStatusTracking(allLearningFacts, currentFactsCovered.learning);
      updatedAccuracyPracticeFacts = processFactsWithStatusTracking(allAccuracyFacts, currentFactsCovered.accuracyPractice);
      updatedFluency6Facts = processFactsWithStatusTracking(allFluency6Facts, currentFactsCovered.fluency6Practice);
      updatedFluency3Facts = processFactsWithStatusTracking(allFluency3Facts, currentFactsCovered.fluency3Practice);
      updatedFluency2Facts = processFactsWithStatusTracking(allFluency2Facts, currentFactsCovered.fluency2Practice);
      updatedFluency1_5Facts = processFactsWithStatusTracking(allFluency1_5Facts, currentFactsCovered.fluency1_5Practice);
      updatedFluency1Facts = processFactsWithStatusTracking(allFluency1Facts, currentFactsCovered.fluency1Practice);
    }
    
    // Return the updated factsCovered object
    return {
      learning: updatedLearningFacts,
      accuracyPractice: updatedAccuracyPracticeFacts,
      fluency6Practice: updatedFluency6Facts,
      fluency3Practice: updatedFluency3Facts,
      fluency2Practice: updatedFluency2Facts,
      fluency1_5Practice: updatedFluency1_5Facts,
      fluency1Practice: updatedFluency1Facts
    };
  }

  /**
   * Calculate session waste metrics and XP (pure function)
   */


  /**
   * Get session analytics for a user
   */
  async getSessionAnalytics(params: SessionAnalyticsQueryParams): Promise<SessionAnalyticsAggregateResponse | null> {
    try {
      const { userId, trackId, fromDate, toDate } = params;
      
      // We need to use a GSI or scan to find sessions by userId
      let queryParams: any = {
        TableName: SESSION_TABLE,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      };
      
      // The trackId is no longer in the SK, so we cannot filter by it here.
      // We will fetch all sessions and filter/calculate by trackId in application logic.
      
      // Query for sessions
      const result = await dynamoDB.send(new QueryCommand(queryParams));
      
      if (!result.Items || result.Items.length === 0) {
        return {
          totalTimeSpent: 0,
          timeByActivity: {
            learningTime: 0,
            accuracyPracticeTime: 0,
            fluency6PracticeTime: 0,
            fluency3PracticeTime: 0,
            fluency2PracticeTime: 0,
            fluency1_5PracticeTime: 0,
            fluency1PracticeTime: 0,
            assessmentTime: 0,
            otherTime: 0
          },
          totalActiveTime: 0,
          totalWasteTime: 0,
          totalXpEarned: 0,
          totalQuestions: 0,
          correctQuestions: 0
        };
      }
      
      // Filter sessions by date if specified
      let sessions = result.Items as BaseSessionData[];
      
      if (fromDate) {
        const fromTimestamp = new Date(fromDate).getTime();
        sessions = sessions.filter(session => new Date(session.startTime).getTime() >= fromTimestamp);
      }
      
      if (toDate) {
        const toTimestamp = new Date(toDate).getTime();
        sessions = sessions.filter(session => new Date(session.endTime).getTime() <= toTimestamp);
      }

      // If a trackId is provided, we now need to calculate the time spent on that track
      // by iterating through the page transitions of each session.
      if (trackId) {
        const trackSpecificMetrics = this.calculateMetricsForTrack(sessions, trackId);
        
        const trackFactCounts = this.countFactsForTrack(sessions, trackId);

        const averageTimePerIteration: Record<string, number> = {};
        if (trackFactCounts.learning > 0) {
          averageTimePerIteration.learning = trackSpecificMetrics.timeByActivity.learningTime / trackFactCounts.learning;
        }
        if (trackFactCounts.accuracyPractice > 0) {
          averageTimePerIteration.accuracyPractice = trackSpecificMetrics.timeByActivity.accuracyPracticeTime / trackFactCounts.accuracyPractice;
        }
        if (trackFactCounts.fluency6Practice > 0) {
          averageTimePerIteration.fluency6Practice = trackSpecificMetrics.timeByActivity.fluency6PracticeTime / trackFactCounts.fluency6Practice;
        }
        if (trackFactCounts.fluency3Practice > 0) {
          averageTimePerIteration.fluency3Practice = trackSpecificMetrics.timeByActivity.fluency3PracticeTime / trackFactCounts.fluency3Practice;
        }
        if (trackFactCounts.fluency2Practice > 0) {
          averageTimePerIteration.fluency2Practice = trackSpecificMetrics.timeByActivity.fluency2PracticeTime / trackFactCounts.fluency2Practice;
        }
        if (trackFactCounts.fluency1_5Practice > 0) {
          averageTimePerIteration.fluency1_5Practice = trackSpecificMetrics.timeByActivity.fluency1_5PracticeTime / trackFactCounts.fluency1_5Practice;
        }
        if (trackFactCounts.fluency1Practice > 0) {
          averageTimePerIteration.fluency1Practice = trackSpecificMetrics.timeByActivity.fluency1PracticeTime / trackFactCounts.fluency1Practice;
        }
        
        return {
          totalTimeSpent: trackSpecificMetrics.totalTimeSpent,
          timeByActivity: trackSpecificMetrics.timeByActivity,
          averageTimePerIteration,
          totalActiveTime: 0, // Track-specific Caliper metrics not implemented yet
          totalWasteTime: 0,
          totalXpEarned: 0,
          totalQuestions: 0,
          correctQuestions: 0
        };
      }
      
      // Aggregate data for all tracks if no trackId is specified
      const aggregateData: SessionAnalyticsAggregateResponse = {
        totalTimeSpent: 0,
        timeByActivity: {
          learningTime: 0,
          accuracyPracticeTime: 0,
          fluency6PracticeTime: 0,
          fluency3PracticeTime: 0,
          fluency2PracticeTime: 0,
          fluency1_5PracticeTime: 0,
          fluency1PracticeTime: 0,
          assessmentTime: 0,
          otherTime: 0
        },
        averageTimePerIteration: {},
        // Initialize Caliper metrics
        totalActiveTime: 0,
        totalWasteTime: 0,
        totalXpEarned: 0,
        totalQuestions: 0,
        correctQuestions: 0
      };
      
      // Sum up times
      sessions.forEach(session => {
        aggregateData.totalTimeSpent += session.totalDuration;
        aggregateData.timeByActivity.learningTime += session.learningTime;
        aggregateData.timeByActivity.accuracyPracticeTime += session.accuracyPracticeTime;
        // Add the new fluency level times if they exist
        if (session.fluency6PracticeTime) aggregateData.timeByActivity.fluency6PracticeTime += session.fluency6PracticeTime;
        if (session.fluency3PracticeTime) aggregateData.timeByActivity.fluency3PracticeTime += session.fluency3PracticeTime;
        if (session.fluency2PracticeTime) aggregateData.timeByActivity.fluency2PracticeTime += session.fluency2PracticeTime;
        if (session.fluency1_5PracticeTime) aggregateData.timeByActivity.fluency1_5PracticeTime += session.fluency1_5PracticeTime;
        if (session.fluency1PracticeTime) aggregateData.timeByActivity.fluency1PracticeTime += session.fluency1PracticeTime;
        aggregateData.timeByActivity.assessmentTime += session.assessmentTime;
        aggregateData.timeByActivity.otherTime += session.otherTime;
        
        // Aggregate Caliper metrics
        aggregateData.totalActiveTime += session.totalActiveTime || 0;
        aggregateData.totalWasteTime += session.totalWasteTime || 0;
        aggregateData.totalXpEarned += session.totalXpEarned || 0;
        aggregateData.totalQuestions += session.totalQuestions || 0;
        aggregateData.correctQuestions += session.correctQuestions || 0;
      });
      
      // The rest of this function calculates averages. Since we are now dealing with
      // potentially mixed-track sessions, providing a meaningful average per iteration
      // without a trackId context is complex. We will return total aggregations
      // and leave per-track average calculations to calls that specify a trackId.
      aggregateData.averageTimePerIteration = {}; // Averages are now track-specific

      return aggregateData;
    } catch (error) {
      console.error('Error getting session analytics:', error);
      return null;
    }
  }

  /**
   * Helper function to calculate metrics for a specific track from a list of sessions.
   * This is necessary because sessions are no longer track-specific.
   */
  private calculateMetricsForTrack(sessions: BaseSessionData[], trackId: string) {
    const metrics = {
      totalTimeSpent: 0,
      timeByActivity: {
        learningTime: 0,
        accuracyPracticeTime: 0,
        fluency6PracticeTime: 0,
        fluency3PracticeTime: 0,
        fluency2PracticeTime: 0,
        fluency1_5PracticeTime: 0,
        fluency1PracticeTime: 0,
        assessmentTime: 0,
        otherTime: 0,
      },
    };

    sessions.forEach(session => {
      const sortedTransitions = [...session.pageTransitions].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      for (let i = 0; i < sortedTransitions.length - 1; i++) {
        const current = sortedTransitions[i];
        const next = sortedTransitions[i + 1];

        // Only calculate time for transitions on the specified track
        if (current.trackId === trackId) {
          const duration = (new Date(next.timestamp).getTime() - new Date(current.timestamp).getTime()) / 1000;
          
          if (duration < 0 || duration > 7200) continue;

          metrics.totalTimeSpent += duration;
          const activityType = PAGE_TO_ACTIVITY_MAP[current.page];

          switch (activityType) {
            case 'learning':
              metrics.timeByActivity.learningTime += duration;
              break;
            case 'accuracyPractice':
              metrics.timeByActivity.accuracyPracticeTime += duration;
              break;
            case 'fluencyPractice':
              if (current.factsByStage) {
                if (current.factsByStage.fluency6Practice?.length) metrics.timeByActivity.fluency6PracticeTime += duration;
                else if (current.factsByStage.fluency3Practice?.length) metrics.timeByActivity.fluency3PracticeTime += duration;
                else if (current.factsByStage.fluency2Practice?.length) metrics.timeByActivity.fluency2PracticeTime += duration;
                else if (current.factsByStage.fluency1_5Practice?.length) metrics.timeByActivity.fluency1_5PracticeTime += duration;
                else if (current.factsByStage.fluency1Practice?.length) metrics.timeByActivity.fluency1PracticeTime += duration;
              }
              break;
            case 'assessment':
              metrics.timeByActivity.assessmentTime += duration;
              break;
            case 'onboarding':
              metrics.timeByActivity.assessmentTime += duration;
              break;
            default:
              metrics.timeByActivity.otherTime += duration;
              break;
          }
        }
      }
    });

    return metrics;
  }

  /**
   * Helper to count unique facts for a specific track from a list of sessions.
   */
  private countFactsForTrack(sessions: BaseSessionData[], trackId: string) {
    const uniqueFacts: Record<string, Set<string>> = {
      learning: new Set<string>(),
      accuracyPractice: new Set<string>(),
      fluency6Practice: new Set<string>(),
      fluency3Practice: new Set<string>(),
      fluency2Practice: new Set<string>(),
      fluency1_5Practice: new Set<string>(),
      fluency1Practice: new Set<string>()
    };

    sessions.forEach(session => {
      // We only care about facts that were covered on the specified track.
      // This requires checking the trackId of the transition that introduced the fact.
      const trackTransitions = session.pageTransitions.filter(p => p.trackId === trackId);

      trackTransitions.forEach(transition => {
        if (transition.factsByStage) {
          (transition.factsByStage.learning || []).forEach(factId => uniqueFacts.learning.add(factId));
          (transition.factsByStage.accuracyPractice || []).forEach(factId => uniqueFacts.accuracyPractice.add(factId));
          (transition.factsByStage.fluency6Practice || []).forEach(factId => uniqueFacts.fluency6Practice.add(factId));
          (transition.factsByStage.fluency3Practice || []).forEach(factId => uniqueFacts.fluency3Practice.add(factId));
          (transition.factsByStage.fluency2Practice || []).forEach(factId => uniqueFacts.fluency2Practice.add(factId));
          (transition.factsByStage.fluency1_5Practice || []).forEach(factId => uniqueFacts.fluency1_5Practice.add(factId));
          (transition.factsByStage.fluency1Practice || []).forEach(factId => uniqueFacts.fluency1Practice.add(factId));
        }
      });
    });

    return {
      learning: uniqueFacts.learning.size,
      accuracyPractice: uniqueFacts.accuracyPractice.size,
      fluency6Practice: uniqueFacts.fluency6Practice.size,
      fluency3Practice: uniqueFacts.fluency3Practice.size,
      fluency2Practice: uniqueFacts.fluency2Practice.size,
      fluency1_5Practice: uniqueFacts.fluency1_5Practice.size,
      fluency1Practice: uniqueFacts.fluency1Practice.size
    };
  }

  /**
   * Get a user's most recent activity timestamp
   */
  async getLastActivity(userId: string): Promise<string | null> {
    try {
      // Query for the most recent session for this user
      const result = await dynamoDB.send(new QueryCommand({
        TableName: SESSION_TABLE,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        },
        ScanIndexForward: false, // Sort in descending order (newest first)
        Limit: 1
      }));
      
      if (!result.Items || result.Items.length === 0) {
        return null;
      }
      
      const session = result.Items[0] as BaseSessionData;
      
      // Return the endTime which is the timestamp of the last page transition
      return session.endTime;
    } catch (error) {
      console.error('Error getting last activity:', error);
      return null;
    }
  }

  /**
   * Get all sessions for a user from the last 7 days (excluding today)
   */
  async getUserSessionsLastWeek(userId: string, trackId?: string): Promise<BaseSessionData[] | null> {
    try {
      // Calculate date ranges
      const now = new Date();
      
      // Today's range - normalize to start of day
      const todayStart = normalizeDateToDay(now);
      
      // Previous 7 days range (excluding today)
      const sevenDaysAgo = addDays(todayStart, -7);
      const yesterdayEnd = new Date(todayStart);
      yesterdayEnd.setMilliseconds(-1); // Right before midnight (end of yesterday)
      
      // Query for all of a user's sessions within the date range.
      // Track-specific filtering must now happen in application code if needed.
      const result = await dynamoDB.send(new QueryCommand({
        TableName: SESSION_TABLE,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        FilterExpression: 'startTime BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':start': sevenDaysAgo.toISOString(),
          ':end': yesterdayEnd.toISOString()
        },
        ScanIndexForward: false // Sort in descending order (newest first)
      }));
      
      if (!result.Items || result.Items.length === 0) {
        return [];
      }
      
      let sessions = result.Items as BaseSessionData[];

      // If a trackId is provided, the calling function is responsible for
      // handling track-specific logic, as a session can span multiple tracks.
      // We return all sessions in the time range.
      
      return sessions;
    } catch (error) {
      console.error('Error getting user sessions from last week:', error);
      return null;
    }
  }

  /**
   * Get session analytics for today and the last 7 days (excluding today)
   * Returns both today's data, the aggregated data for the previous 7 days,
   * and detailed daily breakdown for the past 7 days (including today)
   */
  async getSessionAnalyticsWithHistory(userId: string, trackId?: string): Promise<{
    totalTimeToday: number;
    avgTimePerDayLastWeek: number;
    dailyTimeData: { date: string; totalTime: number }[];
  }> {
    try {
      // Calculate date ranges using dateUtils
      const now = new Date();
      
      // Today's range - normalize to start of day
      const todayStart = normalizeDateToDay(now);
      const todayEnd = new Date(todayStart);
      todayEnd.setHours(23, 59, 59, 999);
      
      // Get today's data. If trackId is provided, analytics will be calculated for it.
      const todayData = await this.getSessionAnalytics({
        userId,
        trackId,
        fromDate: todayStart.toISOString(),
        toDate: todayEnd.toISOString()
      });
      
      // Get total time spent today
      const totalTimeToday = todayData?.totalTimeSpent || 0;
      
      // Get all sessions for the past 7 days.
      const sessions = await this.getUserSessionsLastWeek(userId, trackId);
      
      // Initialize daily time data array with past 7 days
      const dailyTimeData: { date: string; totalTime: number }[] = [];
      
      // Generate dates for past 7 days
      for (let i = -7; i < 0; i++) {
        const date = addDays(todayStart, i);
        const formattedDate = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        dailyTimeData.push({
          date: formattedDate,
          totalTime: 0
        });
      }
      
      // Process each session and add its time to the appropriate day
      if (sessions && sessions.length > 0) {
        sessions.forEach(session => {
          const normalizedDate = normalizeDateToDay(session.startTime);
          const formattedDate = normalizedDate.toISOString().split('T')[0];
          
          // Find the corresponding day in our dailyTimeData array
          const dayData = dailyTimeData.find(day => day.date === formattedDate);
          if (dayData) {
            // If a trackId is specified, we need to calculate the duration for that track.
            if (trackId) {
              const trackMetrics = this.calculateMetricsForTrack([session], trackId);
              dayData.totalTime += trackMetrics.totalTimeSpent;
            } else {
              dayData.totalTime += session.totalDuration;
            }
          }
        });
      }
      
      // Calculate the total time from the daily data we've collected
      let totalTimeLastWeek = 0;
      
      dailyTimeData.forEach(dayData => {
        totalTimeLastWeek += dayData.totalTime;
      });
      
      // Return the total time for today, total time for last week, and daily breakdown
      return {
        totalTimeToday,
        avgTimePerDayLastWeek: totalTimeLastWeek,
        dailyTimeData
      };
    } catch (error) {
      console.error('Error getting session analytics with history:', error);
      // Return zeros in case of error
      return {
        totalTimeToday: 0,
        avgTimePerDayLastWeek: 0,
        dailyTimeData: []
      };
    }
  }

  /**
   * Get session analytics across all tracks (TRACK1, TRACK2, TRACK3, TRACK4)
   * Sums time spent across all tracks while avoiding double-counting
   */
  async getSessionAnalyticsAcrossTracks(userId: string): Promise<{
    totalTimeToday: number;
    avgTimePerDayLastWeek: number;
    dailyTimeData: { date: string; totalTime: number }[];
  }> {
    try {
      // Calculate date ranges
      const now = new Date();
      
      // Today's range - normalize to start of day
      const todayStart = normalizeDateToDay(now);
      const todayEnd = new Date(todayStart);
      todayEnd.setHours(23, 59, 59, 999);
      
      // Get all sessions for today, regardless of track
      const todaySessionsResult = await dynamoDB.send(new QueryCommand({
        TableName: SESSION_TABLE,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        FilterExpression: 'startTime BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':start': todayStart.toISOString(),
          ':end': todayEnd.toISOString()
        }
      }));
      
      // Calculate total time spent today across all tracks
      let totalTimeToday = 0;
      
      // Create a Set to track unique session IDs to avoid double-counting
      const processedSessionIds = new Set<string>();
      
      if (todaySessionsResult.Items && todaySessionsResult.Items.length > 0) {
        todaySessionsResult.Items.forEach((session: any) => {
          // Only count each session once
          if (!processedSessionIds.has(session.sessionId)) {
            totalTimeToday += session.totalDuration || 0;
            processedSessionIds.add(session.sessionId);
          }
        });
      }
      
      // Get all sessions for the past 7 days (excluding today)
      const sessions = await this.getUserSessionsLastWeek(userId);
      
      // Initialize daily time data array with past 7 days
      const dailyTimeData: { date: string; totalTime: number }[] = [];
      
      // Generate dates for past 7 days
      for (let i = -7; i < 0; i++) {
        const date = addDays(todayStart, i);
        const formattedDate = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        dailyTimeData.push({
          date: formattedDate,
          totalTime: 0
        });
      }
      
      // Process weekly sessions - track by session ID to avoid double-counting across tracks
      const processedWeeklySessionIds = new Map<string, string>(); // Maps sessionId to date
      
      if (sessions && sessions.length > 0) {
        sessions.forEach(session => {
          const normalizedDate = normalizeDateToDay(session.startTime);
          const formattedDate = normalizedDate.toISOString().split('T')[0];
          
          // Only process each session once per day
          if (!processedWeeklySessionIds.has(session.sessionId) || 
              processedWeeklySessionIds.get(session.sessionId) !== formattedDate) {
            
            // Find the corresponding day in our dailyTimeData array
            const dayData = dailyTimeData.find(day => day.date === formattedDate);
            if (dayData) {
              dayData.totalTime += session.totalDuration;
            }
            
            // Mark this session as processed for this date
            processedWeeklySessionIds.set(session.sessionId, formattedDate);
          }
        });
      }
      
      // Calculate the total time from the daily data we've collected
      let totalTimeLastWeek = 0;
      
      dailyTimeData.forEach(dayData => {
        totalTimeLastWeek += dayData.totalTime;
      });
      
      return {
        totalTimeToday,
        avgTimePerDayLastWeek: totalTimeLastWeek,
        dailyTimeData
      };
    } catch (error) {
      console.error('Error getting session analytics across tracks:', error);
      // Return zeros in case of error
      return {
        totalTimeToday: 0,
        avgTimePerDayLastWeek: 0,
        dailyTimeData: []
      };
    }
  }

  /**
   * Get session by ID directly using PK/SK
   */
  private async getSessionById(userId: string, sessionId: string): Promise<BaseSessionData | null> {
    try {
      const result = await dynamoDB.send(new QueryCommand({
        TableName: SESSION_TABLE,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}#SESSION#${sessionId}`,
          ':sk': SESSION_SK
        }
      }));
      
      if (!result.Items || result.Items.length === 0) {
        console.warn(`Session not found by ID: User ${userId}, Session ${sessionId}`);
        return null;
      }
      
      return result.Items[0] as BaseSessionData;
    } catch (error) {
      console.error(`Error getting session by ID (User: ${userId}, Session: ${sessionId}):`, error);
      return null;
    }
  }
}

export default new SessionAnalyticsService();