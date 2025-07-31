import { dynamoDB } from '../config/aws';
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { updateUserClassEnrollment } from './oneRosterService';
import { ONBOARDING_ASSESSMENT_SEQUENCE } from '../types/constants';
import activityMetricsService from './activityMetricsService';

// Define allowed focus track values
const ALLOWED_FOCUS_TRACKS = ['ALL', 'TRACK5', 'TRACK6', 'TRACK7', 'TRACK8', 'TRACK9', 'TRACK10', 'TRACK11', 'TRACK12'];

export const updateUserFocusTrack = async (userId: string): Promise<{success: boolean, message?: string}> => {
    try {
        // First check if user exists
        const userResult = await dynamoDB.send(new GetCommand({
            TableName: 'FastMath2',
            Key: {
                PK: `USER#${userId}`,
                SK: 'PROFILE'
            }
        }));

        if (!userResult.Item) {
            return {
                success: false,
                message: 'User not found'
            };
        }

        // Get current track from user profile
        const currentTrack = userResult.Item.focusTrack;
        
        // If focusTrack doesn't exist in the user profile, return success without making changes
        if (currentTrack === undefined) {
            return {
                success: true,
                message: 'No focus track found in user profile. No changes made.'
            };
        }
        
        // If user already has ALL access, nothing to update
        if (currentTrack === 'ALL') {
            return {
                success: true,
                message: 'Focus track already set to ALL. No changes made.'
            };
        }

        // Determine next track based on current track using the onboarding sequence
        let nextTrackId: string | null;
        let updateExpression: string;
        let expressionAttributeValues: any = {};
        
        // Find current track index in the progression sequence
        const currentTrackIndex = ONBOARDING_ASSESSMENT_SEQUENCE.indexOf(currentTrack as any);
        
        if (currentTrackIndex !== -1 && currentTrackIndex < ONBOARDING_ASSESSMENT_SEQUENCE.length - 1) {
            // Move to next track in sequence
            nextTrackId = ONBOARDING_ASSESSMENT_SEQUENCE[currentTrackIndex + 1];
        } else if (currentTrackIndex === ONBOARDING_ASSESSMENT_SEQUENCE.length - 1) {
            // At end of sequence, give access to all tracks
            nextTrackId = 'ALL';
        } else {
            // Track not in sequence, default to ALL
            nextTrackId = 'ALL';
        }
        
        // Validate that the nextTrackId is one of the allowed values
        if (!ALLOWED_FOCUS_TRACKS.includes(nextTrackId)) {
            return {
                success: false,
                message: `Invalid focusTrack value. Must be one of: ${ALLOWED_FOCUS_TRACKS.join(', ')}`
            };
        }
        
        updateExpression = 'SET focusTrack = :focusTrack';
        expressionAttributeValues = {
            ':focusTrack': nextTrackId
        };

        // Update the user's profile
        await dynamoDB.send(new UpdateCommand({
            TableName: 'FastMath2',
            Key: {
                PK: `USER#${userId}`,
                SK: 'PROFILE'
            },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined
        }));

        // XP is now awarded based on active time, not track progression

        // Update OneRoster class enrollment to match the new focus track
        if (userResult.Item?.email) {
            try {
                const enrollmentResult = await updateUserClassEnrollment(userId, userResult.Item.email as string, nextTrackId);
                
                if (enrollmentResult.success) {
                    console.log(`Successfully updated OneRoster enrollment: ${enrollmentResult.message}`);
                } else {
                    console.error(`Failed to update OneRoster enrollment: ${enrollmentResult.message}`);
                    // Don't fail the focus track update if OneRoster update fails
                }
            } catch (enrollmentError) {
                console.error(`Error updating OneRoster enrollment for user ${userId}:`, enrollmentError);
                // Don't fail the focus track update if OneRoster update fails
            }
        } else {
            console.warn(`Could not update OneRoster enrollment - user email not found for userId ${userId}`);
        }

        return {
            success: true,
            message: `Focus track updated to ${nextTrackId}`
        };
    } catch (error) {
        console.error('Error updating user focusTrack:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
};

// Helper function to set initial focus track during onboarding
export const setInitialFocusTrack = async (userId: string, trackId: string): Promise<{success: boolean, message?: string}> => {
    try {
        // Validate the track ID
        if (!ALLOWED_FOCUS_TRACKS.includes(trackId)) {
            return {
                success: false,
                message: `Invalid track ID: ${trackId}. Allowed tracks: ${ALLOWED_FOCUS_TRACKS.join(', ')}`
            };
        }

        // First check if user exists
        const userResult = await dynamoDB.send(new GetCommand({
            TableName: 'FastMath2',
            Key: {
                PK: `USER#${userId}`,
                SK: 'PROFILE'
            }
        }));

        if (!userResult.Item) {
            return {
                success: false,
                message: 'User not found'
            };
        }

        // Set the focus track
        await dynamoDB.send(new UpdateCommand({
            TableName: 'FastMath2',
            Key: {
                PK: `USER#${userId}`,
                SK: 'PROFILE'
            },
            UpdateExpression: 'SET focusTrack = :focusTrack',
            ExpressionAttributeValues: {
                ':focusTrack': trackId
            }
        }));

        return {
            success: true,
            message: `Initial focus track set to ${trackId}`
        };
    } catch (error) {
        console.error('Error setting initial focus track:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}; 