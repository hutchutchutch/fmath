import axios from 'axios';
import { dynamoDB } from '../config/aws';
import { ScanCommand, ScanCommandOutput } from '@aws-sdk/lib-dynamodb';
import { getValidOneRosterToken } from './oneRosterService';
import {
  OneRosterAssessmentResponse,
  OneRosterAssessmentResultAPI,
  ProcessedAssessmentResult,
  WeeklyData,
  UserRanking,
  SummaryStats,
  CqpmDashboardData,
  UserProfileForCqpm
} from '../types/cqpm';

const ONE_ROSTER_GRADEBOOK_API_BASE = 'https://api.alpha-1edtech.com/ims/oneroster/gradebook/v1p2';
const TABLE_NAME = process.env.TABLE_NAME || 'FastMath2';

/**
 * Get user email by OneRoster sourcedId
 */
async function getUserEmailBySourcedId(sourcedId: string): Promise<string | null> {
  try {
    const result = await dynamoDB.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'SK = :profileValue AND oneRosterSourcedId = :sourcedId',
      ExpressionAttributeValues: {
        ':profileValue': 'PROFILE',
        ':sourcedId': sourcedId
      },
      ProjectionExpression: 'email'
    }));

    if (result.Items && result.Items.length > 0) {
      return result.Items[0].email;
    }

    return null;
  } catch (error) {
    console.error(`Error getting user email for sourcedId ${sourcedId}:`, error);
    return null;
  }
}

/**
 * Get all user profiles with OneRoster sourcedIds
 */
async function getAllUserProfiles(): Promise<Map<string, string>> {
  try {
    const userMap = new Map<string, string>();
    let lastEvaluatedKey: Record<string, any> | undefined = undefined;

    do {
      const result: ScanCommandOutput = await dynamoDB.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'SK = :profileValue AND attribute_exists(oneRosterSourcedId)',
        ExpressionAttributeValues: {
          ':profileValue': 'PROFILE'
        },
        ProjectionExpression: 'oneRosterSourcedId, email',
        ExclusiveStartKey: lastEvaluatedKey,
        Limit: 100
      }));

      if (result.Items && result.Items.length > 0) {
        result.Items.forEach((item: any) => {
          if (item.oneRosterSourcedId && item.email) {
            userMap.set(item.oneRosterSourcedId, item.email);
          }
        });
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`Loaded ${userMap.size} user profiles with OneRoster sourcedIds`);
    return userMap;
  } catch (error) {
    console.error('Error getting user profiles:', error);
    return new Map();
  }
}

/**
 * Fetch assessment results from OneRoster API
 */
