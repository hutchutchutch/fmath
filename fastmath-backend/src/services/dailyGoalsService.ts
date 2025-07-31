import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DailyGoals, DailyGoalsResponse, GoalType, GoalProgress } from '../types/dailyGoals';
import { UserProgress, FactStatus } from '../types/progress';
import { FLUENCY_TARGETS } from '../types/constants';
import { getTodayNormalized, addDays, getTodayInTimezone } from '../utils/dateUtils';
import caliperEventService from './caliperEventService';
import { getTrackFacts } from './getTrackFactsService';
import { Fact } from '../types';
import activityMetricsService from './activityMetricsService';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});
const TABLE_NAME = 'FastMath2';

// Helper function to format date as YYYY-MM-DD
const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
};

// Helper function to get user's grade level
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

// Helper to get user progress for a track
async function getUserTrackProgress(userId: string, trackId: string): Promise<UserProgress | null> {
    try {
        const result = await dynamoDB.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND SK = :sk',
            ExpressionAttributeValues: {
                ':pk': `USER#${userId}`,
                ':sk': `PROGRESS#${trackId}`
            }
        }));

        if (!result.Items?.[0]) {
            return null;
        }

        return result.Items[0] as UserProgress;
    } catch (error) {
        console.error('Error getting user track progress:', error);
        return null;
    }
}

// Function to calculate learning goal count
function calculateLearningGoal(trackProgress: UserProgress): { show: boolean, count: number } {
    if (!trackProgress || !trackProgress.facts) {
        return { show: false, count: 0 };
    }
    
    // Count facts with 'learning' status
    const learningFacts = Object.values(trackProgress.facts).filter(
        fact => fact.status === 'learning'
    );
    
    const learningCount = learningFacts.length;
    
    if (learningCount === 0) {
        return { show: false, count: 0 };
    }
    
    return { 
        show: true, 
        count: learningCount >= 4 ? 4 : learningCount 
    };
}

// Function to calculate accuracy goal count
function calculateAccuracyGoal(trackProgress: UserProgress): { show: boolean, count: number } {
    if (!trackProgress || !trackProgress.facts) {
        return { show: false, count: 0 };
    }
    
    // Count facts with 'accuracyPractice' status
    const accuracyPracticeFacts = Object.values(trackProgress.facts).filter(
        fact => fact.status === 'accuracyPractice'
    );
    
    if (accuracyPracticeFacts.length >= 4) {
        return { show: true, count: 4 };
    }
    
    if (accuracyPracticeFacts.length > 0) {
        // Count facts with either 'accuracyPractice', 'learning', or 'notStarted' status
        const combinedCount = Object.values(trackProgress.facts).filter(
            fact => fact.status === 'accuracyPractice' || fact.status === 'learning' || fact.status === 'notStarted'
        ).length;
        
        if (combinedCount >= 4) {
            return { show: true, count: 4 };
        } else if (combinedCount > 0) {
            return { show: true, count: combinedCount };
        }
    } else {
        // If no accuracyPractice facts, check for facts in 'learning' status
        const learningFacts = Object.values(trackProgress.facts).filter(
            fact => fact.status === 'learning'
        );
        
        const learningCount = learningFacts.length;
        
        if (learningCount > 0) {
            return { 
                show: true, 
                count: learningCount >= 4 ? 4 : learningCount 
            };
        }
    }
    
    return { show: false, count: 0 };
}

// Function to calculate fluency goal count
async function calculateFluencyGoal(trackProgress: UserProgress, userId: string): Promise<{ show: boolean, count: number }> {
    if (!trackProgress || !trackProgress.facts) {
        return { show: false, count: 0 };
    }
    
    // Count facts with ANY fluency practice status OR accuracyPractice status
    const fluencyStatuses = [
        'fluency6Practice', 
        'fluency3Practice', 
        'fluency2Practice', 
        'fluency1_5Practice',
        'accuracyPractice'
    ];
    
    const eligibleFacts = Object.values(trackProgress.facts).filter(
        fact => fluencyStatuses.includes(fact.status as string)
    );
    
    const factCount = eligibleFacts.length;
    
    if (factCount === 0) {
        return { show: false, count: 0 };
    }
    
    // If <=8, goal = the count of facts. If >8, goal = 8 facts.
    return { 
        show: true, 
        count: factCount <= 8 ? factCount : 8 
    };
}

// Function to determine if assessment goal should be added
function shouldAddAssessmentGoal(goals: Partial<Record<GoalType, GoalProgress>>): boolean {
    // Add assessment goal when user has only accuracy OR only fluency goals
    const hasAccuracy = !!goals.accuracy;
    const hasFluency = !!goals.fluency;
    const hasLearning = !!goals.learning;
    
    // Add assessment goal if user has EITHER accuracy OR fluency but not both,
    // and doesn't have learning goals
    return (hasAccuracy !== hasFluency) && !hasLearning;
}

// Helper function to check if goals have reached 50% completion
function isHalfCompleted(goals: Record<GoalType, GoalProgress>): boolean {
    const goalTypes = Object.keys(goals);
    const completedGoalTypes = Object.values(goals).filter(goal => goal.completed === goal.total).length;
    const totalGoalTypes = goalTypes.length;
    
    if (totalGoalTypes === 0) return false;
    
    // Calculate percentage of goal types completed
    const completionPercentage = completedGoalTypes / totalGoalTypes;
    
    return completionPercentage >= 0.5;
}

