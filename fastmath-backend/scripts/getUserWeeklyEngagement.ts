import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: '../../.env' });

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);

// Constants
const SESSION_TABLE = process.env.SESSION_TABLE || 'FastMath2';
const FIVE_MINUTES_IN_SECONDS = 300; // 5 minutes = 300 seconds

// Interface for active user data
interface ActiveUser {
  userId: string;
  email?: string;
  totalTimeSpent: number;
  isActive: boolean; // Flag to indicate if user meets the 5-minute threshold
  trackEngagement?: Record<string, number>; // Track-specific time spent
}

// Interface for session data from DynamoDB
interface SessionData {
  PK: string;
  SK: string;
  userId: string;
  sessionId: string;
  trackId: string;
  startTime: string;
  endTime: string;
  totalDuration: number;
}

// Interface for user and track data
interface UserTrackData {
  userId: string;
  trackId: string;
}

/**
 * Get all sessions from the table
 * This will help us debug what sessions are actually available
 */
async function getAllSessions(): Promise<void> {
  try {
    console.log('Getting all sessions in the table to check data availability...');
    
    // First perform a scan to find all session items
    const result = await dynamoDB.send(new ScanCommand({
      TableName: SESSION_TABLE,
      FilterExpression: 'attribute_exists(sessionId) AND attribute_exists(totalDuration)',
      ProjectionExpression: 'userId, sessionId, startTime, endTime, totalDuration'
    }));
    
    if (!result.Items || result.Items.length === 0) {
      console.log('No sessions found in the table');
      return;
    }
    
    console.log(`Found ${result.Items.length} sessions total in the database`);
    
    // Group by month for a summary
    const sessionsByMonth: Record<string, number> = {};
    
    result.Items.forEach(item => {
      if (item.startTime) {
        const date = new Date(item.startTime);
        const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!sessionsByMonth[monthYear]) {
          sessionsByMonth[monthYear] = 0;
        }
        sessionsByMonth[monthYear]++;
      }
    });
    
    console.log('Sessions by month:');
    Object.entries(sessionsByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([month, count]) => {
        console.log(`${month}: ${count} sessions`);
      });
      
    // Show a few examples of session data to verify the format
    if (result.Items.length > 0) {
      console.log('\nExample session data:');
      console.log(JSON.stringify(result.Items[0], null, 2));
    }
  } catch (error) {
    console.error('Error getting all sessions:', error);
  }
}

/**
 * Get all unique user IDs from the table
 * @returns List of all user IDs
 */
async function getAllUserIds(): Promise<string[]> {
  try {
    // Query for all users with sessions
    const result = await dynamoDB.send(new ScanCommand({
      TableName: SESSION_TABLE,
      FilterExpression: 'begins_with(SK, :sessionPrefix)',
      ExpressionAttributeValues: {
        ':sessionPrefix': 'SESSION#'
      },
      ProjectionExpression: 'userId'
    }));

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    // Extract unique user IDs
    const userIds = new Set<string>();
    result.Items.forEach(item => {
      if (item.userId) {
        userIds.add(item.userId);
      }
    });

    return Array.from(userIds);
  } catch (error) {
    console.error('Error getting all user IDs:', error);
    return [];
  }
}

/**
 * Get list of tracks for a user
 * @param userId User ID to check
 * @returns List of track IDs
 */
async function getUserTracks(userId: string): Promise<string[]> {
  try {
    // Query for sessions with this userId
    const result = await dynamoDB.send(new QueryCommand({
      TableName: SESSION_TABLE,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'begins_with(SK, :sessionPrefix)',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':sessionPrefix': 'SESSION#'
      }
    }));

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    // Extract unique track IDs
    const trackIds = new Set<string>();
    result.Items.forEach(item => {
      if (item.SK && item.SK.startsWith('SESSION#')) {
        const trackId = item.SK.split('#')[1];
        if (trackId) {
          trackIds.add(trackId);
        }
      }
    });

    return Array.from(trackIds);
  } catch (error) {
    console.error(`Error getting tracks for user ${userId}:`, error);
    return [];
  }
}

/**
 * Get all users and their activity during a specific date range
 * @param startDate ISO string date for the start of the range
 * @param endDate ISO string date for the end of the range
 * @returns Array of all users with their total time spent and active status
 */
