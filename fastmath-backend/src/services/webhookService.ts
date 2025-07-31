import axios from 'axios';
// import pRetry from 'p-retry'; Comment out the static import
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import dotenv from 'dotenv';

dotenv.config();

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});
const TABLE_NAME = 'FastMath2';

// Updated webhook URL for Phase 3
const SPEEDRUN_WEBHOOK_URL = process.env.SPEEDRUN_WEBHOOK_URL || 'https://server.fastmath.pro/fastmath/webhook';

interface WebhookPayload {
  email: string;
  trackId: string;
  cqpmScore: number;
  completedAt: string; // ISO-8601 UTC format
  assessmentId?: string; // optional internal reference
}

// Define an interface for the error object from p-retry's onFailedAttempt
interface PRetryError extends Error {
  attemptNumber: number;
  retriesLeft: number;
}

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const result = await dynamoDB.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'PROFILE'
      }
    }));

    return result.Items?.[0]?.email || null;
  } catch (error) {
    console.error('Error getting user email for webhook:', error);
    return null;
  }
}

export async function sendAssessmentCompletion(payload: WebhookPayload): Promise<void> {
  try {
    // Dynamically import p-retry
    const pRetry = (await new Function('return import("p-retry")')()).default;

    await pRetry(
      async () => {
        await axios.post(SPEEDRUN_WEBHOOK_URL, payload, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 second timeout
        });
      },
      {
        retries: 3,
        factor: 2, // Exponential backoff factor
        minTimeout: 1000, // Start with 1 second
        maxTimeout: 8000, // Max 8 seconds
        onFailedAttempt: (error: PRetryError) => {
          console.warn(`Webhook attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`, error.message);
        }
      }
    );

    console.log('Assessment completion webhook sent successfully:', payload);
  } catch (error) {
    console.error('Error sending assessment completion webhook after retries:', error);
  }
}

// Legacy function maintained for backward compatibility
export async function sendAssessmentCompletionWebhook(
  userId: string,
  trackId: string,
  cqpm: number
): Promise<void> {
  try {
    const email = await getUserEmail(userId);
    if (!email) {
      console.error('Cannot send webhook: user email not found for userId:', userId);
      return;
    }

    const payload: WebhookPayload = {
      email,
      trackId,
      cqpmScore: cqpm,
      completedAt: new Date().toISOString()
    };

    await sendAssessmentCompletion(payload);
  } catch (error) {
    console.error('Error in legacy webhook function:', error);
  }
} 