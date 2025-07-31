import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DailyGoals, GoalType } from '../types/dailyGoals';
import { SessionData } from '../types/sessionAnalytics';
import * as fs from 'fs';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});
const TABLE_NAME = 'FastMath2';

interface GoalAnalysisResult {
    totalDaysWithCompletedGoals: number;
    avgTimePerCompletedGoalDay: number;
    avgTimePerLearningGoal: number;
    avgTimePerAccuracyGoal: number;
    avgTimePerFluencyGoal: number;
    goalConfigurationCounts: Record<string, number>;
    trackBreakdown: Record<string, TrackAnalysis>;
    usersWithCompletedGoals: number;
}

interface TrackAnalysis {
    trackId: string;
    completedGoalDays: number;
    avgTimePerDay: number;
    avgLearningTime: number | null;
    avgAccuracyTime: number | null;
    avgFluencyTime: number | null;
}

// Helper function to extract date from ISO string
const getDateFromISOString = (isoString: string): string => {
    return isoString.split('T')[0];
};

// Main analysis function
async function analyzeGoalCompletionTime(): Promise<GoalAnalysisResult> {
    // Initialize result object
    const result: GoalAnalysisResult = {
        totalDaysWithCompletedGoals: 0,
        avgTimePerCompletedGoalDay: 0,
        avgTimePerLearningGoal: 0,
        avgTimePerAccuracyGoal: 0,
        avgTimePerFluencyGoal: 0,
        goalConfigurationCounts: {},
        trackBreakdown: {},
        usersWithCompletedGoals: 0
    };

    // Step 1: Find all daily goals with allCompleted = true
    const completedGoals: DailyGoals[] = await getCompletedGoals();
    console.log(`Found ${completedGoals.length} days with all goals completed`);
    
    if (completedGoals.length === 0) {
        return result;
    }

    // Tracking for averages
    let totalTimeAllGoals = 0;
    let totalLearningGoals = 0;
    let totalLearningTime = 0;
    let totalAccuracyGoals = 0;
    let totalAccuracyTime = 0;
    let totalFluencyGoals = 0;
    let totalFluencyTime = 0;
    
    // Track per-track stats
    const trackStats: Record<string, {
        totalTime: number,
        totalDays: number,
        learningGoals: number,
        learningTime: number,
        accuracyGoals: number,
        accuracyTime: number,
        fluencyGoals: number,
        fluencyTime: number
    }> = {};
    
    // Track users with completed goals
    const usersWithCompletedGoals = new Set<string>();
    
    // Count different goal configurations
    const goalConfigurations: Record<string, number> = {};

    // Step 2: For each completed goal day, get sessions for that day
    let processedGoals = 0;
    for (const dailyGoal of completedGoals) {
        processedGoals++;
        if (processedGoals % 10 === 0) {
            console.log(`Processing goal ${processedGoals} of ${completedGoals.length}`);
        }
        
        const userId = dailyGoal.userId;
        const date = dailyGoal.date;
        const trackId = dailyGoal.trackId;
        
        // Add user to set
        usersWithCompletedGoals.add(userId);
        
        // Initialize track stats if needed
        if (!trackStats[trackId]) {
            trackStats[trackId] = {
                totalTime: 0,
                totalDays: 0,
                learningGoals: 0,
                learningTime: 0,
                accuracyGoals: 0,
                accuracyTime: 0,
                fluencyGoals: 0,
                fluencyTime: 0
            };
        }
        
        // Count goal configuration
        const goalTypes = Object.keys(dailyGoal.goals).sort().join(',');
        goalConfigurations[goalTypes] = (goalConfigurations[goalTypes] || 0) + 1;

        // Get all sessions for this user on this date and track
        const sessions = await getSessionsForDate(userId, date, trackId);
        
        if (sessions.length === 0) {
            continue;
        }

        // Calculate total time for all sessions on this day
        const dailyTotalTime = sessions.reduce((sum, session) => sum + session.totalDuration, 0);
        totalTimeAllGoals += dailyTotalTime;
        trackStats[trackId].totalTime += dailyTotalTime;
        trackStats[trackId].totalDays += 1;
        
        // For specific goal types, only count days where that goal was present and completed
        if (dailyGoal.goals.learning && dailyGoal.goals.learning.completed === dailyGoal.goals.learning.total) {
            totalLearningGoals += dailyGoal.goals.learning.total;
            trackStats[trackId].learningGoals += dailyGoal.goals.learning.total;
            
            const learningTime = sessions.reduce((sum, session) => sum + (session.learningTime || 0), 0);
            totalLearningTime += learningTime;
            trackStats[trackId].learningTime += learningTime;
        }
        
        if (dailyGoal.goals.accuracy && dailyGoal.goals.accuracy.completed === dailyGoal.goals.accuracy.total) {
            totalAccuracyGoals += dailyGoal.goals.accuracy.total;
            trackStats[trackId].accuracyGoals += dailyGoal.goals.accuracy.total;
            
            const accuracyTime = sessions.reduce((sum, session) => sum + (session.accuracyPracticeTime || 0), 0);
            totalAccuracyTime += accuracyTime;
            trackStats[trackId].accuracyTime += accuracyTime;
        }
        
        if (dailyGoal.goals.fluency && dailyGoal.goals.fluency.completed === dailyGoal.goals.fluency.total) {
            totalFluencyGoals += dailyGoal.goals.fluency.total;
            trackStats[trackId].fluencyGoals += dailyGoal.goals.fluency.total;
            
            // Sum all fluency-related times - properly check each fluency level time property
            const fluencyTime = sessions.reduce((sum, session) => {
                return sum + 
                    (session.fluency6PracticeTime || 0) +
                    (session.fluency3PracticeTime || 0) +
                    (session.fluency2PracticeTime || 0) +
                    (session.fluency1_5PracticeTime || 0) +
                    (session.fluency1PracticeTime || 0);
            }, 0);
            
            totalFluencyTime += fluencyTime;
            trackStats[trackId].fluencyTime += fluencyTime;
        }
    }

    // Calculate overall averages
    result.totalDaysWithCompletedGoals = completedGoals.length;
    result.avgTimePerCompletedGoalDay = totalTimeAllGoals / completedGoals.length;
    result.usersWithCompletedGoals = usersWithCompletedGoals.size;
    result.goalConfigurationCounts = goalConfigurations;
    
    if (totalLearningGoals > 0) {
        result.avgTimePerLearningGoal = totalLearningTime / totalLearningGoals;
    }
    
    if (totalAccuracyGoals > 0) {
        result.avgTimePerAccuracyGoal = totalAccuracyTime / totalAccuracyGoals;
    }
    
    if (totalFluencyGoals > 0) {
        result.avgTimePerFluencyGoal = totalFluencyTime / totalFluencyGoals;
    }
    
    // Calculate per-track averages
    Object.entries(trackStats).forEach(([trackId, stats]) => {
        result.trackBreakdown[trackId] = {
            trackId,
            completedGoalDays: stats.totalDays,
            avgTimePerDay: stats.totalDays > 0 ? stats.totalTime / stats.totalDays : 0,
            avgLearningTime: stats.learningGoals > 0 ? stats.learningTime / stats.learningGoals : null,
            avgAccuracyTime: stats.accuracyGoals > 0 ? stats.accuracyTime / stats.accuracyGoals : null,
            avgFluencyTime: stats.fluencyGoals > 0 ? stats.fluencyTime / stats.fluencyGoals : null
        };
    });

    return result;
}