async function getActiveUsers(startDate: string, endDate: string): Promise<ActiveUser[]> {
  console.log(`Finding users between ${startDate} and ${endDate}...`);
  
  // Get all user IDs first
  const userIds = await getAllUserIds();
  console.log(`Found ${userIds.length} unique users in the database`);
  
  // Track time spent by each user
  const userTrackTimes: Record<string, Record<string, number>> = {};
  let totalSessions = 0;
  
  // For each user, get their time spent in each track during the date range
  for (const userId of userIds) {
    // Get all tracks the user has sessions in
    const trackIds = await getUserTracks(userId);
    
    for (const trackId of trackIds) {
      try {
        // Query for sessions with this userId and trackId within the date range
        const result = await dynamoDB.send(new QueryCommand({
          TableName: SESSION_TABLE,
          IndexName: 'UserIdIndex',
          KeyConditionExpression: 'userId = :userId',
          FilterExpression: 'SK = :sk AND startTime BETWEEN :startDate AND :endDate',
          ExpressionAttributeValues: {
            ':userId': userId,
            ':sk': `SESSION#${trackId}`,
            ':startDate': startDate,
            ':endDate': endDate
          }
        }));
        
        if (result.Items && result.Items.length > 0) {
          totalSessions += result.Items.length;
          
          // Initialize user and track if not exists
          if (!userTrackTimes[userId]) {
            userTrackTimes[userId] = {};
          }
          if (!userTrackTimes[userId][trackId]) {
            userTrackTimes[userId][trackId] = 0;
          }
          
          // Sum up time spent in this track
          result.Items.forEach(item => {
            if (item.totalDuration) {
              userTrackTimes[userId][trackId] += item.totalDuration;
            }
          });
        }
      } catch (error) {
        console.error(`Error getting data for user ${userId} and track ${trackId}:`, error);
      }
    }
  }
  
  console.log(`Found ${totalSessions} sessions between ${startDate} and ${endDate}`);
  console.log(`Found ${Object.keys(userTrackTimes).length} unique users with sessions`);
  
  // Calculate total time for each user across all tracks
  const userTotalTime: Record<string, number> = {};
  
  Object.entries(userTrackTimes).forEach(([userId, trackTimes]) => {
    userTotalTime[userId] = Object.values(trackTimes).reduce((total, time) => total + time, 0);
  });
  
  // Create the full list of users with their times
  const allUsers: ActiveUser[] = [];
  
  // First add users with sessions
  Object.entries(userTotalTime).forEach(([userId, totalTimeSpent]) => {
    allUsers.push({
      userId,
      totalTimeSpent,
      isActive: totalTimeSpent >= FIVE_MINUTES_IN_SECONDS,
      trackEngagement: userTrackTimes[userId]
    });
  });
  
  // Add users without any sessions in this period
  for (const userId of userIds) {
    if (!userTotalTime[userId]) {
      allUsers.push({
        userId,
        totalTimeSpent: 0,
        isActive: false
      });
    }
  }
  
  // Count active users (those with at least 5 minutes)
  const activeUserCount = allUsers.filter(user => user.isActive).length;
  console.log(`Of these, ${activeUserCount} users spent at least 5 minutes in the app`);
  
  // Get emails for all users
  let usersWithEmails = 0;
  for (const user of allUsers) {
    try {
      const userResult = await dynamoDB.send(new GetCommand({
        TableName: SESSION_TABLE,
        Key: {
          PK: `USER#${user.userId}`,
          SK: 'PROFILE'
        }
      }));
      
      if (userResult.Item && userResult.Item.email) {
        user.email = userResult.Item.email;
        usersWithEmails++;
      }
    } catch (error) {
      console.error(`Error fetching user data for ${user.userId}:`, error);
    }
  }
  
  console.log(`Found emails for ${usersWithEmails} out of ${allUsers.length} users`);
  
  return allUsers;
}

/**
 * Get all users who spent any time during a specific date range, with detailed track information
 * @param startDate ISO string date for the start of the range
 * @param endDate ISO string date for the end of the range
 * @returns Array of all users with their time spent on each track
 */
