import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { SessionData } from '../types/sessionAnalytics';
import { getValidOneRosterToken } from './oneRosterService';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});
const TABLE_NAME = 'FastMath2';

// Activity types
export enum ActivityType {
  LEARNING = 'Learning',
  ACCURACY_PRACTICE = 'Accuracy Practice',
  FLUENCY_PRACTICE = 'Fluency Practice',
  ASSESSMENT = 'Assessment',
  ONBOARDING = 'Onboarding',
  DAILY_GOALS = 'Daily Goals'
}

// Function to get user email by ID
async function getUserEmail(userId: string): Promise<string | undefined> {
  try {
    const result = await dynamoDB.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'PROFILE'
      }
    }));

    return result.Items?.[0]?.email;
  } catch (error) {
    console.error('Error getting user email:', error);
    return undefined;
  }
}

// Interface for activity event data
interface ActivityEventData {
  userId: string;
  sessionId: string;
  activityType: ActivityType;
  factsCount?: number;
  timeSpent?: number;
  wasteTime?: number;
  xpEarned?: number;
  eventTime?: string;
}

class CaliperEventService {
  /**
   * Sends Caliper events for a completed/ended session
   * This should only be called when a session is determined to be expired/ended
   * Note: XP is NOT sent here as it's already sent in real-time events to avoid double-counting
   * Modified to only send events for the LAST activity to prevent duplicates
   */
  async sendSessionCompletedEvent(
    userId: string, 
    sessionId: string, 
    trackId: string,
    sessionData: SessionData
  ): Promise<void> {
    try {
      // Get the last activity from page transitions
      const pageTransitions = sessionData.pageTransitions || [];
      if (pageTransitions.length === 0) {
        // No page transitions, nothing to send
        return;
      }
      
      // Sort transitions by timestamp to get the last one
      const sortedTransitions = [...pageTransitions].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      const lastTransition = sortedTransitions[sortedTransitions.length - 1];
      const lastActivityType = this.mapPageToActivityType(lastTransition.page);
      
      // Skip if the last page was not a trackable activity
      if (lastActivityType === 'other') {
        return;
      }
      
      const factsCovered = sessionData.factsCovered || {
        learning: [],
        accuracyPractice: [],
        fluency6Practice: [],
        fluency3Practice: [],
        fluency2Practice: [],
        fluency1_5Practice: [],
        fluency1Practice: []
      };
      
      const eventTime = sessionData.endTime || new Date().toISOString();
      
      // Only send events for the last activity
      let factsCount = 0;
      let timeSpent = 0;
      let wasteTime = 0;
      let caliperActivityType: ActivityType;
      
      switch (lastActivityType) {
        case 'learning':
          factsCount = factsCovered.learning.length;
          timeSpent = sessionData.learningTime;
          // Calculate waste time as Total Segment Time - Active Time
          // For now, we'll use a simplified approach where waste time is 0 since we're not tracking it
          wasteTime = 0;
          caliperActivityType = ActivityType.LEARNING;
          break;
        case 'accuracyPractice':
          factsCount = factsCovered.accuracyPractice.length;
          timeSpent = sessionData.accuracyPracticeTime;
          wasteTime = 0;
          caliperActivityType = ActivityType.ACCURACY_PRACTICE;
          break;
        case 'fluencyPractice':
          // Determine which specific fluency level based on the last transition's factsByStage
          if (lastTransition.factsByStage?.fluency6Practice && lastTransition.factsByStage.fluency6Practice.length > 0) {
            factsCount = factsCovered.fluency6Practice.length;
            timeSpent = sessionData.fluency6PracticeTime || 0;
          } else if (lastTransition.factsByStage?.fluency3Practice && lastTransition.factsByStage.fluency3Practice.length > 0) {
            factsCount = factsCovered.fluency3Practice.length;
            timeSpent = sessionData.fluency3PracticeTime || 0;
          } else if (lastTransition.factsByStage?.fluency2Practice && lastTransition.factsByStage.fluency2Practice.length > 0) {
            factsCount = factsCovered.fluency2Practice.length;
            timeSpent = sessionData.fluency2PracticeTime || 0;
          } else if (lastTransition.factsByStage?.fluency1_5Practice && lastTransition.factsByStage.fluency1_5Practice.length > 0) {
            factsCount = factsCovered.fluency1_5Practice.length;
            timeSpent = sessionData.fluency1_5PracticeTime || 0;
          } else if (lastTransition.factsByStage?.fluency1Practice && lastTransition.factsByStage.fluency1Practice.length > 0) {
            factsCount = factsCovered.fluency1Practice.length;
            timeSpent = sessionData.fluency1PracticeTime || 0;
          } else {
            // Sum all fluency practice facts and time as fallback
            factsCount = 
              (factsCovered.fluency6Practice.length || 0) +
              (factsCovered.fluency3Practice.length || 0) +
              (factsCovered.fluency2Practice.length || 0) +
              (factsCovered.fluency1_5Practice.length || 0) +
              (factsCovered.fluency1Practice.length || 0);
            timeSpent = 
              (sessionData.fluency6PracticeTime || 0) +
              (sessionData.fluency3PracticeTime || 0) +
              (sessionData.fluency2PracticeTime || 0) +
              (sessionData.fluency1_5PracticeTime || 0) +
              (sessionData.fluency1PracticeTime || 0);
          }
          wasteTime = 0;
          caliperActivityType = ActivityType.FLUENCY_PRACTICE;
          break;
        case 'assessment':
          // We don't track assessment facts directly
          timeSpent = sessionData.assessmentTime;
          wasteTime = 0;
          caliperActivityType = ActivityType.ASSESSMENT;
          break;
        case 'onboarding':
          // Treat onboarding similar to assessment for time tracking
          timeSpent = sessionData.assessmentTime;
          wasteTime = 0;
          caliperActivityType = ActivityType.ONBOARDING;
          break;
        default:
          return; // Skip if not a valid activity type
      }
      
             // Only send event if there's meaningful data for the last activity
       if (factsCount > 0 || timeSpent > 0) {
        await this.sendActivityEvents({
          userId,
          sessionId,
          activityType: caliperActivityType,
          factsCount: factsCount > 0 ? factsCount : undefined,
          timeSpent: timeSpent > 0 ? timeSpent : undefined,
          wasteTime,
          // XP is already sent in real-time events, so we don't send it here to avoid double-counting
          xpEarned: undefined,
          eventTime
        });
      }
    } catch (error) {
      // Just log the error - we don't want to fail any operations if Caliper event fails
      console.error(`Error sending session completed Caliper events for session ${sessionId}:`, error);
    }
  }