// Helper function to check goal completion milestones, send events **and persist flag changes**
async function checkAndSendGoalCompletionEvents(
    dailyGoals: DailyGoals,
    userId: string,
    trackId: string,
    today: string
): Promise<void> {
    const halfCompletedNow = isHalfCompleted(dailyGoals.goals);
    const allCompletedNow = Object.values(dailyGoals.goals).every(g => g.completed === g.total);

    let shouldPersist = false;
    const updateExpressions: string[] = [];
    const expressionAttributeValues: Record<string, any> = {};

    if (halfCompletedNow && !(dailyGoals as any).halfCompleted) {
        (dailyGoals as any).halfCompleted = true;
        shouldPersist = true;
        updateExpressions.push('halfCompleted = :half');
        expressionAttributeValues[':half'] = true;
        console.log(`[DailyGoals] 50% completion reached - sending Caliper event for userId: ${userId}, trackId: ${trackId}, date: ${today}`);
        caliperEventService.sendDailyGoalsHalfCompletedEvent(userId, trackId, today);
        
        // Note: XP is only awarded at 100% completion, not at 50%
    }

    if (allCompletedNow && !dailyGoals.allCompleted) {
        dailyGoals.allCompleted = true;
        shouldPersist = true;
        updateExpressions.push('allCompleted = :all');
        expressionAttributeValues[':all'] = true;
        console.log(`[DailyGoals] 100% completion reached - sending Caliper event for userId: ${userId}, trackId: ${trackId}, date: ${today}`);
        caliperEventService.sendDailyGoalsCompletedEvent(userId, trackId, today);
        
        // XP is now awarded based on active time, not goal completion
    }

    if (shouldPersist) {
        // Always update updatedAt if we are persisting flags
        updateExpressions.push('updatedAt = :now');
        expressionAttributeValues[':now'] = new Date().toISOString();

        await dynamoDB.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: `GOALS#${trackId}#${today}` },
            UpdateExpression: 'SET ' + updateExpressions.join(', '),
            ExpressionAttributeValues: expressionAttributeValues
        }));
    }
}

// Get daily goals for a user
export const getDailyGoalsService = async (
    userId: string,
    trackId: string,
    userDate?: string
): Promise<DailyGoalsResponse | null> => {
    try {
        // Use userDate if provided, otherwise fall back to UTC
        const today = userDate || formatDate(new Date());
        
        // Check if goals already exist for today
        const existingGoals = await dynamoDB.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}`,
                SK: `GOALS#${trackId}#${today}`
            }
        }));
        
        // If goals exist for this specific user, track, and day, return them
        if (existingGoals.Item) {
            const dailyGoals = existingGoals.Item as DailyGoals;
            return {
                date: dailyGoals.date,
                trackId: dailyGoals.trackId,
                goals: dailyGoals.goals,
                allCompleted: dailyGoals.allCompleted
            };
        }

        // If no goals exist for this specific track today, calculate and save new ones
        return await calculateAndSaveGoals(userId, trackId, today);
    } catch (error) {
        console.error('Error getting daily goals:', error);
        return null;
    }
};