async function getUsersWithAnyEngagement(startDate: string, endDate: string): Promise<ActiveUser[]> {
  console.log(`Finding all users with any engagement between ${startDate} and ${endDate}...`);
  
  // Get all user IDs first
  const userIds = await getAllUserIds();
  console.log(`Found ${userIds.length} unique users in the database`);
  
  // Track time spent by each user on each track
  const userTrackTimes: Record<string, Record<string, number>> = {};
  let totalSessions = 0;
  
  // For each user, get their time spent in each track during the date range
  for (const userId of userIds) {
    // Get all tracks the user has sessions in
    const trackIds = await getUserTracks(userId);
    
    for (const trackId of trackIds) {
      try {
        // Query for sessions with this userId and trackId within the date range
        const result = await dynamoDB.send(new QueryCommand({
          TableName: SESSION_TABLE,
          IndexName: 'UserIdIndex',
          KeyConditionExpression: 'userId = :userId',
          FilterExpression: 'SK = :sk AND startTime BETWEEN :startDate AND :endDate',
          ExpressionAttributeValues: {
            ':userId': userId,
            ':sk': `SESSION#${trackId}`,
            ':startDate': startDate,
            ':endDate': endDate
          }
        }));
        
        if (result.Items && result.Items.length > 0) {
          totalSessions += result.Items.length;
          
          // Initialize user and track if not exists
          if (!userTrackTimes[userId]) {
            userTrackTimes[userId] = {};
          }
          if (!userTrackTimes[userId][trackId]) {
            userTrackTimes[userId][trackId] = 0;
          }
          
          // Sum up time spent in this track
          result.Items.forEach(item => {
            if (item.totalDuration) {
              userTrackTimes[userId][trackId] += item.totalDuration;
            }
          });
        }
      } catch (error) {
        console.error(`Error getting data for user ${userId} and track ${trackId}:`, error);
      }
    }
  }
  
  console.log(`Found ${totalSessions} sessions between ${startDate} and ${endDate}`);
  console.log(`Found ${Object.keys(userTrackTimes).length} unique users with sessions`);
  
  // Create the full list of users with their times
  const usersWithEngagement: ActiveUser[] = [];
  
  // Only add users who had sessions in this period
  Object.entries(userTrackTimes).forEach(([userId, trackTimes]) => {
    const totalTimeSpent = Object.values(trackTimes).reduce((total, time) => total + time, 0);
    
    usersWithEngagement.push({
      userId,
      totalTimeSpent,
      isActive: totalTimeSpent >= FIVE_MINUTES_IN_SECONDS,
      trackEngagement: trackTimes
    });
  });
  
  // Get emails for all users
  let usersWithEmails = 0;
  for (const user of usersWithEngagement) {
    try {
      const userResult = await dynamoDB.send(new GetCommand({
        TableName: SESSION_TABLE,
        Key: {
          PK: `USER#${user.userId}`,
          SK: 'PROFILE'
        }
      }));
      
      if (userResult.Item && userResult.Item.email) {
        user.email = userResult.Item.email;
        usersWithEmails++;
      }
    } catch (error) {
      console.error(`Error fetching user data for ${user.userId}:`, error);
    }
  }
  
  console.log(`Found emails for ${usersWithEmails} out of ${usersWithEngagement.length} users`);
  
  return usersWithEngagement;
}

