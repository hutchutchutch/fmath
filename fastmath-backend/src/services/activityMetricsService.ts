import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import caliperEventService from './caliperEventService';
import { ActivityType } from './caliperEventService';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

const METRICS_TABLE = process.env.METRICS_TABLE || 'FastMath2';

export interface FlushResult {
  activeTime: number;
  wasteTime: number;
  xpEarned: number;
  totalQuestions?: number;
  correctQuestions?: number;
}

interface MetricDeltas {
  xpEarned?: number;
  totalQuestions?: number;
  correctQuestions?: number;
  masteredUnits?: number;
  timeSpent?: number;
  activeTime?: number;
}

class ActivityMetricsService {
  private flushInProgress = new Set<string>(); // Track ongoing flushes per user

  /**
   * Clear all delta metrics for a user for today.
   * This should be called at the start of a new session to prevent
   * accumulation from previous sessions or failed flushes.
   */
  async clearDeltas(userId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      // Get current item to see what delta attributes exist
      const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
      const getResult = await dynamoDB.send(new GetCommand({
        TableName: METRICS_TABLE,
        Key: {
          PK: `USER#${userId}`,
          SK: `METRICS#${today}`
        }
      }));

      const currentItem = getResult.Item;
      if (!currentItem) {
        // No metrics to clear
        return;
      }

      // Build REMOVE expression for all delta attributes
      const removeExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      
      ['timeSpent', 'activeTime', 'xpEarned', 'totalQuestions', 'correctQuestions', 'masteredUnits'].forEach(metric => {
        const deltaAttrName = `${metric}Delta`;
        if (currentItem[deltaAttrName] !== undefined) {
          const deltaKey = `#${metric}Delta`;
          expressionAttributeNames[deltaKey] = deltaAttrName;
          removeExpressions.push(deltaKey);
        }
      });

      if (removeExpressions.length > 0) {
        const command = new UpdateCommand({
          TableName: METRICS_TABLE,
          Key: {
            PK: `USER#${userId}`,
            SK: `METRICS#${today}`
          },
          UpdateExpression: `REMOVE ${removeExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames
        });

        await dynamoDB.send(command);
      }
    } catch (error) {
      console.error('[ActivityMetrics] Error clearing deltas:', error);
    }
  }

  /**
   * Atomically increments metric counters for a given user and day.
   * @param userId The ID of the user.
   * @param deltas An object containing the metrics to increment.
   * @param requestId Optional unique identifier to prevent duplicate processing
   */
  async addDelta(userId: string, deltas: MetricDeltas, requestId?: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    if (Object.keys(deltas).length === 0) {
      return;
    }

    const updateExpressions: string[] = [];
    const expressionAttributeValues: Record<string, any> = {
      ':lastIncrement': new Date().toISOString()
    };
    const expressionAttributeNames: Record<string, any> = {};

    let i = 0;
    for (const [key, value] of Object.entries(deltas)) {
      if (typeof value !== 'number' || value === 0) continue;
      const valuePlaceholder = `:val${i}`;
      const keyPlaceholder = `#${key}`;
      
      // Use placeholder for attribute name to avoid reserved keywords
      expressionAttributeNames[keyPlaceholder] = `${key}Delta`;
      expressionAttributeValues[valuePlaceholder] = value;
      updateExpressions.push(`${keyPlaceholder} = if_not_exists(${keyPlaceholder}, :zero) + ${valuePlaceholder}`);
      i++;
    }
    
    // Fallback in case all deltas are 0
    if (updateExpressions.length === 0) return;

    const command = new UpdateCommand({
      TableName: METRICS_TABLE,
      Key: {
        PK: `USER#${userId}`,
        SK: `METRICS#${today}`
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}, #lastIncrement = :lastIncrement`,
      ExpressionAttributeNames: { ...expressionAttributeNames, '#lastIncrement': 'lastIncrement' },
      ExpressionAttributeValues: { ...expressionAttributeValues, ':zero': 0 },
      ReturnValues: 'NONE'
    });

    try {
      await dynamoDB.send(command);
    } catch (error) {
      console.error('Error in addDelta:', error);
      // Optional: Add more robust error handling/logging
    }
    }


  /**
   * Flushes the current metric deltas for a user, sends them as a Caliper event,
   * and resets the deltas in DynamoDB.
   * @param userId The ID of the user.
   * @param sessionId The session ID to use for the Caliper event.
   */
  async flush(userId: string, sessionId: string, activityType: ActivityType): Promise<FlushResult | null> {
    // Prevent concurrent flushes for the same user
    const flushKey = `${userId}-${new Date().toISOString().split('T')[0]}`;
    if (this.flushInProgress.has(flushKey)) {
      return null;
    }

    this.flushInProgress.add(flushKey);

    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const key = {
        PK: `USER#${userId}`,
        SK: `METRICS#${today}`
      };

      // First, get the current item to see what attributes exist
      const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
      const getResult = await dynamoDB.send(new GetCommand({
        TableName: METRICS_TABLE,
        Key: key
      }));

      const currentItem = getResult.Item;
      if (!currentItem) {
        // No metrics to flush
        return null;
      }

      // Prepare an update expression that moves deltas to temporary attributes
      // and then removes them, effectively performing a read-and-reset.
      const updateExpressions: string[] = [];
      const removeExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {
        '#lastFlush': 'lastFlush'
      };
      const metricsToFlush = ['timeSpent', 'activeTime', 'xpEarned', 'totalQuestions', 'correctQuestions', 'masteredUnits'];

      // Only process metrics that actually exist in the item
      for (const metric of metricsToFlush) {
        const deltaAttrName = `${metric}Delta`;
        if (currentItem[deltaAttrName] !== undefined) {
          const deltaKey = `#${metric}Delta`;
          const flushedKey = `#${metric}Flushed`;
          expressionAttributeNames[deltaKey] = deltaAttrName;
          expressionAttributeNames[flushedKey] = `${metric}Flushed`;

          updateExpressions.push(`${flushedKey} = ${deltaKey}`);
          removeExpressions.push(`${deltaKey}`);
        }
      }

      // If no delta attributes exist, just update the lastFlush timestamp
      const updateExpression = updateExpressions.length > 0 
        ? `SET ${updateExpressions.join(', ')}, #lastFlush = :lastFlush REMOVE ${removeExpressions.join(', ')}`
        : `SET #lastFlush = :lastFlush`;

      const command = new UpdateCommand({
        TableName: METRICS_TABLE,
        Key: key,
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: {
          ':lastFlush': new Date().toISOString()
        },
        ReturnValues: 'UPDATED_OLD' // Return the values *before* the update
      });

      const { Attributes } = await dynamoDB.send(command);

      if (!Attributes) {
        // Nothing to flush
        return null;
      }

      // Get the raw time values from deltas
      const rawSeconds = Attributes.timeSpentDelta ?? 0;
      const activeSecondsFromDelta = Attributes.activeTimeDelta ?? 0;
      
      // Guard - active cannot exceed raw when sending to Caliper
      const activeSeconds = Math.min(activeSecondsFromDelta, rawSeconds);
      const wasteSeconds = Math.max(rawSeconds - activeSeconds, 0);
      const xpMinutes = activeSeconds / 60;

      // Check for 100% accuracy bonus
      const totalQuestions = Attributes.totalQuestionsDelta ?? 0;
      const correctQuestions = Attributes.correctQuestionsDelta ?? 0;
      let finalXpMinutes = xpMinutes;

      if (totalQuestions > 0 && totalQuestions === correctQuestions) {
        // Apply 20% bonus for perfect accuracy
        finalXpMinutes = xpMinutes * 1.2;
      }

      // Construct the items for the Caliper event from the returned attributes
      const items: Record<string, number> = {};
      let hasValues = false;
    
      // Add XP if we have active time
      if (finalXpMinutes > 0) {
        items.xpEarned = finalXpMinutes;
        hasValues = true;
      }

      // Add other metrics
      for (const metric of ['totalQuestions', 'correctQuestions', 'masteredUnits']) {
          const deltaKey = `${metric}Delta`;
          if (Attributes[deltaKey] !== undefined && typeof Attributes[deltaKey] === 'number') {
              items[metric] = Attributes[deltaKey];
              hasValues = true;
          }
      }

      // Only send event if there are non-zero values
      if (hasValues) {
        await caliperEventService.sendMetrics({
            userId,
            sessionId,
            items,
            eventTime: new Date().toISOString()
        });
      }

      // Always send TimeSpentEvent when we have active time
      if (activeSeconds > 0) {
        await caliperEventService.sendActivityEvents({
          userId,
          sessionId,
          activityType: activityType, // Generic activity type for time tracking
          timeSpent: activeSeconds,  // Send the active time in seconds
          wasteTime: wasteSeconds,   // Waste can be 0
          eventTime: new Date().toISOString()
        });
      }

      // Return the metrics that were sent to Caliper
      return {
        activeTime: activeSeconds,
        wasteTime: wasteSeconds,
        xpEarned: finalXpMinutes,
        totalQuestions: items.totalQuestions,
        correctQuestions: items.correctQuestions
      };
    } catch (error) {
        // A conditional check failure is expected if the item doesn't exist yet,
        // which means there's nothing to flush.
        if (error instanceof Error) {
            if (error.name !== 'ConditionalCheckFailedException') {
                console.error('Error flushing activity metrics:', error);
            }
        } else {
            console.error('An unexpected error occurred during flush:', error);
        }
        return null;
    } finally {
      // Always remove from the set when done
      this.flushInProgress.delete(flushKey);
    }
  }
}

export default new ActivityMetricsService(); 