// Calculate and save new goals
async function calculateAndSaveGoals(
    userId: string,
    trackId: string,
    userDate?: string
): Promise<DailyGoalsResponse | null> {
    try {
        // Use userDate if provided, otherwise fall back to UTC
        const today = userDate || formatDate(new Date());
        const now = new Date().toISOString();
        const MAX_QUESTIONS_PER_ASSESSMENT = 60;
        
        // Get user's progress for the selected track
        const trackProgress = await getUserTrackProgress(userId, trackId);
        
        // Get all facts for the track to check for initial assessment phase
        const allFacts = await getTrackFacts(trackId) as Fact[];
        const totalFactsInTrack = allFacts.length;

        // Determine if this is a completely new user (no progress record exists)
        const isNewUser = !trackProgress;
        
        let unattemptedFactsCount = 0;
        
        if (isNewUser) {
            // For completely new users, all facts are unattempted
            unattemptedFactsCount = totalFactsInTrack;
        } else {
            // Count unattempted facts for existing users
            const progressedFactIds = new Set(Object.keys(trackProgress.facts));
            for (const fact of allFacts) {
                if (!progressedFactIds.has(fact.factId)) {
                    unattemptedFactsCount++;
                } else {
                    const factProgress = trackProgress.facts[fact.factId];
                    if (factProgress.status === 'notStarted' || !factProgress.status) {
                        unattemptedFactsCount++;
                    }
                }
            }
        }
        
        // Prepare goals object
        const goals: Partial<Record<GoalType, GoalProgress>> = {};

        if (unattemptedFactsCount > 0) {
            // Placement / initial assessment phase

            // Calculate potential practice goals
            const learningGoal = !isNewUser && trackProgress ? calculateLearningGoal(trackProgress) : { show: false, count: 0 };
            const accuracyGoal = !isNewUser && trackProgress ? calculateAccuracyGoal(trackProgress) : { show: false, count: 0 };
            const fluencyGoal  = !isNewUser && trackProgress ? await calculateFluencyGoal(trackProgress, userId) : { show: false, count: 0 };

            const anyLearning = learningGoal.show && learningGoal.count > 0;
            const anyAccuracy = accuracyGoal.show && accuracyGoal.count > 0;
            const anyFluency  = fluencyGoal.show  && fluencyGoal.count  > 0;

            if (anyLearning) {
                // Set learning goals and chained accuracy goals
                goals.learning = { total: learningGoal.count, completed: 0 };
                goals.accuracy = { total: accuracyGoal.count, completed: 0 };
                
                // Assessment count should be driven by how many facts are still unattempted.
                // One assessment covers up to MAX_QUESTIONS_PER_ASSESSMENT questions.
                const placementAssessments = Math.ceil(unattemptedFactsCount / MAX_QUESTIONS_PER_ASSESSMENT);
                goals.assessment = { total: placementAssessments > 0 ? placementAssessments : 1, completed: 0 };
                
                // Set fluency goals (don't double-count learning facts)
                if (anyFluency) {
                    goals.fluency = { total: fluencyGoal.count, completed: 0 };
                }
            } else if (anyAccuracy) {
                // Set accuracy goals and chained fluency goals
                goals.accuracy = { total: accuracyGoal.count, completed: 0 };
                goals.fluency = { total: fluencyGoal.count, completed: 0 };
                
                const placementAssessments = Math.ceil(unattemptedFactsCount / MAX_QUESTIONS_PER_ASSESSMENT);
                goals.assessment = { total: placementAssessments > 0 ? placementAssessments : 1, completed: 0 };
            } else {
                // Only fluency goals available - use ceiling/60 rule for assessments
                if (anyFluency) {
                    goals.fluency = { total: fluencyGoal.count, completed: 0 };
                    const numAssessments = Math.ceil(fluencyGoal.count / MAX_QUESTIONS_PER_ASSESSMENT);
                    goals.assessment = { total: numAssessments > 0 ? numAssessments : 1, completed: 0 };
                } else {
                    // No practice facts available – schedule placement assessment
                    const numAssessments = Math.ceil(unattemptedFactsCount / MAX_QUESTIONS_PER_ASSESSMENT);
                    goals.assessment = { total: numAssessments > 0 ? numAssessments : 1, completed: 0 };
                }
            }
        } else {
            // Returning user flow (all facts attempted at least once)
            if (!isNewUser) {
                const learningGoal = calculateLearningGoal(trackProgress);
                const accuracyGoal = calculateAccuracyGoal(trackProgress);
                const fluencyGoal = await calculateFluencyGoal(trackProgress, userId);
                
                const anyLearning = learningGoal.show && learningGoal.count > 0;
                const anyAccuracy = accuracyGoal.show && accuracyGoal.count > 0;
                const anyFluency = fluencyGoal.show && fluencyGoal.count > 0;
                
                if (anyLearning) {
                    // Set learning goals and chained accuracy goals
                    goals.learning = { total: learningGoal.count, completed: 0 };
                    goals.accuracy = { total: accuracyGoal.count, completed: 0 };
                    
                    const placementAssessments = Math.ceil(unattemptedFactsCount / MAX_QUESTIONS_PER_ASSESSMENT);
                    goals.assessment = { total: placementAssessments > 0 ? placementAssessments : 1, completed: 0 };
                    
                    // Set fluency goals (don't double-count learning facts)
                    if (anyFluency) {
                        goals.fluency = { total: fluencyGoal.count, completed: 0 };
                    }
                } else if (anyAccuracy) {
                    // Set accuracy goals and chained fluency goals
                    goals.accuracy = { total: accuracyGoal.count, completed: 0 };
                    goals.fluency = { total: fluencyGoal.count, completed: 0 };
                    
                    const placementAssessments = Math.ceil(unattemptedFactsCount / MAX_QUESTIONS_PER_ASSESSMENT);
                    goals.assessment = { total: placementAssessments > 0 ? placementAssessments : 1, completed: 0 };
                } else if (anyFluency) {
                    // Only fluency goals available - use ceiling/60 rule for assessments
                    goals.fluency = { total: fluencyGoal.count, completed: 0 };
                    const numAssessments = Math.ceil(fluencyGoal.count / MAX_QUESTIONS_PER_ASSESSMENT);
                    goals.assessment = { total: numAssessments > 0 ? numAssessments : 1, completed: 0 };
                } else {
                    // No practice opportunities available – schedule a single progress assessment
                    goals.assessment = { total: 1, completed: 0 };
                }
            }
        }
        
        // If there are no valid goals, return null
        if (Object.keys(goals).length === 0) {
            return null;
        }
        
        // Create new daily goals record  
        const dailyGoals = {
            PK: `USER#${userId}`,
            SK: `GOALS#${trackId}#${today}`,
            date: today,
            trackId,
            userId,
            goals: goals as Record<GoalType, GoalProgress>,
            completedFacts: { // Initialize with empty arrays
                learning: [],
                accuracy: [],
                fluency: [],
                assessment: []
            },
            allCompleted: false,
            halfCompleted: false, // Initialize half completion tracking
            createdAt: now,
            updatedAt: now
        } as DailyGoals;
        
        // Save to database
        await dynamoDB.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: dailyGoals
        }));
        
        // Return in the format expected by the frontend
        return {
            date: dailyGoals.date,
            trackId: dailyGoals.trackId,
            goals: dailyGoals.goals,
            allCompleted: dailyGoals.allCompleted
        };
    } catch (error) {
        console.error('Error calculating and saving goals:', error);
        return null;
    }
}

