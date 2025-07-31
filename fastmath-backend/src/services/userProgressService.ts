import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand, BatchWriteCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { UserProgress, FactProgress, FactStatus, SetUserProgressRequest } from '../types/progress';
import { isSameDay, addDays } from '../utils/dateUtils';
import { FLUENCY_TARGETS, TRACK_RANGES } from '../types/constants';
import { processFactCompletionForGoalsService, completeLearningGoalForFactService } from './dailyGoalsService';
import activityMetricsService from './activityMetricsService';

const client = new DynamoDBClient({});
export const dynamoDB = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});
export const TABLE_NAME = 'FastMath2';

// Define retention schedule days
const RETENTION_SCHEDULE = [1, 3, 7, 16, 35, 75];

// Helper function to check if a status change represents genuine progression
function isStatusProgression(currentStatus: FactStatus, newStatus: FactStatus): boolean {
    const statusHierarchy: FactStatus[] = [
        'notStarted', 
        'learning', 
        'accuracyPractice', 
        'fluency6Practice', 
        'fluency3Practice', 
        'fluency2Practice', 
        'fluency1_5Practice', 
        'fluency1Practice', 
        'mastered', 
        'automatic'
    ];
    
    const currentIndex = statusHierarchy.indexOf(currentStatus);
    const newIndex = statusHierarchy.indexOf(newStatus);
    
    // Return true only if new status is higher in the hierarchy
    return newIndex > currentIndex;
}

// Define fluency levels array for use in multiple functions
const fluencyLevels: FactStatus[] = [
    'fluency6Practice',
    'fluency3Practice',
    'fluency2Practice',
    'fluency1_5Practice',
    'fluency1Practice',
    'mastered'
];

// Helper function to get next track ID
const getNextTrackId = (currentTrackId: string): string => {
    const trackNumber = parseInt(currentTrackId.replace('TRACK', ''));
    return `TRACK${trackNumber + 1}`;
};

// Helper function to get the user's grade level
async function getUserGrade(userId: string): Promise<number> {
    try {
        const result = await dynamoDB.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND SK = :sk',
            ExpressionAttributeValues: {
                ':pk': `USER#${userId}`,
                ':sk': 'PROFILE'
            }
        }));

        if (!result.Items?.[0]) {
            return 12; // Default to grade 12 if no profile found
        }

        return result.Items[0].ageGrade || 1;
    } catch (error) {
        console.error('Error getting user grade:', error);
        return 12; // Default to grade 12 on error
    }
}

// Helper function to determine the appropriate fluency level based on response time
async function getFluencyLevelFromResponseTime(avgResponseTime: number, userId: string): Promise<FactStatus> {
    // Get user's grade level
    const userGrade = await getUserGrade(userId);
    
    // Get target fluency for the user's grade
    const targetFluency = FLUENCY_TARGETS[userGrade] || FLUENCY_TARGETS[12];
    
    // If user has reached their target fluency level for their grade, return automatic
    if (avgResponseTime <= targetFluency) {
        return 'mastered';
    }
    
    // Otherwise use the standard fluency levels
    if (avgResponseTime <= 1) {
        return 'mastered';
    } else if (avgResponseTime <= 1.5) {
        return 'fluency1Practice';
    } else if (avgResponseTime <= 2) {
        return 'fluency1_5Practice';
    } else if (avgResponseTime <= 3) {
        return 'fluency2Practice';
    } else if (avgResponseTime <= 6) {
        return 'fluency3Practice';
    } else {
        return 'fluency6Practice';
    }
}

// Helper function to get the next fluency level
function getNextFluencyLevel(currentStatus: FactStatus): FactStatus | null {
    const currentIndex = fluencyLevels.indexOf(currentStatus as FactStatus);
    
    if (currentIndex === -1 || currentIndex === fluencyLevels.length - 1) {
        return null; // Not found or already at the last level
    }
    
    return fluencyLevels[currentIndex + 1];
}

// Helper function to validate if a fact belongs to a track
function isFactInTrackRange(factId: string, trackId: string): boolean {
    const factNumber = parseInt(factId.replace('FACT', ''));
    const range = TRACK_RANGES[trackId as keyof typeof TRACK_RANGES];
    
    if (!range) {
        console.error(`[UserProgress] Invalid track ID: ${trackId}`);
        return false;
    }
    
    const [min, max] = range;
    return factNumber >= min && factNumber <= max;
}

