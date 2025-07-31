import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { searchUsers } from '../services/adminService';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});
const TABLE_NAME = 'FastMath2';

interface UserTrackPair {
    email: string;
    trackId: string;
}

async function resetUserProgress(email: string, trackId: string) {
    try {
        // 1. Find user ID from email
        const { users } = await searchUsers(email);
        if (!users || users.length === 0) {
            throw new Error(`No user found with email: ${email}`);
        }
        const userId = users[0].userId;

        // 2. Delete progress item
        await dynamoDB.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}`,
                SK: `PROGRESS#${trackId}`
            }
        }));

        // 3. Delete fluency map item
        await dynamoDB.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}`,
                SK: `FLUENCY#${trackId}`
            }
        }));

        console.log(`Successfully reset progress for user ${email} (${userId}) on track ${trackId}`);
    } catch (error) {
        console.error(`Error resetting progress for ${email} on track ${trackId}:`, error);
        throw error;
    }
}

async function resetMultipleUsersProgress(userTrackPairs: UserTrackPair[]) {
    console.log(`Starting to reset progress for ${userTrackPairs.length} users...`);
    
    for (const { email, trackId } of userTrackPairs) {
        try {
            await resetUserProgress(email, trackId);
        } catch (error) {
            console.error(`Failed to reset progress for ${email} on track ${trackId}`);
            // Continue with next user even if one fails
            continue;
        }
    }
    
    console.log('Finished processing all users');
}

// List of users and their tracks to reset
const usersToReset: UserTrackPair[] = [
    { email: 'anthem.thomas@alpha.school', trackId: 'TRACK9' },
    { email: 'jazaiah.wilburn@2hourlearning.com', trackId: 'TRACK12' },
    { email: 'kamila.gonzalez-romero@2hourlearning.com', trackId: 'TRACK12' },
    { email: 'victoria.marrin.barrios@2hourlearning.com', trackId: 'TRACK12' },
    { email: 'dsean.harden@alpha.school', trackId: 'TRACK6' },
    { email: 'sophie.chang@novatio.school', trackId: 'TRACK8' },
    { email: 'edgar.shinar@alpha.school', trackId: 'TRACK6' },
    { email: 'sam.ratcliff@alpha.school', trackId: 'TRACK6' },
    { email: 'hasini.chandrakumar@2hourlearning.com', trackId: 'TRACK8' },
    { email: 'ian.mentgen@alpha.school', trackId: 'TRACK6' }
];

// Execute the reset
resetMultipleUsersProgress(usersToReset)
    .then(() => console.log('Reset operation completed'))
    .catch(error => console.error('Reset operation failed:', error));

export { resetUserProgress, resetMultipleUsersProgress }; 