/**
 * Processes a fact that has met a completion criteria (e.g., 3 correct attempts)
 * and updates the corresponding daily goal based on the practice context.
 * @param practiceContext - The practice context (e.g., 'accuracy1', 'fluency2') that determines which goal to increment
 * @returns An object indicating which goal was completed and if the fact's daily stats should be reset.
 */
export const processFactCompletionForGoalsService = async (
    userId: string,
    trackId: string,
    factId: string, // This is the base factId like '1_2_addition', not the PK.
    userDate?: string,
    factStatus?: FactStatus,
    practiceContext?: string
): Promise<{ goalCompleted: GoalType | null; shouldResetStats: boolean }> => {
    try {
        const today = userDate || formatDate(new Date());
        const now = new Date().toISOString();

        // 1. Get or create today's goals
        let dailyGoals: DailyGoals | null = null;
        const existingGoals = await dynamoDB.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: `GOALS#${trackId}#${today}` }
        }));

        if (existingGoals.Item) {
            dailyGoals = existingGoals.Item as DailyGoals;
            // Backwards compatibility: if completedFacts doesn't exist, add it.
            if (!dailyGoals.completedFacts) {
                dailyGoals.completedFacts = { learning: [], accuracy: [], fluency: [], assessment: [] };
            }
            // Backwards compatibility: if halfCompleted doesn't exist, add it.
            if ((dailyGoals as any).halfCompleted === undefined) {
                (dailyGoals as any).halfCompleted = false;
            }
        } else {
            const newGoalsResponse = await calculateAndSaveGoals(userId, trackId, today);
            if (!newGoalsResponse) {
                console.warn(`[DailyGoalsService] Could not calculate goals for track ${trackId} when processing fact completion.`);
                return { goalCompleted: null, shouldResetStats: false };
            }
            const result = await dynamoDB.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${userId}`, SK: `GOALS#${trackId}#${today}` }
            }));
            if (result.Item) {
                dailyGoals = result.Item as DailyGoals;
            } else {
                 console.error(`[DailyGoalsService] Failed to fetch newly created goals for track ${trackId}.`);
                 return { goalCompleted: null, shouldResetStats: false };
            }
        }

        if (!dailyGoals) {
            return { goalCompleted: null, shouldResetStats: false };
        }

        // Ensure sub-objects exist
        if (!dailyGoals.completedFacts.accuracy) dailyGoals.completedFacts.accuracy = [];
        if (!dailyGoals.completedFacts.fluency) dailyGoals.completedFacts.fluency = [];

        let wasUpdated = false;
        const completedGoals: GoalType[] = [];
        
        // Determine which goal to increment based on practice context
        const shouldIncrementAccuracy = practiceContext?.startsWith('accuracy');
        const shouldIncrementFluency = practiceContext?.startsWith('fluency');

        // Build atomic update expressions based on which goals need updating
        const updateExpressions: string[] = ['SET updatedAt = :now'];
        const conditionExpressions: string[] = [];
        const expressionAttributeValues: any = {
            ':now': now,
            ':increment': 1,
            ':zero': 0,
            ':factIdStr': factId,
            ':emptyList': [],
        };

        // Accuracy Check - only increment if practice context is accuracy-related
        if (shouldIncrementAccuracy && dailyGoals.goals.accuracy && !dailyGoals.completedFacts.accuracy.includes(factId)) {
            updateExpressions.push('goals.accuracy.completed = if_not_exists(goals.accuracy.completed, :zero) + :increment');
            updateExpressions.push('completedFacts.accuracy = list_append(if_not_exists(completedFacts.accuracy, :emptyList), :accuracyFactList)');
            conditionExpressions.push('attribute_exists(goals.accuracy)');
            conditionExpressions.push('NOT contains(completedFacts.accuracy, :factIdStr)');
            conditionExpressions.push('goals.accuracy.completed < goals.accuracy.#total');
            expressionAttributeValues[':accuracyFactList'] = [factId];
            wasUpdated = true;
            completedGoals.push('accuracy');
        }

        // Fluency Check - only increment if practice context is fluency-related
        if (shouldIncrementFluency && dailyGoals.goals.fluency && !dailyGoals.completedFacts.fluency.includes(factId)) {
            updateExpressions.push('goals.fluency.completed = if_not_exists(goals.fluency.completed, :zero) + :increment');
            updateExpressions.push('completedFacts.fluency = list_append(if_not_exists(completedFacts.fluency, :emptyList), :fluencyFactList)');
            conditionExpressions.push('attribute_exists(goals.fluency)');
            conditionExpressions.push('NOT contains(completedFacts.fluency, :factIdStr)');
            conditionExpressions.push('goals.fluency.completed < goals.fluency.#total');
            expressionAttributeValues[':fluencyFactList'] = [factId];
            wasUpdated = true;
            completedGoals.push('fluency');
        }
        
        // 4. Learning Check (when a fact status graduates)
        // This is handled from userProgressService when status changes.
        // For now, this service only handles attempt-based goals.

        if (wasUpdated) {
            try {
                // Perform atomic update
                const updateExpression = updateExpressions.join(', ');
                
                await dynamoDB.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `USER#${userId}`, SK: `GOALS#${trackId}#${today}` },
                    UpdateExpression: updateExpression,
                    ConditionExpression: conditionExpressions.length > 0 ? conditionExpressions.join(' AND ') : undefined,
                    ExpressionAttributeNames: {
                        '#total': 'total'
                    },
                    ExpressionAttributeValues: expressionAttributeValues
                }));

                // Get updated goals for event checking
                const updatedGoalsResult = await dynamoDB.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `USER#${userId}`, SK: `GOALS#${trackId}#${today}` }
                }));
                
                if (updatedGoalsResult.Item) {
                    const updatedGoals = updatedGoalsResult.Item as DailyGoals;
                    // Check and send goal completion events for both 50% and 100% milestones
                    await checkAndSendGoalCompletionEvents(updatedGoals, userId, trackId, today);
                }

                // If a goal was updated, stats should be reset.
                // Return the first goal type that was completed.
                return { goalCompleted: completedGoals[0] || null, shouldResetStats: true };
            } catch (error: any) {
                // If update fails due to condition check (fact already counted), return success but no reset
                if (error.name === 'ConditionalCheckFailedException') {
                    console.log(`[processFactCompletionForGoalsService] Fact ${factId} already counted for user ${userId}`);
                    return { goalCompleted: null, shouldResetStats: false };
                }
                throw error;
            }
        }


        return { goalCompleted: null, shouldResetStats: false };
    } catch (error) {
        console.error(`[processFactCompletionForGoalsService] Error processing fact ${factId} for user ${userId}:`, error);
        return { goalCompleted: null, shouldResetStats: false };
    }
};