async function generateWeeklyEngagementReport() {
  try {
    // First check for all available sessions
    await getAllSessions();
    
    console.log('\nUser Engagement Report (5+ minutes)\n');
    console.log('╔═══════════════════════════════╦═══════════════╗');
    console.log('║ Date Range                    ║ Active Users  ║');
    console.log('╠═══════════════════════════════╬═══════════════╣');

    // Week 1: Mar 24 - Mar 30
    const week1Start = '2025-03-24T00:00:00.000Z';
    const week1End = '2025-03-30T23:59:59.999Z';
    const week1Users = await getActiveUsers(week1Start, week1End);
    const week1ActiveUsers = week1Users.filter(user => user.isActive);
    console.log(`║ Mar 24 - Mar 30, 2025         ║ ${week1ActiveUsers.length.toString().padStart(13)} ║`);
    
    // Week 2: Mar 31 - Apr 6
    const week2Start = '2025-03-31T00:00:00.000Z';
    const week2End = '2025-04-06T23:59:59.999Z';
    const week2Users = await getActiveUsers(week2Start, week2End);
    const week2ActiveUsers = week2Users.filter(user => user.isActive);
    console.log(`║ Mar 31 - Apr 6, 2025          ║ ${week2ActiveUsers.length.toString().padStart(13)} ║`);
    
    // Week 3: Apr 7 - Apr 13
    const week3Start = '2025-04-07T00:00:00.000Z';
    const week3End = '2025-04-13T23:59:59.999Z';
    const week3Users = await getActiveUsers(week3Start, week3End);
    const week3ActiveUsers = week3Users.filter(user => user.isActive);
    console.log(`║ Apr 7 - Apr 13, 2025          ║ ${week3ActiveUsers.length.toString().padStart(13)} ║`);
    
    console.log('╚═══════════════════════════════╩═══════════════╝');

    // Additional summary stats
    const totalUniqueUserIds = new Set([
      ...week1ActiveUsers.map(u => u.userId),
      ...week2ActiveUsers.map(u => u.userId),
      ...week3ActiveUsers.map(u => u.userId)
    ]);
    
    const weekOverWeekGrowth = calculatePercentChange(week1ActiveUsers.length, week2ActiveUsers.length);
    const week2to3Growth = calculatePercentChange(week2ActiveUsers.length, week3ActiveUsers.length);
    
    console.log('\nSummary Statistics:');
    console.log(`Total unique active users across all periods: ${totalUniqueUserIds.size}`);
    console.log(`Week 1 to Week 2 change: ${weekOverWeekGrowth > 0 ? '+' : ''}${weekOverWeekGrowth.toFixed(1)}%`);
    console.log(`Week 2 to Week 3 change: ${week2to3Growth > 0 ? '+' : ''}${week2to3Growth.toFixed(1)}%`);

    // Generate track-specific insights
    await generateTrackSpecificInsights(week1Start, week3End);

    // Export all users to CSV files, including those with less than 5 minutes activity
    exportUserListToCSV(week1Users, 'all_users_week1.csv');
    exportUserListToCSV(week2Users, 'all_users_week2.csv');
    exportUserListToCSV(week3Users, 'all_users_week3.csv');
    
    console.log('\nUser Data Exported:');
    console.log('- Week 1 (Mar 24-30): all_users_week1.csv');
    console.log('- Week 2 (Mar 31-Apr 6): all_users_week2.csv');
    console.log('- Week 3 (Apr 7-13): all_users_week3.csv');
  } catch (error) {
    console.error('Error generating engagement report:', error);
  }
}

/**
 * Get user engagement data for Apr 14-20, 2025
 */
async function getApril14to20Engagement() {
  try {
    console.log('\n========== ENGAGEMENT REPORT: APR 14-20, 2025 ==========\n');
    
    const startDate = '2025-04-14T00:00:00.000Z';
    const endDate = '2025-04-20T23:59:59.999Z';
    
    // Get all users with any engagement during this period
    const users = await getUsersWithAnyEngagement(startDate, endDate);
    
    console.log(`\nFound ${users.length} users with activity between Apr 14-20, 2025`);
    
    if (users.length === 0) {
      console.log('No user engagement data found for this period.');
      return;
    }
    
    // Sort users by total time spent (descending)
    users.sort((a, b) => b.totalTimeSpent - a.totalTimeSpent);
    
    // Print user engagement table
    console.log('\nUser Engagement Details (sorted by time spent):');
    console.log('╔══════════════════════╦═════════════════╦════════════════════╦══════════════════════════════════════╗');
    console.log('║ User ID              ║ Email           ║ Total Time (mins)  ║ Track Breakdown                      ║');
    console.log('╠══════════════════════╬═════════════════╬════════════════════╬══════════════════════════════════════╣');
    
    users.forEach(user => {
      const timeInMinutes = (user.totalTimeSpent / 60).toFixed(1);
      
      // Format track engagement
      let trackBreakdown = 'N/A';
      if (user.trackEngagement) {
        trackBreakdown = Object.entries(user.trackEngagement)
          .map(([trackId, time]) => `${trackId}: ${(time / 60).toFixed(1)}m`)
          .join(', ');
      }
      
      // Trim track breakdown if too long
      const maxTrackLength = 40;
      if (trackBreakdown.length > maxTrackLength) {
        trackBreakdown = trackBreakdown.substring(0, maxTrackLength - 3) + '...';
      }
      
      console.log(`║ ${user.userId.padEnd(20)} ║ ${(user.email || 'N/A').padEnd(17)} ║ ${timeInMinutes.padStart(18)} ║ ${trackBreakdown.padEnd(38)} ║`);
    });
    
    console.log('╚══════════════════════╩═════════════════╩════════════════════╩══════════════════════════════════════╝');
    
    // Export to CSV with detailed track information
    exportDetailedUserListToCSV(users, 'user_engagement_apr14-20_2025.csv');
    
    console.log('\nDetailed user engagement data exported to: user_engagement_apr14-20_2025.csv');
    
    // Generate track-specific summary for this period
    await generateTrackSpecificInsights(startDate, endDate);
    
  } catch (error) {
    console.error('Error generating Apr 14-20 engagement report:', error);
  }
}

