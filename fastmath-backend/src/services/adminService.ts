import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import sessionAnalyticsService from './sessionAnalyticsService';
import { isSameDay, addDays, normalizeDateToDay } from '../utils/dateUtils';
import { getGoalsSummaryForLastDaysService } from './dailyGoalsService';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});

const TABLE_NAME = 'FastMath2';

// Helper function to calculate CQPM metrics to avoid duplicated code
const calculateTrackMetrics = (assessments: any[]) => {
    // Filter assessments from the last 90 days
    const ninetyDaysAgo = addDays(new Date(), -90);
    const filteredAssessments = assessments.filter(assessment => {
        const lastUpdated = new Date(assessment.lastUpdated);
        return lastUpdated >= ninetyDaysAgo;
    });
    
    // Return empty object if no recent assessments
    if (filteredAssessments.length === 0) {
        return {};
    }
    
    // Use Map for better performance with large datasets
    const trackMap = new Map<string, any[]>();
    
    // Group assessments by track more efficiently
    for (const item of filteredAssessments) {
        const trackId = item.trackId;
        if (!trackMap.has(trackId)) {
            trackMap.set(trackId, []);
        }
        trackMap.get(trackId)?.push({
            overallCQPM: item.overallCQPM,
            lastUpdated: item.lastUpdated,
            assessmentId: item.assessmentId
        });
    }
    
    // Calculate metrics for each track
    const trackMetrics: Record<string, { 
        latestCQPM: number; 
        previousCQPM: number | null;
        cqpmHistory: Array<{date: string, cqpm: number}>
    }> = {};
    
    trackMap.forEach((trackAssessments, trackId) => {
        // Sort by lastUpdated in descending order (newest first)
        trackAssessments.sort((a, b) => 
            new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
        );
        
        // Create history of CQPM by date (for the past 30 days)
        // Group by day and average multiple assessments on the same day
        const cqpmByDay = new Map<string, { sum: number; count: number; timestamp: number }>();
        
        // Process all assessments for this track to group by day
        trackAssessments.forEach(assessment => {
            // Format date to YYYY-MM-DD to use as key for grouping
            const dateObj = new Date(assessment.lastUpdated);
            const dateKey = dateObj.toISOString().split('T')[0]; // Get just the date part
            const timestamp = dateObj.getTime();
            
            if (!cqpmByDay.has(dateKey)) {
                cqpmByDay.set(dateKey, { sum: 0, count: 0, timestamp });
            }
            
            const dayData = cqpmByDay.get(dateKey)!;
            dayData.sum += assessment.overallCQPM;
            dayData.count += 1;
            // Keep the most recent timestamp for this day
            if (timestamp > dayData.timestamp) {
                dayData.timestamp = timestamp;
            }
        });
        
        // Convert the grouped data to the array format we need
        const cqpmHistory: Array<{ date: string; cqpm: number; timestamp: number }> = [];
        
        cqpmByDay.forEach((data, dateKey) => {
            // Calculate average CQPM for this day
            const avgCQPM = data.sum / data.count;
            
            cqpmHistory.push({
                date: dateKey,
                cqpm: avgCQPM,
                timestamp: data.timestamp
            });
        });
        
        // Sort by date (ascending) for the history array
        cqpmHistory.sort((a, b) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        // Sort by timestamp (descending) to get the most recent days
        const sortedByRecency = [...cqpmHistory].sort((a, b) => b.timestamp - a.timestamp);
        
        // Get the latest and previous day's average CQPM values
        const latestCQPM = sortedByRecency.length > 0 ? sortedByRecency[0].cqpm : 0;
        const previousCQPM = sortedByRecency.length > 1 ? sortedByRecency[1].cqpm : null;
        
        // Remove timestamp from the history array before returning it
        const finalCqpmHistory = cqpmHistory.map(({ date, cqpm }) => ({ date, cqpm }));
        
        trackMetrics[trackId] = {
            latestCQPM,
            previousCQPM,
            cqpmHistory: finalCqpmHistory
        };
    });
    
    return trackMetrics;
};

export const searchUsers = async (email: string) => {
    try {
        // Add input validation
        if (!email || typeof email !== 'string') {
            return { users: [] };
        }

        // Normalize email (trim and lowercase) for more consistent search
        const normalizedEmail = email.trim().toLowerCase();
        
        const result = await dynamoDB.send(new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'email-index',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': normalizedEmail
            },
            ProjectionExpression: 'userId, email, #name',
            ExpressionAttributeNames: {
                '#name': 'name'
            },
            Limit: 50 // Add reasonable limit for performance
        }));

        return {
            users: result.Items?.map(user => ({
                userId: user.userId,
                email: user.email,
                name: user.name || 'Unknown'
            })) || []
        };
    } catch (error) {
        console.error('SearchUsers error:', error);
        throw error instanceof Error ? error : new Error('Failed to search users');
    }
};