/**
 * Specifically marks a 'learning' goal as complete for a given fact.
 * This is called when a fact's status graduates, not based on attempt counts.
 */
export const completeLearningGoalForFactService = async (
    userId: string,
    trackId: string,
    factId: string,
    userDate?: string
): Promise<void> => {
    try {
        const today = userDate || formatDate(new Date());
        const now = new Date().toISOString();

        const goalsItem = await dynamoDB.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: `GOALS#${trackId}#${today}` }
        }));

        if (!goalsItem.Item) {
            // No goals for today, nothing to do.
            return;
        }

        const dailyGoals = goalsItem.Item as DailyGoals;
        // Backwards compatibility: if halfCompleted doesn't exist, add it.
        if ((dailyGoals as any).halfCompleted === undefined) {
            (dailyGoals as any).halfCompleted = false;
        }
        
        if (!dailyGoals.goals.learning || dailyGoals.completedFacts.learning?.includes(factId)) {
            // No learning goal or this fact has already been counted.
            return;
        }

        // Use atomic update to prevent race conditions (list based)
        await dynamoDB.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: `GOALS#${trackId}#${today}` },
            UpdateExpression: `
                SET goals.learning.completed = if_not_exists(goals.learning.completed, :zero) + :increment,
                    updatedAt = :now,
                    completedFacts.learning = list_append(if_not_exists(completedFacts.learning, :emptyList), :learningFactList)
            `,
            ConditionExpression: `
                attribute_exists(goals.learning) AND (NOT contains(completedFacts.learning, :factIdStr)) AND goals.learning.completed < goals.learning.#total
            `,
            ExpressionAttributeNames: {
                '#total': 'total'
            },
            ExpressionAttributeValues: {
                ':increment': 1,
                ':zero': 0,
                ':now': now,
                ':emptyList': [],
                ':learningFactList': [factId],
                ':factIdStr': factId
            }
        }));

        // Get updated goals for event checking
        const updatedGoalsResult = await dynamoDB.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: `GOALS#${trackId}#${today}` }
        }));
        
        if (updatedGoalsResult.Item) {
            const updatedGoals = updatedGoalsResult.Item as DailyGoals;
            // Check and send goal completion events for both 50% and 100% milestones
            await checkAndSendGoalCompletionEvents(updatedGoals, userId, trackId, today);
        }

    } catch (error) {
        console.error(`[completeLearningGoalForFactService] Error processing fact ${factId} for user ${userId}:`, error);
    }
};

// Store active polling intervals to prevent duplicates
const activePollingIntervals = new Map<string, NodeJS.Timeout>();

/**
 * Starts polling to recalculate goals when fact statuses change after assessment completion
 * This handles the race condition where assessment completion triggers recalculation
 * but fact status updates are still processing in the background
 */