/**
 * Get user engagement data for Apr 28 - May 4, 2025
 */
async function getApril28toMay4Engagement() {
  try {
    console.log('\n========== ENGAGEMENT REPORT: APR 28 - MAY 4, 2025 ==========\n');
    
    const startDate = '2025-04-28T00:00:00.000Z';
    const endDate = '2025-05-04T23:59:59.999Z';
    
    // Get all users with any engagement during this period
    const users = await getUsersWithAnyEngagement(startDate, endDate);
    
    console.log(`\nFound ${users.length} users with activity between Apr 28 - May 4, 2025`);
    
    if (users.length === 0) {
      console.log('No user engagement data found for this period.');
      return;
    }
    
    // Sort users by total time spent (descending)
    users.sort((a, b) => b.totalTimeSpent - a.totalTimeSpent);
    
    // Print user engagement table
    console.log('\nUser Engagement Details (sorted by time spent):');
    console.log('╔══════════════════════╦═════════════════╦════════════════════╦══════════════════════════════════════╗');
    console.log('║ User ID              ║ Email           ║ Total Time (mins)  ║ Track Breakdown                      ║');
    console.log('╠══════════════════════╬═════════════════╬════════════════════╬══════════════════════════════════════╣');
    
    users.forEach(user => {
      const timeInMinutes = (user.totalTimeSpent / 60).toFixed(1);
      
      // Format track engagement
      let trackBreakdown = 'N/A';
      if (user.trackEngagement) {
        trackBreakdown = Object.entries(user.trackEngagement)
          .map(([trackId, time]) => `${trackId}: ${(time / 60).toFixed(1)}m`)
          .join(', ');
      }
      
      // Trim track breakdown if too long
      const maxTrackLength = 40;
      if (trackBreakdown.length > maxTrackLength) {
        trackBreakdown = trackBreakdown.substring(0, maxTrackLength - 3) + '...';
      }
      
      console.log(`║ ${user.userId.padEnd(20)} ║ ${(user.email || 'N/A').padEnd(17)} ║ ${timeInMinutes.padStart(18)} ║ ${trackBreakdown.padEnd(38)} ║`);
    });
    
    console.log('╚══════════════════════╩═════════════════╩════════════════════╩══════════════════════════════════════╝');
    
    // Export to CSV with detailed track information
    exportDetailedUserListToCSV(users, 'user_engagement_apr28-may4_2025.csv');
    
    console.log('\nDetailed user engagement data exported to: user_engagement_apr28-may4_2025.csv');
    
    // Generate track-specific summary for this period
    await generateTrackSpecificInsights(startDate, endDate);
    
  } catch (error) {
    console.error('Error generating Apr 28 - May 4 engagement report:', error);
  }
}

/**
 * Generate track-specific engagement insights
 */