export const getUserProgressService = async (userId: string): Promise<UserProgress[] | null> => {
    const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': 'PROGRESS#'
        },
        ScanIndexForward: true
    };

    const result = await dynamoDB.send(new QueryCommand(params));
    const items = result.Items as UserProgress[];

    if (!items || items.length === 0) {
        return null;
    }

    return items;
};

export const setUserProgressService = async (userId: string, trackId: string, progress: SetUserProgressRequest, userDate?: string) => {
    // First, fetch the user's profile to get their focusTrack
    const userProfile = await dynamoDB.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: {
            PK: `USER#${userId}`,
            SK: 'PROFILE'
        }
    }));
    
    if (!userProfile.Item) {
        throw new Error(`User profile not found for userId: ${userId}`);
    }
    
    // Determine the actual track ID to use
    let actualTrackId = trackId;
    if (userProfile.Item.focusTrack && userProfile.Item.focusTrack !== 'ALL') {
        // User has a specific focus track, use it instead of the provided trackId
        actualTrackId = userProfile.Item.focusTrack;
        
        if (actualTrackId !== trackId) {
            console.log(`[UserProgress] Overriding trackId from ${trackId} to ${actualTrackId} based on user's focusTrack`);
        }
    }
    
    // Validate that all facts belong to the track
    if (progress.facts) {
        const invalidFacts = [];
        for (const factId of Object.keys(progress.facts)) {
            if (!isFactInTrackRange(factId, actualTrackId)) {
                invalidFacts.push(factId);
            }
        }
        
        if (invalidFacts.length > 0) {
            console.error(`[UserProgress] Rejecting update - facts outside track range: ${invalidFacts.join(', ')} for track ${actualTrackId}`);
            throw new Error(`Invalid facts for track ${actualTrackId}: ${invalidFacts.join(', ')}`);
        }
    }
    
    // Now get the current state once to determine status changes and complex business logic
    const existingProgress = await dynamoDB.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': `PROGRESS#${actualTrackId}`
        }
    }));
    
    const currentTimestamp = new Date().toISOString();
    const today = userDate || new Date().toISOString().split('T')[0];
    const existingItem = existingProgress.Items?.[0];
    
    // If it's a new item, we'll create it first with basic structure
    if (!existingItem) {
        await dynamoDB.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: `USER#${userId}`,
                SK: `PROGRESS#${actualTrackId}`,
                trackId: actualTrackId,
                startDate: currentTimestamp,
                lastUpdated: currentTimestamp,
                status: progress.status,
                facts: {},
                overallCQPM: 0,
                accuracyRate: 0
            }
        }));
    }
    
    // Process each fact update individually using atomic operations
    const factUpdatePromises = Object.entries(progress.facts || {}).map(async ([factId, newFact]) => {
        const existingFact = existingItem?.facts?.[factId];
        const newAttempts = newFact.attempts || 0;
        const newCorrect = newFact.correct || 0;
        const newTimeSpent = newFact.timeSpent || 0;
        const practiceContext = newFact.practiceContext || 'default';
        
        if (newAttempts === 0 && !newFact.status) {
            return;
        }
        
        // Add metrics for the current attempt
        if (newAttempts > 0) {
            // Calculate raw and active time
            const rawSeconds = Math.round(newTimeSpent / 1000); // Convert milliseconds to seconds
            const activeSeconds = rawSeconds * 1.8; // 1.8x multiplier for question time
            
            await activityMetricsService.addDelta(userId, {
                totalQuestions: newAttempts,
                correctQuestions: newCorrect,
                activeTime: activeSeconds
            });
        }
        
        // Check if this might be the first attempt for this fact
        const isNewFact = !existingFact;
        
        // Get current date for same-day checks
        const currentDate = new Date(currentTimestamp);
        
        // Determine if existing attempts were made today (if any)
        let isSameDayAsLastAttempt = false;
        if (existingFact?.lastAttemptDate) {
            isSameDayAsLastAttempt = isSameDay(new Date(existingFact.lastAttemptDate), new Date(today));
        }
        
        // Process status updates - this requires the current state and can't be done atomically
        // We'll handle this in a separate update if needed
        let statusUpdates: Record<string, any> = {};
        let accuracyProgressUpdates: Record<string, any> = {};
        let retentionUpdates: Record<string, any> = {};
        
        // Get the current status and other important values
        const currentStatus = existingFact?.status || 'notStarted';
        const existingAccuracyProgress = existingFact?.accuracyProgress;
        const existingRetentionDay = existingFact?.retentionDay;
        const existingNextRetentionDate = existingFact?.nextRetentionDate;
        
        // Calculate updated todayStats values grouped by practiceContext
        let todayStats = existingFact?.todayStats || {};
        
        // Reset todayStats if it's a new day
        if (!isSameDayAsLastAttempt) {
            todayStats = {};
        }
        
        // Initialize context if it doesn't exist
        if (!todayStats[practiceContext]) {
            todayStats[practiceContext] = {
                attempts: 0,
                correct: 0,
                timeSpent: 0,
                avgResponseTime: undefined,
                date: currentTimestamp
            };
        }

        // If it's from today, update the existing context stats
        if (isSameDayAsLastAttempt && todayStats[practiceContext]) {
            const existingContextStats = todayStats[practiceContext];
            const existingContextAttempts = existingContextStats.attempts || 0;
            const existingContextCorrect = existingContextStats.correct || 0;
            const existingContextTimeSpent = existingContextStats.timeSpent || 0;
            
            // Calculate updated context stats
            const contextAttempts = existingContextAttempts + newAttempts;
            const contextCorrect = existingContextCorrect + newCorrect;
            const contextTimeSpent = existingContextTimeSpent + newTimeSpent;
            
            // Update the context stats
            todayStats[practiceContext] = {
                attempts: contextAttempts,
                correct: contextCorrect,
                timeSpent: contextTimeSpent,
                avgResponseTime: contextAttempts > 0 ? (contextTimeSpent / contextAttempts) / 1000 : undefined,
                date: currentTimestamp
            };

        } else {
            // It's a new day or new context, create new context stats
            todayStats[practiceContext] = {
                attempts: newAttempts,
                correct: newCorrect,
                timeSpent: newTimeSpent,
                avgResponseTime: newAttempts > 0 ? (newTimeSpent / newAttempts) / 1000 : undefined,
                date: currentTimestamp
            };

        }

        // Calculate totals across all practiceContexts for progression logic
        const totalAttempts = Object.values(todayStats).reduce((sum: number, stats: any) => sum + (stats.attempts || 0), 0);
        const totalCorrect = Object.values(todayStats).reduce((sum: number, stats: any) => sum + (stats.correct || 0), 0);
        const totalTimeSpent = Object.values(todayStats).reduce((sum: number, stats: any) => sum + (stats.timeSpent || 0), 0);
        const totalAvgResponseTime = totalAttempts > 0 ? (totalTimeSpent / totalAttempts) / 1000 : undefined;

        // Check if all attempts today were correct using totals
        const allTodayAttemptsCorrect = totalAttempts === totalCorrect && totalAttempts > 0;
        const hasEnoughAttemptsToday = totalAttempts >= 3;
        const isFirstPerfectAttempt = isNewFact && newAttempts === 1 && newCorrect === 1;
        
        // Determine new status based on current status and performance
        let newStatus = currentStatus;
        let statusUpdatedDate = existingFact?.statusUpdatedDate;

        // Check if client is explicitly setting a status for this fact
        const isExplicitStatusProvided = newFact.status !== undefined;
        
        // Always prioritize explicitly provided status from frontend
        if (isExplicitStatusProvided) {
            // Honor the client's status setting
            newStatus = newFact.status as FactStatus;
            statusUpdatedDate = currentTimestamp;
            statusUpdates['facts.#factId.status'] = newStatus;
            statusUpdates['facts.#factId.statusUpdatedDate'] = statusUpdatedDate;
            
            // XP is now awarded based on active time, not fact progression
            
            // If status is changing from 'learning' to 'accuracyPractice', complete the learning goal.
            if (currentStatus === 'learning' && newStatus === 'accuracyPractice') {
                await completeLearningGoalForFactService(userId, actualTrackId, factId, today);
            }

            // Initialize additional data based on the status
            if (newStatus === 'mastered' && (!existingFact || !existingFact.nextRetentionDate)) {
                // Initialize retention tracking
                const nextDate = addDays(currentDate, 1);
                retentionUpdates['facts.#factId.retentionDay'] = 1;
                retentionUpdates['facts.#factId.nextRetentionDate'] = nextDate.toISOString();
            } else if (newStatus === 'accuracyPractice' && (!existingFact || !existingFact.accuracyProgress)) {
                // Initialize accuracy progress
                accuracyProgressUpdates['facts.#factId.accuracyProgress'] = { streak: 0 };
            }
        } 
        // Only apply progression logic when no explicit status is provided and for specific status types
        else if (!isNewFact) {
            // Define the goal criteria check here
            const contextStats = todayStats[practiceContext];
            const contextAttempts = contextStats?.attempts || 0;
            const contextCorrect = contextStats?.correct || 0;
            const allContextAttemptsCorrect = contextAttempts === contextCorrect && contextAttempts > 0;
            const hasEnoughAttemptsInContext = contextAttempts >= 3;
            const hasMetProgressionCriteria = (allContextAttemptsCorrect && hasEnoughAttemptsInContext) || (allTodayAttemptsCorrect && hasEnoughAttemptsToday);

            // NEW, DECOUPLED GOAL COMPLETION LOGIC
            // First, check if the goal completion criteria has been met for this fact today.
            if (hasMetProgressionCriteria) {
                // Determine which daily-goal bucket this attempt should affect.
                // Priority order:
                //   1) Prefix of practiceContext (e.g. "fluency1", "accuracy2")
                //   2) Fallback to fact's current status.
                let goalContext: 'accuracy' | 'fluency' | null = null;

                if (practiceContext?.startsWith('fluency')) {
                    goalContext = 'fluency';
                } else if (practiceContext?.startsWith('accuracy')) {
                    goalContext = 'accuracy';
                } else if (currentStatus === 'accuracyPractice') {
                    goalContext = 'accuracy';
                } else if (currentStatus.includes('fluency')) {
                    goalContext = 'fluency';
                }

                if (goalContext) {
                    // This service is idempotent; it won't increment the goal if it has already
                    // been completed for this fact today.
                    await processFactCompletionForGoalsService(userId, actualTrackId, factId, today, currentStatus, goalContext);
                }
            }
            
            // ORIGINAL STATUS PROGRESSION LOGIC (UNCHANGED)
            // Handle accuracy practice progression to fluency practice
            if (currentStatus === 'accuracyPractice') {
                if (allTodayAttemptsCorrect && hasEnoughAttemptsToday) {
                    // Special promotion case: if user has made at least 6 correct attempts today,
                    // promote directly to fluency6Practice regardless of streak
                    if (totalAttempts >= 6) {
                        newStatus = 'fluency6Practice';
                        statusUpdatedDate = currentTimestamp;
                        statusUpdates['facts.#factId.status'] = newStatus;
                        statusUpdates['facts.#factId.statusUpdatedDate'] = statusUpdatedDate;
                        
                        // XP is now awarded based on active time, not fact progression
                        
                        // Reset accuracy progress as we're moving to fluency practice
                        accuracyProgressUpdates['facts.#factId.accuracyProgress'] = null;
                        
                        // Check if we should complete fluency goal (when accuracyPractice fact gets promoted to fluency)
                        if (totalCorrect >= 3) {
                            await processFactCompletionForGoalsService(userId, actualTrackId, factId, today, currentStatus, 'fluency');
                        }
                    }
                    // Check if we've already completed the required streak
                    else if (existingAccuracyProgress && existingAccuracyProgress.streak >= 2) {
                        // We've completed 3 days (streak of 2 + today), promote to appropriate fluency level
                        const avgResponseTime = totalAvgResponseTime !== undefined ? 
                            totalAvgResponseTime : 
                            6; // Default to lowest fluency if no response time
                        
                        // Determine which fluency level to promote to based on response time
                        const nextStatus = await getFluencyLevelFromResponseTime(avgResponseTime, userId);
                        
                        newStatus = nextStatus;
                        statusUpdatedDate = currentTimestamp;
                        statusUpdates['facts.#factId.status'] = newStatus;
                        statusUpdates['facts.#factId.statusUpdatedDate'] = statusUpdatedDate;
                        
                        // XP is now awarded based on active time, not fact progression
                        
                        // Reset accuracy progress as we're moving to fluency practice
                        accuracyProgressUpdates['facts.#factId.accuracyProgress'] = null;
                        
                        // Check if we should complete fluency goal (when accuracyPractice fact gets promoted to fluency)
                        if (totalCorrect >= 3) {
                            await processFactCompletionForGoalsService(userId, actualTrackId, factId, today, currentStatus, 'fluency');
                        }
                    } else {
                        // Increment the streak as we've met today's requirements but haven't reached the required streak yet
                        const currentStreak = existingAccuracyProgress?.streak || 0;
                        accuracyProgressUpdates['facts.#factId.accuracyProgress.streak'] = currentStreak + 1;
                        
                        // Check if we should complete accuracy goal (when streak increases and we have enough correct attempts)
                        if (totalCorrect >= 3) {
                            await processFactCompletionForGoalsService(userId, actualTrackId, factId, today, currentStatus, 'accuracy');
                        }
                    }
                }
            }
            
            // Handle fluency level progression
            else if (currentStatus.includes('fluency') && allTodayAttemptsCorrect && hasEnoughAttemptsToday) {
                // We've met the criteria for advancing to the next fluency level
                const avgResponseTime = totalAvgResponseTime !== undefined ? 
                    totalAvgResponseTime : 
                    6; // Default to lowest fluency if no response time
                
                // Determine which fluency level to promote to based on response time
                const nextStatus = await getFluencyLevelFromResponseTime(avgResponseTime, userId);
                
                // Only update if the new status is more advanced than the current one
                const currentIndex = fluencyLevels.indexOf(currentStatus as FactStatus);
                const nextIndex = fluencyLevels.indexOf(nextStatus);
                
                if (nextIndex > currentIndex) {
                    newStatus = nextStatus;
                    statusUpdatedDate = currentTimestamp;
                    statusUpdates['facts.#factId.status'] = newStatus;
                    statusUpdates['facts.#factId.statusUpdatedDate'] = statusUpdatedDate;
                    
                    // XP is now awarded based on active time, not fluency progression
                    
                    // Check if we should complete fluency goal (when fluency status advances and we have enough correct attempts)
                    if (totalCorrect >= 3) {
                        await processFactCompletionForGoalsService(userId, actualTrackId, factId, today, currentStatus, 'fluency');
                    }
                }
            }
            
            // Handle retention testing for mastered facts
            else if (currentStatus === 'mastered') {
                // Check if this is the first attempt after reaching mastered status
                if (!existingNextRetentionDate) {
                    // Initialize retention tracking
                    const nextDate = addDays(currentDate, 1);
                    retentionUpdates['facts.#factId.retentionDay'] = 1;
                    retentionUpdates['facts.#factId.nextRetentionDate'] = nextDate.toISOString();
                }
                // Check if this is a retention test (current date >= next retention date)
                else if (new Date(existingNextRetentionDate) <= currentDate) {
                    // This is a retention test
                    // Calculate the fact's overall accuracy rate including this attempt
                    const factTotalAttempts = (existingFact?.attempts || 0) + newAttempts;
                    const factTotalCorrect = (existingFact?.correct || 0) + newCorrect;
                    const factAccuracyRate = factTotalAttempts > 0 ? (factTotalCorrect / factTotalAttempts) * 100 : 0;
                    
                    // Get user's grade level and target fluency
                    const userGrade = await getUserGrade(userId);
                    const targetFluency = FLUENCY_TARGETS[userGrade] || FLUENCY_TARGETS[12];
                    
                    // Use today's average response time for determining if passed
                    if (totalAvgResponseTime !== undefined && totalAvgResponseTime <= targetFluency && factAccuracyRate >= 90) {
                        // Passed the retention test
                        const currentRetentionDay = existingRetentionDay || 1;
                        
                        // Find the current index in the retention schedule
                        const currentIndex = RETENTION_SCHEDULE.indexOf(currentRetentionDay as 1 | 3 | 7 | 16 | 35 | 75);
                        
                        if (currentIndex < RETENTION_SCHEDULE.length - 1) {
                            // Move to the next retention day
                            const nextRetentionDay = RETENTION_SCHEDULE[currentIndex + 1] as 1 | 3 | 7 | 16 | 35 | 75;
                            
                            // Calculate the next retention date (current date + days until next test)
                            const daysUntilNextTest = nextRetentionDay - currentRetentionDay;
                            const nextDate = addDays(currentDate, daysUntilNextTest);
                            
                            // Update retention tracking
                            retentionUpdates['facts.#factId.retentionDay'] = nextRetentionDay;
                            retentionUpdates['facts.#factId.nextRetentionDate'] = nextDate.toISOString();
                        } else {
                            // Completed all retention tests, mark as automatic
                            newStatus = 'automatic';
                            statusUpdatedDate = currentTimestamp;
                            statusUpdates['facts.#factId.status'] = newStatus;
                            statusUpdates['facts.#factId.statusUpdatedDate'] = statusUpdatedDate;
                            retentionUpdates['facts.#factId.retentionDay'] = null;
                            retentionUpdates['facts.#factId.nextRetentionDate'] = null;
                            
                            // XP is now awarded based on active time, not retention completion
                        }
                    } else if (factAccuracyRate >= 90) {
                        // Correct but too slow, schedule retry for tomorrow
                        const nextDate = addDays(currentDate, 1);
                        retentionUpdates['facts.#factId.nextRetentionDate'] = nextDate.toISOString();
                    } else {
                        // Failed the retention test, move back to appropriate fluency level
                        const avgResponseTime = totalAvgResponseTime !== undefined ? 
                            totalAvgResponseTime : 
                            6; // Default to lowest fluency if no response time
                        
                        newStatus = await getFluencyLevelFromResponseTime(avgResponseTime, userId);
                        statusUpdatedDate = currentTimestamp;
                        statusUpdates['facts.#factId.status'] = newStatus;
                        statusUpdates['facts.#factId.statusUpdatedDate'] = statusUpdatedDate;
                        retentionUpdates['facts.#factId.retentionDay'] = null;
                        retentionUpdates['facts.#factId.nextRetentionDate'] = null;
                        
                        // Note: No XP awarded for retention test failure (demotion)
                    }
                }
            }
        } else if (isFirstPerfectAttempt) {
            // Default progression for new facts without explicit status
            newStatus = 'fluency6Practice';
            statusUpdatedDate = currentTimestamp;
            statusUpdates['facts.#factId.status'] = newStatus;
            statusUpdates['facts.#factId.statusUpdatedDate'] = statusUpdatedDate;
            
            // XP is now awarded based on active time, not perfect attempts
        }
        
        // Mastery promotion no longer tracked here - now tracked via daily goals completion
        
        // SIMPLIFIED UPDATE APPROACH: Create a complete fact object and use a single SET operation
        
        // First, build the fact object with all current values
        const factObject: Record<string, any> = {
            lastAttemptDate: currentTimestamp,
            attempts: (existingFact?.attempts || 0) + newAttempts,
            correct: (existingFact?.correct || 0) + newCorrect,
            timeSpent: (existingFact?.timeSpent || 0) + newTimeSpent,
            // Explicitly set status from newStatus if provided from frontend
            status: isExplicitStatusProvided ? newFact.status : (newStatus || currentStatus),
            todayStats: todayStats
        };
        
        // Add statusUpdatedDate if status changed
        if (statusUpdatedDate) {
            factObject.statusUpdatedDate = statusUpdatedDate;
        } else if (existingFact?.statusUpdatedDate) {
            factObject.statusUpdatedDate = existingFact.statusUpdatedDate;
        }
        
        // Add accuracyProgress if needed
        if (newStatus === 'accuracyPractice' || existingFact?.accuracyProgress) {
            if (newStatus === 'accuracyPractice' && !existingFact?.accuracyProgress) {
                factObject.accuracyProgress = { streak: 0 };
            } else if (existingFact?.accuracyProgress) {
                // Copy existing with any updates
                factObject.accuracyProgress = { ...existingFact.accuracyProgress };
                
                // Update streak if needed (for correct daily practice)
                if (allTodayAttemptsCorrect && hasEnoughAttemptsToday && 
                    currentStatus === 'accuracyPractice' && 
                    existingFact.accuracyProgress.streak < 2) {
                    factObject.accuracyProgress.streak = (existingFact.accuracyProgress.streak || 0) + 1;
                }
            }
        }
        
        // Add retention info if needed
        if (newStatus === 'mastered' || existingFact?.retentionDay || existingFact?.nextRetentionDate) {
            // Special case for initializing retention
            if (newStatus === 'mastered' && !existingFact?.nextRetentionDate) {
                const nextDate = addDays(currentDate, 1);
                factObject.retentionDay = 1;
                factObject.nextRetentionDate = nextDate.toISOString();
            } 
            // Retention test passed, move to next level
            else if (existingRetentionDay && retentionUpdates['facts.#factId.retentionDay'] !== undefined) {
                factObject.retentionDay = retentionUpdates['facts.#factId.retentionDay'];
                if (retentionUpdates['facts.#factId.nextRetentionDate'] !== undefined) {
                    factObject.nextRetentionDate = retentionUpdates['facts.#factId.nextRetentionDate'];
                }
            }
            // Preserve existing retention data
            else if (existingFact?.retentionDay && existingFact?.nextRetentionDate) {
                factObject.retentionDay = existingFact.retentionDay;
                factObject.nextRetentionDate = existingFact.nextRetentionDate;
            }
        }
        
        // Simple SET-only update expression
        const updateExpression = 'SET lastUpdated = :lastUpdated, facts.#factId = :factObject';
        const expressionAttributeNames = { '#factId': factId };
        const expressionAttributeValues = {
            ':lastUpdated': currentTimestamp,
            ':factObject': factObject
        };
        
        // Execute the atomic update with explicit error handling
        try {
            await dynamoDB.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: {
                    PK: `USER#${userId}`,
                    SK: `PROGRESS#${actualTrackId}`
                },
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues
            }));
        } catch (error) {
            console.error('DynamoDB update error:', error);
            throw error;
        }
    });
    
    // Wait for all fact updates to complete
    await Promise.all(factUpdatePromises);
    
    // After atomic updates are done, we need to fetch the latest state
    // to calculate derived fields like accuracyRate and overallCQPM
    const updatedProgress = await dynamoDB.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': `PROGRESS#${trackId}`
        }
    }));
    
    if (updatedProgress.Items?.[0]) {
        const updatedItem = updatedProgress.Items[0];
        const facts = updatedItem.facts || {};
        
        // Calculate overall metrics
        interface TotalMetrics {
            attempts: number;
            correct: number;
            timeSpent: number;
        }
        
        const totals = Object.values(facts).reduce((acc: TotalMetrics, fact: any) => ({
            attempts: acc.attempts + (fact.attempts || 0),
            correct: acc.correct + (fact.correct || 0),
            timeSpent: acc.timeSpent + (fact.timeSpent || 0)
        }), { attempts: 0, correct: 0, timeSpent: 0 } as TotalMetrics);
        
        const totalTimeSpentMinutes = totals.timeSpent / 60000;
        const overallCQPM = totalTimeSpentMinutes > 0 ? totals.correct / totalTimeSpentMinutes : 0;
        const overallAccuracyRate = totals.attempts > 0 ? (totals.correct / totals.attempts) * 100 : 0;
        
        // Update the overall metrics
        await dynamoDB.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}`,
                SK: `PROGRESS#${trackId}`
            },
            UpdateExpression: 'SET overallCQPM = :cqpm, accuracyRate = :accuracy',
            ExpressionAttributeValues: {
                ':cqpm': overallCQPM,
                ':accuracy': overallAccuracyRate
            }
        }));
    }
    
    // Return the updated progress
    return getUserProgressService(userId).then(progress => {
        if (progress && progress.length > 0) {
            return progress.find(p => p.trackId === trackId) || null;
        }
        return null;
    });
};

/**
 * Deletes a specific track's progress and fluency map for a user.
 * @param userId - The ID of the user.
 * @param trackId - The ID of the track to delete data for (e.g., 'TRACK5').
 * @returns An object indicating success or failure.
 */
export async function deleteUserTrackProgress(userId: string, trackId: string): Promise<{ success: boolean; message: string }> {
  try {
    const batchWriteCommand = new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: [
          {
            DeleteRequest: {
              Key: {
                PK: `USER#${userId}`,
                SK: `PROGRESS#${trackId}`,
              },
            },
          },
          {
            DeleteRequest: {
              Key: {
                PK: `USER#${userId}`,
                SK: `FLUENCY#${trackId}`,
              },
            },
          },
        ],
      },
    });

    await dynamoDB.send(batchWriteCommand);

    return { 
      success: true, 
      message: `Successfully deleted data for track ${trackId}.`
    };
  } catch (error) {
    console.error(`Error deleting track data for user ${userId}, track ${trackId}:`, error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'An unknown error occurred.',
    };
  }
}