async function startGoalRecalculationPolling(
    userId: string,
    trackId: string,
    today: string
): Promise<void> {
    const pollingKey = `${userId}#${trackId}#${today}`;
    
    // Don't start polling if already active for this user/track/date
    if (activePollingIntervals.has(pollingKey)) {
        return;
    }
    
    console.log(`[DailyGoals] Starting goal recalculation polling for user ${userId} track ${trackId}`);
    
    // Get initial state
    let lastKnownCounts = await getFactStatusCounts(userId, trackId);
    let pollCount = 0;
    const MAX_POLLS = 20; // Maximum 60 seconds of polling (20 * 3 seconds)
    
    const interval = setInterval(async () => {
        try {
            pollCount++;
            
            // Get current fact status counts
            const currentCounts = await getFactStatusCounts(userId, trackId);
            
            // Skip this poll if we can't get current counts
            if (!currentCounts) {
                return;
            }
            
            // Check if counts have changed
            const countsChanged = !lastKnownCounts || 
                lastKnownCounts.learning !== currentCounts.learning ||
                lastKnownCounts.accuracy !== currentCounts.accuracy ||
                lastKnownCounts.fluency !== currentCounts.fluency;
            
            if (countsChanged) {
                console.log(`[DailyGoals] Fact status counts changed for user ${userId} track ${trackId}, recalculating goals`);
                
                // Get current goals
                const currentGoals = await dynamoDB.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `USER#${userId}`, SK: `GOALS#${trackId}#${today}` }
                }));
                
                if (currentGoals.Item) {
                    const success = await recalculateGoalsIfNeeded(
                        userId, 
                        trackId, 
                        currentGoals.Item as DailyGoals, 
                        today
                    );
                    
                    if (success) {
                        // Goals were recalculated, stop polling
                        clearInterval(interval);
                        activePollingIntervals.delete(pollingKey);
                        console.log(`[DailyGoals] Goal recalculation completed for user ${userId} track ${trackId}`);
                        return;
                    }
                }
                
                lastKnownCounts = currentCounts;
            }
            
            // Stop polling after max attempts
            if (pollCount >= MAX_POLLS) {
                clearInterval(interval);
                activePollingIntervals.delete(pollingKey);
                console.log(`[DailyGoals] Goal recalculation polling stopped (max attempts) for user ${userId} track ${trackId}`);
            }
        } catch (error) {
            console.error(`[DailyGoals] Error during goal recalculation polling:`, error);
            clearInterval(interval);
            activePollingIntervals.delete(pollingKey);
        }
    }, 3000); // Poll every 3 seconds
    
    activePollingIntervals.set(pollingKey, interval);
}

/**
 * Get current fact status counts for a user's track
 */
async function getFactStatusCounts(userId: string, trackId: string): Promise<{
    learning: number;
    accuracy: number;
    fluency: number;
} | null> {
    try {
        const trackProgress = await getUserTrackProgress(userId, trackId);
        if (!trackProgress) {
            return null;
        }
        
        const learningGoal = calculateLearningGoal(trackProgress);
        const accuracyGoal = calculateAccuracyGoal(trackProgress);
        const fluencyGoal = await calculateFluencyGoal(trackProgress, userId);
        
        return {
            learning: learningGoal.count,
            accuracy: accuracyGoal.count,
            fluency: fluencyGoal.count
        };
    } catch (error) {
        console.error(`[DailyGoals] Error getting fact status counts:`, error);
        return null;
    }
}

/**
 * Recalculates goals during placement phase if practice opportunities have emerged
 * This handles the edge case where a new user starts with multiple assessments
 * but after the first assessment, practice goals become available
 */
