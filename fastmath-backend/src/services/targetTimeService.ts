import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CQPM_TARGETS, FLUENCY_TARGETS } from '../types/constants';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'FastMath2';

const DEFAULT_TARGET_SECONDS = 3;

const calculateTypingSpeed = async (grade: number, userId: string): Promise<number> => {
    try {
        // First check if user has typing analytics
        const analyticsResult = await dynamoDB.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}`,
                SK: 'userTypingAnalytics'
            }
        }));

        // Calculate default typing speed based on grade
        const boundedGrade = Math.min(Math.max(grade, 1), 12);
        const startMs = 500;
        const endMs = 200;
        const totalGrades = 11;
        const msPerGrade = (startMs - endMs) / totalGrades;
        const defaultTimePerDigit = startMs - (boundedGrade - 1) * msPerGrade;

        // If no analytics data available, use default calculation
        if (!analyticsResult.Item || !analyticsResult.Item.average || analyticsResult.Item.totalCount === 0) {
            return defaultTimePerDigit / 1000;
        }

        const measuredTypingTime = analyticsResult.Item.average;
        const totalCount = analyticsResult.Item.totalCount;

        // If we have enough reliable measurements, use the measured time
        if (totalCount > 10 && measuredTypingTime <= 500) {
            // Convert to seconds with no minimum limit
            return measuredTypingTime / 1000;
        }

        // Otherwise, use the average of measured and default
        const averageTime = (measuredTypingTime + defaultTimePerDigit) / 2;

        // Clamp the result between 200 and 500 ms
        if (averageTime <= 100) return 0.1;  // 200ms = 0.2s
        if (averageTime >= 500) return 0.5;  // 500ms = 0.5s
        return averageTime / 1000;  // Convert ms to seconds

    } catch (error) {
        console.error('Error fetching typing analytics:', error);
        // Fallback to default calculation on error
        const boundedGrade = Math.min(Math.max(grade, 1), 12);
        const startMs = 500;
        const endMs = 200;
        const totalGrades = 11;
        const msPerGrade = (startMs - endMs) / totalGrades;
        const timePerDigit = startMs - (boundedGrade - 1) * msPerGrade;
        return timePerDigit / 1000;
    }
};

interface TargetTimeResponse {
    timePerDigit: number;
    targetTime: number;
}

export const getTargetTimeService = async (userId: string, trackId: string): Promise<TargetTimeResponse> => {
    try {
        // Get user profile for grade level
        const result = await dynamoDB.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND SK = :sk',
            ExpressionAttributeValues: {
                ':pk': `USER#${userId}`,
                ':sk': 'PROFILE'
            }
        }));

        if (!result.Items?.[0]) {
            return {
                timePerDigit: await calculateTypingSpeed(1, userId),
                targetTime: DEFAULT_TARGET_SECONDS
            };
        }

        const userGrade = result.Items[0].ageGrade;
        
        // Use FLUENCY_TARGETS directly instead of calculating from CQPM
        const targetTime = FLUENCY_TARGETS[userGrade] || FLUENCY_TARGETS[12];
        
        return {
            timePerDigit: await calculateTypingSpeed(userGrade, userId),
            targetTime: Number(targetTime.toFixed(1))
        };
    } catch (error) {
        console.error('Error calculating target time:', error);
        return {
            timePerDigit: await calculateTypingSpeed(1, userId),
            targetTime: DEFAULT_TARGET_SECONDS
        };
    }
};