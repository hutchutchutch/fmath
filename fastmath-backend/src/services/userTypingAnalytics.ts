import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';

interface TypingSpeed {
    average: number;
    totalCount: number;
    weightedTime: number;  // This is count * time
    updatedAt: string;
}

interface TypingInput {
    count: number;
    time: number;
}

class TypingAnalyticsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TypingAnalyticsError';
    }
}

class UserTypingAnalytics {
    private dynamoDb: DynamoDBClient;
    private readonly tableName = 'FastMath2';

    constructor(dynamoDb: DynamoDBClient) {
        this.dynamoDb = dynamoDb;
    }

    private getEmptyStats(): TypingSpeed {
        return {
            average: 0,
            totalCount: 0,
            weightedTime: 0,
            updatedAt: new Date().toISOString()
        };
    }

    async getUserTypingSpeed(userId: string): Promise<TypingSpeed> {
        if (!userId) throw new TypingAnalyticsError('userId is required');

        const params = {
            TableName: this.tableName,
            Key: {
                PK: { S: `USER#${userId}` },
                SK: { S: 'userTypingAnalytics' }
            }
        };

        try {
            const response = await this.dynamoDb.send(new GetItemCommand(params));
            
            if (!response.Item) {
                return this.getEmptyStats();
            }

            return {
                average: Number(response.Item.average?.N || 0),
                totalCount: Number(response.Item.totalCount?.N || 0),
                weightedTime: Number(response.Item.weightedTime?.N || 0),
                updatedAt: response.Item.updatedAt?.S || new Date().toISOString()
            };
        } catch (error) {
            throw new TypingAnalyticsError(
                `Failed to get typing speed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async updateTypingSpeed(userId: string, input: TypingInput): Promise<TypingSpeed> {
        if (!userId) throw new TypingAnalyticsError('userId is required');
        if (typeof input.time !== 'number' || input.time <= 0) {
            throw new TypingAnalyticsError('time must be a positive number');
        }
        if (typeof input.count !== 'number' || input.count <= 0) {
            throw new TypingAnalyticsError('count must be a positive number');
        }

        try {
            // Get current stats
            const currentStats = await this.getUserTypingSpeed(userId);

            // Calculate new weighted values
            const newTotalCount = currentStats.totalCount + input.count;
            const newWeightedTime = currentStats.weightedTime + (input.count * input.time);
            const newAverage = newWeightedTime / newTotalCount;

            const updatedStats: TypingSpeed = {
                average: newAverage,
                totalCount: newTotalCount,
                weightedTime: newWeightedTime,
                updatedAt: new Date().toISOString()
            };

            // Save to DynamoDB
            const params = {
                TableName: this.tableName,
                Item: {
                    PK: { S: `USER#${userId}` },
                    SK: { S: 'userTypingAnalytics' },
                    average: { N: updatedStats.average.toString() },
                    totalCount: { N: updatedStats.totalCount.toString() },
                    weightedTime: { N: updatedStats.weightedTime.toString() },
                    updatedAt: { S: updatedStats.updatedAt }
                }
            };

            await this.dynamoDb.send(new PutItemCommand(params));
            return updatedStats;
        } catch (error) {
            throw new TypingAnalyticsError(
                `Failed to update typing speed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }
}

// Create instance with DynamoDB client
const userTypingAnalytics = new UserTypingAnalytics(new DynamoDBClient({}));

export { userTypingAnalytics, UserTypingAnalytics, TypingSpeed, TypingInput }; 