async function recalculateGoalsIfNeeded(
    userId: string,
    trackId: string,
    currentGoals: DailyGoals,
    today: string
): Promise<boolean> {
    // Only recalculate if we're in placement phase with multiple assessment goals
    if (!currentGoals.goals.assessment || currentGoals.goals.assessment.total <= 1) {
        return false;
    }
    
    // Check if any assessment has been completed
    if (currentGoals.goals.assessment.completed === 0) {
        return false;
    }
    
    // Get current user progress to check for new practice opportunities
    const trackProgress = await getUserTrackProgress(userId, trackId);
    if (!trackProgress) {
        return false;
    }
    
    // Calculate potential practice goals
    const learningGoal = calculateLearningGoal(trackProgress);
    const accuracyGoal = calculateAccuracyGoal(trackProgress);
    const fluencyGoal = await calculateFluencyGoal(trackProgress, userId);
    
    const hasLearning = learningGoal.show && learningGoal.count > 0;
    const hasAccuracy = accuracyGoal.show && accuracyGoal.count > 0;
    const hasFluency = fluencyGoal.show && fluencyGoal.count > 0;
    
    // If practice opportunities exist, adjust goals
    if (hasLearning || hasAccuracy || hasFluency) {
        const updateExpressions: string[] = [];
        const expressionAttributeValues: Record<string, any> = {
            ':now': new Date().toISOString()
        };
        
        // Add new practice goals with chaining logic
        if (hasLearning && !currentGoals.goals.learning) {
            updateExpressions.push('goals.learning = :learning');
            expressionAttributeValues[':learning'] = { total: learningGoal.count, completed: 0 };
            
            // Chain accuracy goals
            updateExpressions.push('goals.accuracy = :accuracy');
            expressionAttributeValues[':accuracy'] = { total: accuracyGoal.count, completed: 0 };
            
            // Update assessment goals based on learning + accuracy count (preserve completed count)
            const learningAccuracyCount = learningGoal.count + accuracyGoal.count;
            updateExpressions.push('goals.assessment.#total = :assessmentTotal');
            expressionAttributeValues[':assessmentTotal'] = learningAccuracyCount >= 8 ? 1 : 2;
            
            // Chain fluency goals (don't double-count learning facts)
            if (hasFluency) {
                updateExpressions.push('goals.fluency = :fluency');
                expressionAttributeValues[':fluency'] = { total: fluencyGoal.count, completed: 0 };
            }
        } else if (hasAccuracy && !currentGoals.goals.accuracy) {
            updateExpressions.push('goals.accuracy = :accuracy');
            expressionAttributeValues[':accuracy'] = { total: accuracyGoal.count, completed: 0 };
            
            // Chain fluency goals
            updateExpressions.push('goals.fluency = :fluency');
            expressionAttributeValues[':fluency'] = { total: fluencyGoal.count, completed: 0 };
            
            // Update assessment goals based on accuracy + fluency count (preserve completed count)
            const accuracyFluencyCount = accuracyGoal.count + fluencyGoal.count;
            updateExpressions.push('goals.assessment.#total = :assessmentTotal');
            expressionAttributeValues[':assessmentTotal'] = accuracyFluencyCount >= 8 ? 1 : 2;
        } else if (hasFluency && !currentGoals.goals.fluency) {
            updateExpressions.push('goals.fluency = :fluency');
            expressionAttributeValues[':fluency'] = { total: fluencyGoal.count, completed: 0 };
            
            // Update assessment goals using ceiling/60 rule (preserve completed count)
            const numAssessments = Math.ceil(fluencyGoal.count / 60); // MAX_QUESTIONS_PER_ASSESSMENT
            updateExpressions.push('goals.assessment.#total = :assessmentTotal');
            expressionAttributeValues[':assessmentTotal'] = numAssessments > 0 ? numAssessments : 1;
        }
        

        
        // Update the goals
        updateExpressions.push('updatedAt = :now');
        
        await dynamoDB.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: `GOALS#${trackId}#${today}` },
            UpdateExpression: 'SET ' + updateExpressions.join(', '),
            ExpressionAttributeNames: {
                '#total': 'total'
            },
            ExpressionAttributeValues: expressionAttributeValues
        }));
        
        console.log(`[DailyGoals] Recalculated goals for user ${userId} track ${trackId}: added practice goals after assessment`);
        return true;
    }
    
    return false;
}

// Update progress for a daily goal
export const updateDailyGoalProgressService = async (
    userId: string,
    trackId: string,
    goalType: GoalType,
    increment: number = 1,
    userDate?: string
): Promise<DailyGoalsResponse | null> => {
    try {
        // Get today's goals first
        // Use userDate if provided, otherwise fall back to UTC
        const today = userDate || formatDate(new Date());
        const now = new Date().toISOString();
        
        const existingGoals = await dynamoDB.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}`,
                SK: `GOALS#${trackId}#${today}`
            }
        }));
        
        let dailyGoals: DailyGoals;
        
        // If no goals exist for this specific user, track, and day,
        // calculate and save new goals first
        if (!existingGoals.Item) {
            const newGoalsResponse = await calculateAndSaveGoals(userId, trackId, today);
            if (!newGoalsResponse) {
                // Handle case where goals couldn't be calculated (e.g., no progress)
                console.warn(`[DailyGoalsService] Could not calculate goals for track ${trackId} when trying to update progress.`);
                // Attempt to fetch again in case of race condition, or return null/error
                const refetchedGoals = await dynamoDB.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `USER#${userId}`, SK: `GOALS#${trackId}#${today}` }
                }));
                 if (!refetchedGoals.Item) {
                     console.error(`[DailyGoalsService] Failed to get or create goals for track ${trackId} before update.`);
                     return null; // Or throw an error
                 }
                 dailyGoals = refetchedGoals.Item as DailyGoals;
            } else {
                 // Fetch the newly created goals to ensure we have the full DB item
                 const result = await dynamoDB.send(new GetCommand({
                     TableName: TABLE_NAME,
                     Key: { PK: `USER#${userId}`, SK: `GOALS#${trackId}#${today}` }
                 }));

                 if (!result.Item) {
                     console.error(`[DailyGoalsService] Failed to fetch newly created goals for track ${trackId}.`);
                     return null; // Or throw an error
                 }
                 dailyGoals = result.Item as DailyGoals;
            }
        } else {
            dailyGoals = existingGoals.Item as DailyGoals;
            // Backwards compatibility: if halfCompleted doesn't exist, add it.
            if ((dailyGoals as any).halfCompleted === undefined) {
                (dailyGoals as any).halfCompleted = false;
            }
        }
        
        // NOTE: recalculateGoalsIfNeeded is executed *after* we apply the atomic
        // update below so it sees the up-to-date `completed` counter.
        
        // Ensure the goal type exists in the fetched/created goals
        if (!dailyGoals.goals[goalType]) {
            return {
                date: dailyGoals.date,
                trackId: dailyGoals.trackId,
                goals: dailyGoals.goals,
                allCompleted: dailyGoals.allCompleted
            };
        }
        
        // Use atomic update to prevent race conditions
        await dynamoDB.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: `GOALS#${trackId}#${today}` },
            UpdateExpression: `
                SET goals.${goalType}.completed = if_not_exists(goals.${goalType}.completed, :zero) + :increment,
                    updatedAt = :now
            `,
            ConditionExpression: `attribute_exists(goals.${goalType}) AND goals.${goalType}.completed < goals.${goalType}.#total`,
            ExpressionAttributeNames: {
                '#total': 'total'
            },
            ExpressionAttributeValues: {
                ':increment': increment,
                ':zero': 0,
                ':now': now
            }
        }));

        // Get updated goals for event checking
        const updatedGoalsResult = await dynamoDB.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: `GOALS#${trackId}#${today}` }
        }));
        
        if (!updatedGoalsResult.Item) {
            console.error(`[DailyGoalsService] Failed to fetch updated goals after atomic update for track ${trackId}.`);
            return null;
        }
        
        const updatedGoals = updatedGoalsResult.Item as DailyGoals;

        // ---- Placement-phase edge-case fix (run after increment) ----
        if (goalType === 'assessment') {
            // Start polling for goal recalculation to handle race conditions with fact status updates
            await startGoalRecalculationPolling(userId, trackId, today);
            
            const wasRecalculated = await recalculateGoalsIfNeeded(userId, trackId, updatedGoals, today);
            if (wasRecalculated) {
                // Refresh again so caller gets the latest structure
                const refetch = await dynamoDB.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `USER#${userId}`, SK: `GOALS#${trackId}#${today}` }
                }));
                if (refetch.Item) {
                    updatedGoals.date = (refetch.Item as DailyGoals).date;
                    updatedGoals.goals = (refetch.Item as DailyGoals).goals;
                    updatedGoals.allCompleted = (refetch.Item as DailyGoals).allCompleted;
                }
            }
        }
        
        // Check and send goal completion events for both 50% and 100% milestones
        await checkAndSendGoalCompletionEvents(updatedGoals, userId, trackId, today);
        
        // Return updated goals
        return {
            date: updatedGoals.date,
            trackId: updatedGoals.trackId,
            goals: updatedGoals.goals,
            allCompleted: updatedGoals.allCompleted
        };
    } catch (error) {
        console.error('Error updating daily goal progress:', error);
        return null;
    }
};