// Get all goals with allCompleted = true
async function getCompletedGoals(): Promise<DailyGoals[]> {
    const completedGoals: DailyGoals[] = [];
    let lastEvaluatedKey: any = undefined;
    
    do {
        // Scan for all goals with allCompleted = true
        const params: any = {
            TableName: TABLE_NAME,
            FilterExpression: 'begins_with(SK, :sk) AND allCompleted = :completed',
            ExpressionAttributeValues: {
                ':sk': 'GOALS#',
                ':completed': true
            }
        };
        
        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await dynamoDB.send(new ScanCommand(params));
        
        if (result.Items && result.Items.length > 0) {
            result.Items.forEach(item => {
                completedGoals.push(item as DailyGoals);
            });
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    return completedGoals;
}

// Get all sessions for a specific user, date, and track
async function getSessionsForDate(userId: string, date: string, trackId: string): Promise<SessionData[]> {
    const sessions: SessionData[] = [];
    
    try {
        // Use scan with multiple filters
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);
        
        // Format timestamps for DynamoDB
        const startTimestamp = startOfDay.toISOString();
        const endTimestamp = endOfDay.toISOString();
        
        let lastEvaluatedKey: any = undefined;
        
        do {
            const params: any = {
                TableName: TABLE_NAME,
                IndexName: 'UserIdIndex',
                KeyConditionExpression: 'userId = :userId',
                FilterExpression: 'SK = :sk AND startTime BETWEEN :startTime AND :endTime',
                ExpressionAttributeValues: {
                    ':userId': userId,
                    ':sk': `SESSION#${trackId}`,
                    ':startTime': startTimestamp,
                    ':endTime': endTimestamp
                }
            };
            
            if (lastEvaluatedKey) {
                params.ExclusiveStartKey = lastEvaluatedKey;
            }
            
            const result = await dynamoDB.send(new QueryCommand(params));
            
            if (result.Items && result.Items.length > 0) {
                result.Items.forEach(session => {
                    sessions.push(session as SessionData);
                });
            }
            
            lastEvaluatedKey = result.LastEvaluatedKey;
        } while (lastEvaluatedKey);
    } catch (error) {
        console.error(`Error getting sessions for ${userId} on ${date}:`, error);
    }
    
    return sessions;
}

// Run the analysis and save results to a file
async function runAnalysis() {
    try {
        console.log('Starting goal completion time analysis...');
        const results = await analyzeGoalCompletionTime();
        
        console.log('Analysis complete. Results:');
        console.log(JSON.stringify(results, null, 2));
        
        // Save results to a file
        fs.writeFileSync(
            './goalAnalysisResults.json', 
            JSON.stringify(results, null, 2)
        );
        
        // Also save a more human-readable summary
        const summary = generateReadableSummary(results);
        fs.writeFileSync('./goalAnalysisSummary.txt', summary);
        
        console.log('Results saved to goalAnalysisResults.json and goalAnalysisSummary.txt');
    } catch (error) {
        console.error('Error running analysis:', error);
    }
}

// Generate a human-readable summary
function generateReadableSummary(results: GoalAnalysisResult): string {
    const secondsToMinutes = (seconds: number) => (seconds / 60).toFixed(2);
    
    let summary = '=== GOAL COMPLETION TIME ANALYSIS SUMMARY ===\n\n';
    
    // Overall stats
    summary += `Total Days with Completed Goals: ${results.totalDaysWithCompletedGoals}\n`;
    summary += `Unique Users with Completed Goals: ${results.usersWithCompletedGoals}\n`;
    summary += `Average Time per Completed Goal Day: ${secondsToMinutes(results.avgTimePerCompletedGoalDay)} minutes\n\n`;
    
    // Goal-specific time averages
    summary += '--- AVERAGE TIME PER GOAL TYPE ---\n';
    summary += `Learning Goal: ${secondsToMinutes(results.avgTimePerLearningGoal)} minutes per goal\n`;
    summary += `Accuracy Goal: ${secondsToMinutes(results.avgTimePerAccuracyGoal)} minutes per goal\n`;
    summary += `Fluency Goal: ${secondsToMinutes(results.avgTimePerFluencyGoal)} minutes per goal\n\n`;
    
    // Goal configurations distribution
    summary += '--- GOAL CONFIGURATIONS ---\n';
    Object.entries(results.goalConfigurationCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([config, count]) => {
            const percentage = ((count / results.totalDaysWithCompletedGoals) * 100).toFixed(1);
            summary += `${config || 'Empty'}: ${count} days (${percentage}%)\n`;
        });
    summary += '\n';
    
    // Track-specific breakdown
    summary += '--- TRACK BREAKDOWN ---\n';
    Object.values(results.trackBreakdown)
        .sort((a, b) => b.completedGoalDays - a.completedGoalDays)
        .forEach(track => {
            summary += `Track ${track.trackId}: ${track.completedGoalDays} days\n`;
            summary += `  - Avg Time Per Day: ${secondsToMinutes(track.avgTimePerDay)} minutes\n`;
            
            if (track.avgLearningTime !== null) {
                summary += `  - Avg Learning Time: ${secondsToMinutes(track.avgLearningTime)} minutes per goal\n`;
            }
            
            if (track.avgAccuracyTime !== null) {
                summary += `  - Avg Accuracy Time: ${secondsToMinutes(track.avgAccuracyTime)} minutes per goal\n`;
            }
            
            if (track.avgFluencyTime !== null) {
                summary += `  - Avg Fluency Time: ${secondsToMinutes(track.avgFluencyTime)} minutes per goal\n`;
            }
            
            summary += '\n';
        });
    
    return summary;
}

// Run the script
runAnalysis(); 