interface UserProgressResult {
    [userId: string]: {
        name: string;
        email: string;
        tracks: {
            [trackId: string]: {
                latestCQPM: number;
                previousCQPM: number | null;
                cqpmHistory: Array<{date: string, cqpm: number}>;
            }
        }
    }
}

export const getUserCQPM = async (): Promise<UserProgressResult> => {
    try {
        // First get all users with their profiles using pagination for better performance
        const users: any[] = [];
        let lastEvaluatedKey: Record<string, any> | undefined;
        
        do {
            const scanParams: any = {
                TableName: TABLE_NAME,
                FilterExpression: 'begins_with(PK, :pk) AND SK = :sk',
                ExpressionAttributeValues: {
                    ':pk': 'USER#',
                    ':sk': 'PROFILE'
                },
                Limit: 100 // Set a reasonable batch size
            };
            
            if (lastEvaluatedKey) {
                scanParams.ExclusiveStartKey = lastEvaluatedKey;
            }
            
            const userScan = await dynamoDB.send(new ScanCommand(scanParams));
            
            if (userScan.Items && userScan.Items.length > 0) {
                users.push(...userScan.Items);
            }
            
            lastEvaluatedKey = userScan.LastEvaluatedKey;
        } while (lastEvaluatedKey);

        // Process users in parallel batches for better performance
        const finalResult: UserProgressResult = {};
        
        // Use Promise.all to process users in parallel
        const userPromises = users.map(async (user) => {
            const userId = user.PK.replace('USER#', '');
            
            const assessments = await dynamoDB.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                FilterExpression: '#status = :status',
                ExpressionAttributeValues: {
                    ':pk': `USER#${userId}`,
                    ':sk': 'PROGRESSASSESSMENT#',
                    ':status': 'completed'
                },
                ExpressionAttributeNames: {
                    '#status': 'status'
                }
            }));

            if (!assessments.Items?.length) return null;

            return {
                userId,
                userData: {
                    name: user.name || 'Unknown',
                    email: user.email || '',
                    tracks: calculateTrackMetrics(assessments.Items)
                }
            };
        });
        
        // Wait for all queries to complete
        const results = await Promise.all(userPromises);
        
        // Filter out null results and build final result object
        results.forEach(result => {
            if (result) {
                finalResult[result.userId] = result.userData;
            }
        });

        return finalResult;
    } catch (error) {
        console.error('GetUserCQPM error:', error);
        throw error instanceof Error ? error : new Error('Failed to get user progress');
    }
};