// Interface for the daily goals summary response
export interface DailyGoalsSummary {
    date: string;
    goalsCount: number;      // Number of different goal types (0-3)
    goalsAchievedCount: number;  // Number of goal types fully completed
}

// Get daily goals summary for the last 8 days
export const getGoalsSummaryForLastDaysService = async (
    userId: string,
    trackId: string | string[],
    days: number = 8
): Promise<DailyGoalsSummary[]> => {
    try {
        // Convert input to array of track IDs
        const trackIds = Array.isArray(trackId) ? trackId : [trackId];
        
        // Initialize summaries with empty data for each day
        const summaries: DailyGoalsSummary[] = [];
        const today = getTodayNormalized();
        
        // Create a map to store aggregated data by date
        const summaryMap = new Map<string, DailyGoalsSummary>();
        
        // Initialize map with empty data for each day
        for (let i = 0; i < days; i++) {
            const date = addDays(today, -i);
            const dateString = formatDate(date);
            
            summaryMap.set(dateString, {
                date: dateString,
                goalsCount: 0,
                goalsAchievedCount: 0
            });
        }
        
        // Process each track ID
        for (const currentTrackId of trackIds) {
            // Process each day from today backwards for this track
            for (let i = 0; i < days; i++) {
                const date = addDays(today, -i);
                const dateString = formatDate(date);
                
                // Query the database for goals on this date for this track
                const result = await dynamoDB.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: {
                        PK: `USER#${userId}`,
                        SK: `GOALS#${currentTrackId}#${dateString}`
                    }
                }));
                
                if (!result.Item) {
                    // No goals for this day and specific track, continue to next day/track
                    continue;
                }
                
                const dailyGoals = result.Item as DailyGoals;
                
                // Get current aggregated data for this date
                const currentSummary = summaryMap.get(dateString)!;
                
                // Count the number of goal types for this track
                const goalsCount = Object.keys(dailyGoals.goals).length;
                
                // Count fully achieved goal types for this track
                const goalsAchievedCount = Object.values(dailyGoals.goals).filter(
                    goal => goal.completed === goal.total
                ).length;
                
                // Aggregate data
                currentSummary.goalsCount += goalsCount;
                currentSummary.goalsAchievedCount += goalsAchievedCount;
                
                // Update the map
                summaryMap.set(dateString, currentSummary);
            }
        }
        
        // Convert map to array and sort by date (newest first)
        const entries = Array.from(summaryMap.entries());
        entries.sort((a, b) => a[0].localeCompare(b[0]) * -1); // Sort descending
        
        // Build the final result array
        for (const [_, summary] of entries) {
            summaries.push(summary);
        }
        
        return summaries;
    } catch (error) {
        console.error('Error getting goals summary for last days:', error);
        return [];
    }
}; 