async function generateTrackSpecificInsights(startDate: string, endDate: string): Promise<void> {
  try {
    console.log('\nTrack-Specific Engagement Insights:');
    
    // Get all user IDs
    const userIds = await getAllUserIds();
    
    // Track engagement metrics
    const trackMetrics: Record<string, { users: number, sessions: number, totalTime: number }> = {};
    
    // For each user, get their activity in each track
    for (const userId of userIds) {
      // Get all tracks the user has sessions in
      const trackIds = await getUserTracks(userId);
      
      for (const trackId of trackIds) {
        try {
          // Query for sessions with this userId and trackId within the date range
          const result = await dynamoDB.send(new QueryCommand({
            TableName: SESSION_TABLE,
            IndexName: 'UserIdIndex',
            KeyConditionExpression: 'userId = :userId',
            FilterExpression: 'SK = :sk AND startTime BETWEEN :startDate AND :endDate',
            ExpressionAttributeValues: {
              ':userId': userId,
              ':sk': `SESSION#${trackId}`,
              ':startDate': startDate,
              ':endDate': endDate
            }
          }));
          
          if (result.Items && result.Items.length > 0) {
            // Initialize track metrics if not exists
            if (!trackMetrics[trackId]) {
              trackMetrics[trackId] = { users: 0, sessions: 0, totalTime: 0 };
            }
            
            // Count this user for this track
            trackMetrics[trackId].users++;
            
            // Add sessions and time
            trackMetrics[trackId].sessions += result.Items.length;
            result.Items.forEach(item => {
              if (item.totalDuration) {
                trackMetrics[trackId].totalTime += item.totalDuration;
              }
            });
          }
        } catch (error) {
          console.error(`Error getting track data for user ${userId} and track ${trackId}:`, error);
        }
      }
    }
    
    // Print track metrics table
    console.log('╔═════════╦══════════════╦══════════════╦═══════════════════╗');
    console.log('║ Track   ║ Active Users ║ # Sessions   ║ Total Time (mins) ║');
    console.log('╠═════════╬══════════════╬══════════════╬═══════════════════╣');
    
    Object.entries(trackMetrics)
      .sort(([trackA], [trackB]) => trackA.localeCompare(trackB))
      .forEach(([trackId, metrics]) => {
        const timeInMinutes = (metrics.totalTime / 60).toFixed(1);
        console.log(`║ ${trackId.padEnd(7)} ║ ${metrics.users.toString().padStart(12)} ║ ${metrics.sessions.toString().padStart(12)} ║ ${timeInMinutes.padStart(17)} ║`);
      });
    
    console.log('╚═════════╩══════════════╩══════════════╩═══════════════════╝');
    
    // Calculate average session time per track
    console.log('\nAverage Session Time per Track:');
    Object.entries(trackMetrics)
      .sort(([trackA], [trackB]) => trackA.localeCompare(trackB))
      .forEach(([trackId, metrics]) => {
        const avgTimePerSession = metrics.sessions > 0 ? metrics.totalTime / metrics.sessions : 0;
        const avgTimeInMinutes = (avgTimePerSession / 60).toFixed(1);
        console.log(`${trackId}: ${avgTimeInMinutes} minutes per session`);
      });
      
  } catch (error) {
    console.error('Error generating track-specific insights:', error);
  }
}

/**
 * Export user list to CSV file
 */
function exportUserListToCSV(users: ActiveUser[], filename: string): void {
  const header = 'User ID,Email,Total Time (seconds),Active (5+ min)\n';
  
  const rows = users.map(user => 
    `${user.userId},${user.email || 'N/A'},${user.totalTimeSpent},${user.isActive ? 'Yes' : 'No'}`
  ).join('\n');
  
  fs.writeFileSync(filename, header + rows);
}

/**
 * Export detailed user engagement list to CSV file with track breakdown
 */
function exportDetailedUserListToCSV(users: ActiveUser[], filename: string): void {
  // Get all unique track IDs across all users
  const allTrackIds = new Set<string>();
  
  users.forEach(user => {
    if (user.trackEngagement) {
      Object.keys(user.trackEngagement).forEach(trackId => {
        allTrackIds.add(trackId);
      });
    }
  });
  
  const trackIds = Array.from(allTrackIds).sort();
  
  // Create header with dynamic track columns
  let header = 'User ID,Email,Total Time (seconds),Active (5+ min)';
  trackIds.forEach(trackId => {
    header += `,${trackId} Time (seconds)`;
  });
  header += '\n';
  
  // Create rows with track-specific time data
  const rows = users.map(user => {
    let row = `${user.userId},${user.email || 'N/A'},${user.totalTimeSpent},${user.isActive ? 'Yes' : 'No'}`;
    
    // Add time for each track
    trackIds.forEach(trackId => {
      const timeSpent = user.trackEngagement && user.trackEngagement[trackId] ? user.trackEngagement[trackId] : 0;
      row += `,${timeSpent}`;
    });
    
    return row;
  }).join('\n');
  
  fs.writeFileSync(filename, header + rows);
}

/**
 * Calculate percent change between two values
 */
function calculatePercentChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue > 0 ? 100 : 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

// Execute the new function to get Apr 28 - May 4 engagement
getApril28toMay4Engagement().catch(error => {
  console.error('Script execution failed:', error);
}); 