// Helper function to get daily goals data for a user
async function getUserDailyGoalsData(userId: string, trackIds: string[], focusTrack?: string): Promise<{ 
    todaysGoals: { achieved: number, total: number },
    dailyGoalsData: { date: string, achieved: number, total: number }[],
    goalCompletionRate: number
}> {
    try {
        // Default response structure
        const defaultResponse = {
            todaysGoals: { achieved: 0, total: 0 },
            dailyGoalsData: [],
            goalCompletionRate: 0
        };
        
        // If no trackIds, return default response
        if (!trackIds.length) {
            return defaultResponse;
        }

        // First check if user has a focusTrack setting
        if (focusTrack && typeof focusTrack === 'string') {
            // Use the user's focus track for goals
            const goalsSummary = await getGoalsSummaryForLastDaysService(userId, focusTrack);
            
            // If no summary data, return default
            if (!goalsSummary || goalsSummary.length === 0) {
                return defaultResponse;
            }
            
            // Convert goals summary to the format expected by the frontend
            const allDailyGoalsData = goalsSummary.map(day => ({
                date: day.date,
                achieved: day.goalsAchievedCount,
                total: day.goalsCount
            }));
            
            // Get today's formatted date string for comparison
            const today = new Date();
            const todayFormatted = today.toISOString().split('T')[0];
            
            // Look for today's data in the goals summary
            const todayDataItem = allDailyGoalsData.find(day => day.date === todayFormatted);
            const todayData = todayDataItem || { date: todayFormatted, achieved: 0, total: 0 };
            
            // Filter out today from the past days data
            const pastDaysData = allDailyGoalsData.filter(day => day.date !== todayFormatted);
            
            // Calculate goal completion rate for past 7 days
            let totalAchieved = 0;
            let totalGoals = 0;
            
            pastDaysData.forEach(day => {
                totalAchieved += day.achieved;
                totalGoals += day.total;
            });
            
            // Calculate the completion rate as a percentage
            // If there are no goals (totalGoals = 0), return 0%
            const goalCompletionRate = totalGoals > 0 
                ? Math.round((totalAchieved / totalGoals) * 100) 
                : 0;
            
            return {
                todaysGoals: { 
                    achieved: todayData.achieved, 
                    total: todayData.total 
                },
                dailyGoalsData: pastDaysData,
                goalCompletionRate
            };
        } else {
            // If no focus track, aggregate goals across all tracks
            // Get an array of unique track IDs to process
            const uniqueTrackIds = Array.from(trackIds);
            
            // Initialize data structure for aggregated goals
            const today = new Date();
            const todayFormatted = today.toISOString().split('T')[0];
            
            // Initialize data structure for tracking goals by date across all tracks
            // Map<dateString, {achieved: number, total: number}>
            const aggregatedGoalsByDate = new Map();
            
            // Initialize with today and 7 previous days
            for (let i = 0; i < 8; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateString = date.toISOString().split('T')[0];
                aggregatedGoalsByDate.set(dateString, { achieved: 0, total: 0 });
            }
            
            // Process each track and update aggregated goals
            for (const trackId of uniqueTrackIds) {
                const goalsSummary = await getGoalsSummaryForLastDaysService(userId, trackId);
                
                if (goalsSummary && goalsSummary.length > 0) {
                    // Update aggregated goals for each day
                    goalsSummary.forEach(day => {
                        const dateData = aggregatedGoalsByDate.get(day.date);
                        if (dateData) {
                            dateData.achieved += day.goalsAchievedCount;
                            dateData.total += day.goalsCount;
                        }
                    });
                }
            }
            
            // Extract today's data using the explicit today's date
            const todayData = aggregatedGoalsByDate.get(todayFormatted) || { achieved: 0, total: 0 };
            
            // Convert the aggregated data to the expected format for the past 7 days (excluding today)
            const pastDaysData: { date: string; achieved: number; total: number }[] = [];
            
            // Convert Map to array and sort by date (newest first)
            const sortedDates = Array.from(aggregatedGoalsByDate.entries())
                .sort((a, b) => b[0].localeCompare(a[0]));
            
            // Filter out today's entry and add the remaining days to pastDaysData
            for (const [date, data] of sortedDates) {
                if (date !== todayFormatted) {
                    pastDaysData.push({
                        date,
                        achieved: data.achieved,
                        total: data.total
                    });
                }
            }
            
            // Limit to 7 days if we have more
            const limitedPastDaysData = pastDaysData.slice(0, 7);
            
            // Calculate goal completion rate for past 7 days
            let totalAchieved = 0;
            let totalGoals = 0;
            
            limitedPastDaysData.forEach(day => {
                totalAchieved += day.achieved;
                totalGoals += day.total;
            });
            
            // Calculate the completion rate as a percentage
            const goalCompletionRate = totalGoals > 0 
                ? Math.round((totalAchieved / totalGoals) * 100) 
                : 0;
            
            return {
                todaysGoals: { 
                    achieved: todayData.achieved, 
                    total: todayData.total 
                },
                dailyGoalsData: limitedPastDaysData,
                goalCompletionRate
            };
        }
    } catch (error) {
        console.error(`Error getting daily goals for user ${userId}:`, error);
        return {
            todaysGoals: { achieved: 0, total: 0 },
            dailyGoalsData: [],
            goalCompletionRate: 0
        };
    }
}