  /**
   * Helper method to map page types to activity types
   */
  private mapPageToActivityType(page: string): 'learning' | 'accuracyPractice' | 'fluencyPractice' | 'assessment' | 'onboarding' | 'other' {
    switch (page) {
      case 'learn':
        return 'learning';
      case 'accuracy-practice':
        return 'accuracyPractice';
      case 'fluency-practice':
        return 'fluencyPractice';
      case 'assessment':
        return 'assessment';
      case 'onboarding':
        return 'onboarding';
      default:
        return 'other';
    }
  }

  /**
   * Sends both TimeSpentEvent and ActivityEvent for a specific activity
   */
  async sendActivityEvents(data: ActivityEventData): Promise<{success: boolean; message: string; jobId?: string}> {
    try {
      // Get a valid token from oneRosterService
      const accessToken = await getValidOneRosterToken();

      // Get user's email
      const userEmail = await getUserEmail(data.userId);
      
      // Use provided event time or current time
      const eventTime = data.eventTime || new Date().toISOString();
      
      // Only send events if we have either facts count or time spent
      if (!data.factsCount && !data.timeSpent) {
        console.log(`[CaliperEvent] No factsCount or timeSpent - checking if daily goals: ${data.activityType === ActivityType.DAILY_GOALS}`);
        // Allow daily goals events to proceed even without facts/time data
        if (data.activityType !== ActivityType.DAILY_GOALS) {
          return { 
            success: true, 
            message: 'No data to send for this activity'
          };
        }
      }
      
      // Map activity type to resource ID
      const getActivityResourceId = (type: ActivityType) => {
        switch(type) {
          case ActivityType.LEARNING:
            return 'fastmath-learning';
          case ActivityType.ACCURACY_PRACTICE:
            return 'fastmath-accuracy-practice';
          case ActivityType.FLUENCY_PRACTICE:
            return 'fastmath-fluency-practice';
          case ActivityType.ASSESSMENT:
            return 'fastmath-assessment';
          case ActivityType.ONBOARDING:
            return 'fastmath-onboarding';
          case ActivityType.DAILY_GOALS:
            return 'fastmath-daily-goals';
          default:
            return 'fastmath-activity';
        }
      };
      
      // Create array to hold events
      const events = [];
      
      // Add TimeSpentEvent if we have time data
      if (data.timeSpent && data.timeSpent > 0) {
        // Generate UUID for the event
        const timeSpentEventId = `urn:uuid:${uuidv4()}`;
        
        // Debug logging for TimeSpentEvent
        console.log(`[CaliperEvent] Creating TimeSpentEvent:`, {
          activityType: data.activityType,
          activeTime: data.timeSpent,
          wasteTime: data.wasteTime || 0,
          total: (data.timeSpent || 0) + (data.wasteTime || 0)
        });
        
        const timeSpentEvent = {
          "id": timeSpentEventId,
          "type": "TimeSpentEvent",
          "actor": {
            "id": `https://api.alpha-1edtech.com/ims/oneroster/rostering/v1p2/users/${data.userId}`,
            "type": "TimebackUser",
            "email": userEmail || ''
          },
          "action": "SpentTime",
          "object": {
            "id": `https://api.alpha-1edtech.com/ims/activity/context/${data.sessionId}`,
            "type": "TimebackActivityContext",
            "subject": "Math",
            "app": {
              "name": "FastMath"
            },
            "activity": {
              "id": `https://api.alpha-1edtech.com/ims/oneroster/resources/v1p2/resources/${getActivityResourceId(data.activityType)}`,
              "name": data.activityType
            },
            "course": {
              "id": "https://api.alpha-1edtech.com/ims/oneroster/rostering/v1p2/courses/fastmath",
              "name": "FastMath"
            }
          },
          "eventTime": eventTime,
          "profile": "TimebackProfile",
          "generated": {
            "id": `https://api.alpha-1edtech.com/ims/metrics/collections/timespent/${data.sessionId}`,
            "type": "TimebackTimeSpentMetricsCollection",
            "items": [
              { "type": "active", "value": data.timeSpent },
              { "type": "waste", "value": data.wasteTime || 0 }
            ]
          }
        };
        
        events.push(timeSpentEvent);
      }
      
      // Add ActivityEvent if we have facts data or XP data, OR if this is a daily goals completion
      if ((data.factsCount && data.factsCount > 0) || (data.xpEarned && data.xpEarned > 0) || data.activityType === ActivityType.DAILY_GOALS) {
        // Generate UUID for the event
        const activityEventId = `urn:uuid:${uuidv4()}`;
        
        // Initialize items array for metrics
        const items = [];
        
        // Add fact metrics as totalQuestions (valid metric type)
        if (data.factsCount && data.factsCount > 0) {
          items.push({ "type": "totalQuestions", "value": data.factsCount });
        }
        
        // Add XP metrics if available
        if (data.xpEarned && data.xpEarned > 0) {
          items.push({ "type": "xpEarned", "value": data.xpEarned });
        }
        
        const activityEvent = {
          "id": activityEventId,
          "type": "ActivityEvent",
          "actor": {
            "id": `https://api.alpha-1edtech.com/ims/oneroster/rostering/v1p2/users/${data.userId}`,
            "type": "TimebackUser",
            "email": userEmail || ''
          },
          "action": "Completed",
          "object": {
            "id": `https://api.alpha-1edtech.com/ims/activity/context/${data.sessionId}`,
            "type": "TimebackActivityContext",
            "subject": "Math",
            "app": {
              "name": "FastMath"
            },
            "activity": {
              "id": `https://api.alpha-1edtech.com/ims/oneroster/resources/v1p2/resources/${getActivityResourceId(data.activityType)}`,
              "name": data.activityType
            },
            "course": {
              "id": "https://api.alpha-1edtech.com/ims/oneroster/rostering/v1p2/courses/fastmath",
              "name": "FastMath"
            }
          },
          "eventTime": eventTime,
          "profile": "TimebackProfile",
          "generated": {
            "id": `https://api.alpha-1edtech.com/ims/metrics/collections/activity/${data.sessionId}`,
            "type": "TimebackActivityMetricsCollection",
            "items": items,
            "extensions": {
              "factsPracticed": data.factsCount || 0
            }
          }
        };
        
        events.push(activityEvent);
      }
      
      // Only proceed if we have events to send
      if (events.length === 0) {
        return { 
          success: true, 
          message: 'No events to send'
        };
      }
      
      // Prepare the Caliper event object
      const caliperEvent = {
        "sensor": "https://app.fastmath.pro",
        "sendTime": new Date().toISOString(),
        "dataVersion": "http://purl.imsglobal.org/ctx/caliper/v1p2",
        "data": events
      };

      // Send the event to the Caliper API
      const response = await axios.post(
        'https://alpha-caliper-api-production.up.railway.app/caliper/event',
        caliperEvent,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      return { 
        success: true, 
        message: `Caliper events sent successfully for ${data.activityType}`,
        jobId: (response.data as {jobId?: string})?.jobId
      };
      
    } catch (error: any) {
      if (error.isAxiosError) {
        return {
          success: false,
          message: `Failed to send Caliper events: ${error.response?.data?.message || error.message}`
        };
      } else {
        return {
          success: false,
          message: `Internal error sending Caliper events: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  }

  /**
   * Sends a Caliper event when a user reaches 50% of their daily goals
   */
  async sendDailyGoalsHalfCompletedEvent(
    userId: string,
    trackId: string,
    date: string
  ): Promise<void> {
    try {
      console.log(`[CaliperEvent] sendDailyGoalsHalfCompletedEvent called - userId: ${userId}, trackId: ${trackId}, date: ${date}`);
      
      // Create a unique session ID for daily goals 50% completion
      const sessionId = `daily-goals-half-${userId}-${trackId}-${date}`;
      
      // Send 1 mastered unit for 50% completion
      await this.sendMetrics({
        userId,
        sessionId,
        items: { masteredUnits: 1 },
        eventTime: new Date().toISOString()
      });
      
      console.log(`[CaliperEvent] Daily goals 50% completion sent as mastered units (1) successfully`);
      
    } catch (error) {
      // Just log the error - we don't want to fail any operations if Caliper event fails
      console.error(`[CaliperEvent] Error sending daily goals 50% mastered units event for user ${userId}:`, error);
    }
  }

  /**
   * Sends a Caliper event when a user completes 100% of their daily goals
   */
  async sendDailyGoalsCompletedEvent(
    userId: string,
    trackId: string,
    date: string
  ): Promise<void> {
    try {
      console.log(`[CaliperEvent] sendDailyGoalsCompletedEvent called - userId: ${userId}, trackId: ${trackId}, date: ${date}`);
      
      // Create a unique session ID for daily goals 100% completion
      const sessionId = `daily-goals-full-${userId}-${trackId}-${date}`;
      
      // Send 1 mastered unit for 100% completion
      await this.sendMetrics({
        userId,
        sessionId,
        items: { masteredUnits: 1 },
        eventTime: new Date().toISOString()
      });
      
      console.log(`[CaliperEvent] Daily goals 100% completion sent as mastered units (1) successfully`);
      
    } catch (error) {
      // Just log the error - we don't want to fail any operations if Caliper event fails
      console.error(`[CaliperEvent] Error sending daily goals 100% mastered units event for user ${userId}:`, error);
    }
  }

  /**
   * Sends a Caliper ActivityEvent with the provided metrics
   * Used by activityMetricsService.flush() to send rolling counter metrics
   */
  async sendMetrics(data: {
    userId: string;
    sessionId: string;
    items: Record<string, number>;
    eventTime: string;
  }): Promise<void> {
    try {
      // Get a valid token from oneRosterService
      const accessToken = await getValidOneRosterToken();

      // Get user's email
      const userEmail = await getUserEmail(data.userId);
      
      // Convert the items to the format expected by the caliper event
      const items = Object.entries(data.items).map(([type, value]) => ({
        type,
        value
      }));
      
      // Only send if we have items
      if (items.length === 0) {
        return;
      }
      
      // Generate UUID for the event
      const activityEventId = `urn:uuid:${uuidv4()}`;
      
      const activityEvent = {
        "id": activityEventId,
        "type": "ActivityEvent",
        "actor": {
          "id": `https://api.alpha-1edtech.com/ims/oneroster/rostering/v1p2/users/${data.userId}`,
          "type": "TimebackUser",
          "email": userEmail || ''
        },
        "action": "Completed",
        "object": {
          "id": `https://api.alpha-1edtech.com/ims/activity/context/${data.sessionId}`,
          "type": "TimebackActivityContext",
          "subject": "Math",
          "app": {
            "name": "FastMath"
          },
          "activity": {
            "id": "https://api.alpha-1edtech.com/ims/oneroster/resources/v1p2/resources/fastmath-activity-metrics",
            "name": "Activity Metrics"
          },
          "course": {
            "id": "https://api.alpha-1edtech.com/ims/oneroster/rostering/v1p2/courses/fastmath",
            "name": "FastMath"
          }
        },
        "eventTime": data.eventTime,
        "profile": "TimebackProfile",
        "generated": {
          "id": `https://api.alpha-1edtech.com/ims/metrics/collections/activity/${data.sessionId}`,
          "type": "TimebackActivityMetricsCollection",
          "items": items
        }
      };
      
      // Prepare the Caliper event object
      const caliperEvent = {
        "sensor": "https://app.fastmath.pro",
        "sendTime": new Date().toISOString(),
        "dataVersion": "http://purl.imsglobal.org/ctx/caliper/v1p2",
        "data": [activityEvent]
      };

      // Send the event to the Caliper API
      await axios.post(
        'https://alpha-caliper-api-production.up.railway.app/caliper/event',
        caliperEvent,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
    } catch (error: any) {
      console.error('Error sending metrics Caliper event:', error);
      // Don't throw - we don't want to fail the flush operation
    }
  }
}

export default new CaliperEventService(); 