async function fetchAssessmentResults(days: number = 30): Promise<OneRosterAssessmentResultAPI[]> {
  try {
    const token = await getValidOneRosterToken();
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    console.log(`Fetching CQPM data for last ${days} days (${startDate.toISOString()} to ${endDate.toISOString()})`);

    const response = await axios.get<OneRosterAssessmentResponse>(
      `${ONE_ROSTER_GRADEBOOK_API_BASE}/assessmentResults/`,
      {
        params: {
          filter: "assessmentLineItemSourcedId~'Fastmath'"
        },
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.data || !response.data.assessmentResults) {
      throw new Error('No assessment results received from OneRoster API');
    }

    // Filter results by date range
    const filteredResults = response.data.assessmentResults.filter(result => {
      const scoreDate = new Date(result.scoreDate);
      return scoreDate >= startDate && scoreDate <= endDate;
    });

    console.log(`Fetched ${response.data.assessmentResults.length} total results, ${filteredResults.length} within date range`);
    return filteredResults;

  } catch (error: any) {
    if (error.isAxiosError) {
      console.error('OneRoster API Error:', error.response?.status, error.response?.data || error.message);
    } else {
      console.error('Error fetching assessment results:', error);
    }
    throw error;
  }
}

/**
 * Process raw assessment results into dashboard-friendly format
 */
async function processAssessmentResults(
  rawResults: OneRosterAssessmentResultAPI[]
): Promise<ProcessedAssessmentResult[]> {
  // Get user email mapping
  const userMap = await getAllUserProfiles();
  
  const processedResults: ProcessedAssessmentResult[] = [];

  for (const result of rawResults) {
    const userEmail = userMap.get(result.student.sourcedId);
    
    // Skip if we can't map the user
    if (!userEmail) {
      console.warn(`Could not find email for sourcedId: ${result.student.sourcedId}`);
      continue;
    }

    // Extract assessment type from assessmentLineItem sourcedId
    const assessmentType = result.assessmentLineItem.sourcedId
      .replace('fastmath-', '')
      .replace('-progress-assessment', '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());

    processedResults.push({
      sourcedId: result.sourcedId,
      userEmail,
      cqpm: result.metadata.cqpm,
      accuracyRate: result.metadata.accuracyRate,
      correct: result.metadata.correct,
      attempts: result.metadata.attempts,
      fluent: result.metadata.fluent.toLowerCase() === 'yes',
      scoreDate: result.scoreDate,
      dateLastModified: result.dateLastModified,
      assessmentType
    });
  }

  console.log(`Processed ${processedResults.length} assessment results`);
  return processedResults;
}

/**
 * Generate weekly aggregated data for charts
 */
function generateWeeklyData(results: ProcessedAssessmentResult[]): WeeklyData[] {
  const weeklyMap = new Map<string, {
    weekStart: Date,
    usersAttempted: Set<string>,
    usersFluent: Set<string>
  }>();

  // Group results by week
  results.forEach(result => {
    const scoreDate = new Date(result.scoreDate);
    // Get start of week (Monday)
    const weekStart = new Date(scoreDate);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday as start
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);

    const weekKey = weekStart.toISOString().split('T')[0];

    if (!weeklyMap.has(weekKey)) {
      weeklyMap.set(weekKey, {
        weekStart,
        usersAttempted: new Set(),
        usersFluent: new Set()
      });
    }

    const weekData = weeklyMap.get(weekKey)!;
    weekData.usersAttempted.add(result.userEmail);
    
    if (result.fluent) {
      weekData.usersFluent.add(result.userEmail);
    }
  });

  // Convert to array and sort by date
  const weeklyData: WeeklyData[] = Array.from(weeklyMap.entries())
    .map(([weekKey, data]) => {
      const weekEnd = new Date(data.weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      return {
        weekStart: data.weekStart.toISOString(),
        weekLabel: `${data.weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}-${weekEnd.toLocaleDateString('en-US', { day: 'numeric' })}`,
        usersAttempted: data.usersAttempted.size,
        usersFluent: data.usersFluent.size
      };
    })
    .sort((a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime());

  return weeklyData;
}

/**
 * Generate user rankings
 */
function generateUserRankings(results: ProcessedAssessmentResult[]): UserRanking[] {
  const userStats = new Map<string, {
    fluentCount: number,
    totalAssessments: number,
    cqpmSum: number,
    lastActivity: string
  }>();

  results.forEach(result => {
    const email = result.userEmail;
    
    if (!userStats.has(email)) {
      userStats.set(email, {
        fluentCount: 0,
        totalAssessments: 0,
        cqpmSum: 0,
        lastActivity: result.scoreDate
      });
    }

    const stats = userStats.get(email)!;
    stats.totalAssessments++;
    stats.cqpmSum += result.cqpm;
    
    if (result.fluent) {
      stats.fluentCount++;
    }

    // Update last activity if this is more recent
    if (new Date(result.scoreDate) > new Date(stats.lastActivity)) {
      stats.lastActivity = result.scoreDate;
    }
  });

  // Convert to rankings array
  const rankings: UserRanking[] = Array.from(userStats.entries())
    .map(([email, stats]) => ({
      userEmail: email,
      fluentCount: stats.fluentCount,
      totalAssessments: stats.totalAssessments,
      fluentPercentage: stats.totalAssessments > 0 
        ? (stats.fluentCount / stats.totalAssessments) * 100 
        : 0,
      averageCqpm: stats.totalAssessments > 0 
        ? stats.cqpmSum / stats.totalAssessments 
        : 0,
      lastActivity: stats.lastActivity
    }))
    .sort((a, b) => b.fluentCount - a.fluentCount); // Sort by fluent count descending

  return rankings;
}

/**
 * Generate summary statistics
 */
function generateSummaryStats(results: ProcessedAssessmentResult[]): SummaryStats {
  if (results.length === 0) {
    return {
      totalAssessments: 0,
      totalUsers: 0,
      averageCqpm: 0,
      fluentPercentage: 0,
      mostActiveAssessmentType: 'N/A'
    };
  }

  const uniqueUsers = new Set(results.map(r => r.userEmail));
  const fluentCount = results.filter(r => r.fluent).length;
  const totalCqpm = results.reduce((sum, r) => sum + r.cqpm, 0);

  // Find most active assessment type
  const typeCount = new Map<string, number>();
  results.forEach(result => {
    const count = typeCount.get(result.assessmentType) || 0;
    typeCount.set(result.assessmentType, count + 1);
  });

  let mostActiveType = 'N/A';
  let maxCount = 0;
  typeCount.forEach((count, type) => {
    if (count > maxCount) {
      maxCount = count;
      mostActiveType = type;
    }
  });

  return {
    totalAssessments: results.length,
    totalUsers: uniqueUsers.size,
    averageCqpm: totalCqpm / results.length,
    fluentPercentage: (fluentCount / results.length) * 100,
    mostActiveAssessmentType: mostActiveType
  };
}

/**
 * Get complete CQPM dashboard data
 */
export async function getCqpmDashboardData(days: number = 30): Promise<CqpmDashboardData> {
  try {
    console.log(`Generating CQPM dashboard data for last ${days} days`);

    // Fetch raw data from OneRoster
    const rawResults = await fetchAssessmentResults(days);
    
    // Process and enhance with user emails
    const processedResults = await processAssessmentResults(rawResults);
    
    // Generate derived data
    const weeklyData = generateWeeklyData(processedResults);
    const userRankings = generateUserRankings(processedResults);
    const summaryStats = generateSummaryStats(processedResults);

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const dashboardData: CqpmDashboardData = {
      weeklyData,
      assessmentResults: processedResults,
      userRankings,
      summaryStats,
      dateRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        days
      }
    };

    console.log(`CQPM dashboard data generated successfully:`, {
      assessmentResults: processedResults.length,
      weeklyDataPoints: weeklyData.length,
      userRankings: userRankings.length
    });

    return dashboardData;
  } catch (error) {
    console.error('Error generating CQPM dashboard data:', error);
    throw error;
  }
}