/**
 * Get active students - users who have had activity in the last 7 days
 * Also gets the count of facts practiced with 100% accuracy in each category
 */
export const getActiveStudents = async (filterTestUsers: boolean = true): Promise<{
    [userId: string]: {
        name: string;
        email: string;
        campus?: string;
        focusTrack?: string;
        tracks: Record<string, any>;
        sessionData: {
            timeSpentToday: number;
            avgTimeSpentWeek: number;
            dailyTimeData: { date: string; totalTime: number }[];
            lastActivity: string;
        };
        accuracyFacts: {
            accuracyPractice: number;
            fluency1_5Practice: number;
            learningFacts: number;
        };
        goals: {
            todaysGoals: { achieved: number; total: number };
            dailyGoalsData: { date: string; achieved: number; total: number }[];
            goalCompletionRate: number; // Average goal completion rate for the past 7 days (%)
        };
    }
}> => {
    try {
        // Get all users with their profiles using pagination
        const users: any[] = [];
        let lastEvaluatedKey: Record<string, any> | undefined;
        
        // Better pagination handling
        do {
            const scanParams: any = {
                TableName: TABLE_NAME,
                FilterExpression: 'begins_with(PK, :pk) AND SK = :sk',
                ExpressionAttributeValues: {
                    ':pk': 'USER#',
                    ':sk': 'PROFILE'
                },
                Limit: 100 // Set a reasonable batch size
            };
            
            if (lastEvaluatedKey) {
                scanParams.ExclusiveStartKey = lastEvaluatedKey;
            }
            
            const userScan = await dynamoDB.send(new ScanCommand(scanParams));
            
            if (userScan.Items && userScan.Items.length > 0) {
                users.push(...userScan.Items);
            }
            
            lastEvaluatedKey = userScan.LastEvaluatedKey;
        } while (lastEvaluatedKey);
        
        // Filter test/admin users if needed
        const filteredUsers = filterTestUsers 
            ? users.filter(user => {
                const email = (user.email || '').toLowerCase();
                return !email.includes('test') && 
                       !email.includes('admin') && 
                       !email.endsWith('@trilogy.com');
              })
            : users;
            
        // Calculate date range once
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        // Calculate 30 days ago for assessment filtering
        const thirtyDaysAgo = addDays(now, -30);
        
        // Prepare today's date range for session analytics (only calculate once)
        const todayStart = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        const todayEnd = new Date(now.setHours(23, 59, 59, 999)).toISOString();
        
        // Modified: Use Promise.allSettled instead of Promise.all to handle errors gracefully
        const userPromises = filteredUsers.map(async (user) => {
            try {
                const userId = user.PK.replace('USER#', '');
                
                // Get user's last activity
                const lastActivity = await sessionAnalyticsService.getLastActivity(userId);
                
                // Skip users who weren't active in the last 7 days
                if (!lastActivity) return null;
                
                const lastActivityDate = new Date(lastActivity);
                if (lastActivityDate < sevenDaysAgo) return null;
                
                // Get session data for today
                // Use current date range to get today's sessions
                let todaySessions;
                try {
                    todaySessions = await dynamoDB.send(new QueryCommand({
                        TableName: TABLE_NAME,
                        IndexName: 'UserIdIndex',
                        KeyConditionExpression: 'userId = :userId',
                        FilterExpression: 'begins_with(SK, :sk) AND startTime BETWEEN :start AND :end',
                        ExpressionAttributeValues: {
                            ':userId': userId,
                            ':sk': 'SESSION#',
                            ':start': todayStart,
                            ':end': todayEnd
                        }
                    }));
                } catch (error) {
                    console.error(`Error getting today's sessions for user ${userId}:`, error);
                    todaySessions = { Items: [] };
                }
                
                // Extract unique fact IDs practiced today from all sessions
                const factsByCategory: Record<string, Set<string>> = {
                    accuracyPractice: new Set<string>(),
                    fluency1_5Practice: new Set<string>()
                };
                
                // Track fact progress by trackId
                const progressByTrack: Record<string, any> = {};
                
                // Process all sessions to get their trackIds and fact data
                const trackIds = new Set<string>();
                if (todaySessions.Items?.length) {
                    todaySessions.Items.forEach((session: any) => {
                        const trackId = session.trackId;
                        trackIds.add(trackId);
                        
                        if (session.factsCovered) {
                            // For the aggregate facts count
                            (session.factsCovered.accuracyPractice || []).forEach((factId: string) => 
                                factsByCategory.accuracyPractice.add(factId));
                            (session.factsCovered.fluency1_5Practice || []).forEach((factId: string) => 
                                factsByCategory.fluency1_5Practice.add(factId));
                        }
                    });
                }
                
                // Get progress data for each track the user practiced today
                if (trackIds.size > 0) {
                    // Modified: Use Promise.allSettled for track progress
                    const progressPromises = Array.from(trackIds).map(async (trackId) => {
                        try {
                            const trackProgress = await dynamoDB.send(new QueryCommand({
                                TableName: TABLE_NAME,
                                KeyConditionExpression: 'PK = :pk AND SK = :sk',
                                ExpressionAttributeValues: {
                                    ':pk': `USER#${userId}`,
                                    ':sk': `PROGRESS#${trackId}`
                                }
                            }));
                            
                            if (trackProgress.Items?.length) {
                                progressByTrack[trackId] = trackProgress.Items[0];
                            }
                            
                            return trackId;
                        } catch (error) {
                            console.error(`Error getting track progress for user ${userId}, track ${trackId}:`, error);
                            return trackId;
                        }
                    });
                    
                    // Wait for all track progress queries and handle errors
                    await Promise.allSettled(progressPromises);
                }
                
                // Count facts with perfect accuracy in each category
                const accuracyFactCounts = {
                    accuracyPractice: 0,
                    fluency1_5Practice: 0,
                    learningFacts: 0
                };
                
                // Track learning facts across all tracks
                const learningFacts = new Set<string>();
                
                // Process all sessions to populate learningFacts
                if (todaySessions.Items?.length) {
                    todaySessions.Items.forEach((session: any) => {
                        if (session.factsCovered) {
                            // Track learning facts
                            (session.factsCovered.learning || []).forEach((factId: string) => 
                                learningFacts.add(factId));
                        }
                    });
                }
                
                // Update accuracyFactCounts with the number of learning facts
                accuracyFactCounts.learningFacts = learningFacts.size;
                
                // Get assessments for tracks data
                let assessmentsResult;
                try {
                    assessmentsResult = await dynamoDB.send(new QueryCommand({
                        TableName: TABLE_NAME,
                        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                        FilterExpression: '#status = :status AND lastUpdated >= :thirtyDaysAgo',
                        ExpressionAttributeValues: {
                            ':pk': `USER#${userId}`,
                            ':sk': 'PROGRESSASSESSMENT#',
                            ':status': 'completed',
                            ':thirtyDaysAgo': thirtyDaysAgo.toISOString()
                        },
                        ExpressionAttributeNames: {
                            '#status': 'status'
                        }
                    }));
                } catch (error) {
                    console.error(`Error getting assessments for user ${userId}:`, error);
                    assessmentsResult = { Items: [] };
                }
                
                // Get session analytics data according to user's focusTrack setting
                let sessionAnalyticsWithHistory;
                
                // Check for user's focusTrack in profile
                const focusTrack = user.focusTrack;
                
                try {
                    if (focusTrack && typeof focusTrack === 'string') {
                        // Use the user's focus track for time calculations
                        sessionAnalyticsWithHistory = await sessionAnalyticsService.getSessionAnalyticsWithHistory(userId, focusTrack);
                    } else {
                        // Sum time across all tracks
                        sessionAnalyticsWithHistory = await sessionAnalyticsService.getSessionAnalyticsAcrossTracks(userId);
                    }
                } catch (error) {
                    console.error(`Error getting session analytics for user ${userId}:`, error);
                    sessionAnalyticsWithHistory = {
                        totalTimeToday: 0,
                        avgTimePerDayLastWeek: 0,
                        dailyTimeData: []
                    };
                }
                
                // Prepare tracks data
                let tracks = {};
                if (assessmentsResult.Items?.length) {
                    tracks = calculateTrackMetrics(assessmentsResult.Items);
                }
                
                // Get daily goals data for the user
                let goalsData;
                try {
                    if (focusTrack && typeof focusTrack === 'string') {
                        // Use the user's focus track for goals (just like with time data)
                        goalsData = await getUserDailyGoalsData(userId, [focusTrack], focusTrack);
                    } else {
                        // Use standard track IDs
                        goalsData = await getUserDailyGoalsData(userId, ['TRACK5', 'TRACK6', 'TRACK7', 'TRACK8'], undefined);
                    }
                } catch (error) {
                    console.error(`Error getting goals data for user ${userId}:`, error);
                    goalsData = {
                        todaysGoals: { achieved: 0, total: 0 },
                        dailyGoalsData: [],
                        goalCompletionRate: 0
                    };
                }
                
                return {
                    userId,
                    userData: {
                        name: user.name || 'Unknown',
                        email: user.email || '',
                        campus: user.campus,
                        focusTrack: user.focusTrack,
                        tracks,
                        sessionData: {
                            timeSpentToday: sessionAnalyticsWithHistory.totalTimeToday,
                            avgTimeSpentWeek: sessionAnalyticsWithHistory.avgTimePerDayLastWeek,
                            dailyTimeData: sessionAnalyticsWithHistory.dailyTimeData,
                            lastActivity
                        },
                        accuracyFacts: accuracyFactCounts,
                        goals: goalsData
                    }
                };
            } catch (error) {
                // Top-level error handler for each user
                console.error(`Error processing user ${user.PK}:`, error);
                return null;
            }
        });
        
        // Modified: Use Promise.allSettled instead of Promise.all
        const results = await Promise.allSettled(userPromises);
        
        // Filter out null results and convert to required format
        const activeUsers: Record<string, any> = {};
        
        // Modified: Handle both fulfilled and rejected promises
        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                activeUsers[result.value.userId] = result.value.userData;
            } else if (result.status === 'rejected') {
                // Log rejected promises (though we shouldn't get here due to the try/catch in each promise)
                console.error(`Promise for user ${filteredUsers[index]?.PK || 'unknown'} rejected:`, 
                    result.status === 'rejected' ? result.reason : 'Unknown reason');
            }
        });
        
        return activeUsers;
    } catch (error) {
        console.error('GetActiveStudents error:', error);
        throw error instanceof Error ? error : new Error('Failed to get active students');
    }
}; 