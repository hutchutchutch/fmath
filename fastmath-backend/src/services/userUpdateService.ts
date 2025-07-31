import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});

const TABLE_NAME = process.env.TABLE_NAME || 'FastMath2';

/**
 * Helper function to find and update a user by email
 * @private
 */
async function findAndUpdateUser(email: string, updateExpression: string, expressionAttributeValues: Record<string, any>): Promise<{
    success: boolean;
    message: string;
    userId?: string;
}> {
    try {
        // Normalize email
        const normalizedEmail = email.toLowerCase();
        
        // Find user by email
        const existingUser = await dynamoDB.send(new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'email-index',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': normalizedEmail
            },
            Limit: 1
        }));

        if (!existingUser.Items || existingUser.Items.length === 0) {
            return {
                success: false,
                message: `User with email ${email} not found`
            };
        }

        const userId = existingUser.Items[0].userId;
        
        // Update user
        await dynamoDB.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}`,
                SK: 'PROFILE'
            },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues
        }));
        
        return {
            success: true,
            message: `Successfully updated user ${email}`,
            userId
        };
    } catch (error) {
        console.error(`Error updating user ${email}:`, error);
        throw error instanceof Error 
            ? error 
            : new Error(`Failed to update user ${email}`);
    }
}

/**
 * Update multiple users' grades in a batch
 */
export const updateUserGradesBatch = async (updates: {email: string; grade: number}[]): Promise<{
    success: boolean;
    message: string;
    results: {
        email: string;
        success: boolean;
        message: string;
        userId?: string;
    }[];
}> => {
    const results = [];
    let success = true;

    for (const update of updates) {
        try {
            const result = await findAndUpdateUser(
                update.email, 
                'SET ageGrade = :grade', 
                { ':grade': update.grade }
            );
            
            results.push({
                email: update.email,
                ...result
            });
            
            if (!result.success) success = false;
        } catch (error) {
            results.push({
                email: update.email,
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            });
            success = false;
        }
    }

    return {
        success,
        message: success ? 'All grades updated successfully' : 'Some grade updates failed',
        results
    };
};

/**
 * Update multiple users' tracks in a batch
 */
export const updateUserTracksBatch = async (updates: {email: string; track: string}[]): Promise<{
    success: boolean;
    message: string;
    results: {
        email: string;
        success: boolean;
        message: string;
        userId?: string;
    }[];
}> => {
    const results = [];
    let success = true;

    for (const update of updates) {
        try {
            const result = await findAndUpdateUser(
                update.email, 
                'SET focusTrack = :track', 
                { ':track': update.track }
            );
            
            results.push({
                email: update.email,
                ...result
            });
            
            if (!result.success) success = false;
        } catch (error) {
            results.push({
                email: update.email,
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            });
            success = false;
        }
    }

    return {
        success,
        message: success ? 'All tracks updated successfully' : 'Some track updates failed',
        results
    };
};

/**
 * Update multiple users' campus information in a batch
 */
export const updateUserCampusBatch = async (updates: {email: string; campus: string}[]): Promise<{
    success: boolean;
    message: string;
    results: {
        email: string;
        success: boolean;
        message: string;
        userId?: string;
    }[];
}> => {
    const results = [];
    let success = true;

    for (const update of updates) {
        try {
            const result = await findAndUpdateUser(
                update.email, 
                'SET campus = :campus', 
                { ':campus': update.campus }
            );
            
            results.push({
                email: update.email,
                ...result
            });
            
            if (!result.success) success = false;
        } catch (error) {
            results.push({
                email: update.email,
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            });
            success = false;
        }
    }

    return {
        success,
        message: success ? 'All campus updates completed successfully' : 'Some campus updates failed',
        results
    };
}; 