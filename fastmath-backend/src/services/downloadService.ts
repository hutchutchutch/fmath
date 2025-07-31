import { dynamoDB } from '../config/aws';
import { ScanCommand, ScanCommandOutput } from '@aws-sdk/lib-dynamodb';
import sessionAnalyticsService from './sessionAnalyticsService';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Service for generating downloadable data exports
 */
export class DownloadService {
  /**
   * Get all users for CSV download
   * @returns Array of user data with selected fields
   */
  static async getAllUsersForDownload() {
    try {
      let lastEvaluatedKey: Record<string, any> | undefined = undefined;
      const allUsers: any[] = [];
      
      // Paginated scan to ensure we get all users
      do {
        const result: ScanCommandOutput = await dynamoDB.send(new ScanCommand({
          TableName: 'FastMath2',
          FilterExpression: 'begins_with(PK, :userPrefix) AND SK = :profileValue',
          ExpressionAttributeValues: {
            ':userPrefix': 'USER#',
            ':profileValue': 'PROFILE'
          },
          ExclusiveStartKey: lastEvaluatedKey,
          // Set a reasonable limit to avoid throughput issues
          Limit: 100
        }));
        
        if (result.Items && result.Items.length > 0) {
          allUsers.push(...result.Items);
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      console.log(`Downloaded ${allUsers.length} users in total`);
      
      // Format the users for download
      return allUsers.map(user => {
        return {
          userId: user.userId,
          email: user.email,
          name: user.name || '',
          ageGrade: user.ageGrade || '',
          focusTrack: user.focusTrack || 'TRACK1',
          createdAt: user.created,
          updatedAt: user.lastActive
        };
      });
    } catch (error) {
      console.error('Error getting users for download:', error);
      throw error;
    }
  }

  /**
   * Get all sessions within a date range for CSV download
   * @param startDate ISO string for start date
   * @param endDate ISO string for end date
   * @returns Array of session data with relevant fields
   */
  static async getSessionsForDownload(startDate: string, endDate: string) {
    try {
      // Use the GSI to scan all sessions
      let lastEvaluatedKey: Record<string, any> | undefined = undefined;
      const allSessions: any[] = [];
      
      // Parse the date range - make end date inclusive of full day
      const startTimestamp = new Date(startDate).toISOString();
      const endDatePlusOne = new Date(endDate);
      endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
      const endTimestamp = endDatePlusOne.toISOString();
      
      // Paginated scan to get all sessions within the date range
      do {
        const result: ScanCommandOutput = await dynamoDB.send(new ScanCommand({
          TableName: 'FastMath2',
          FilterExpression: 'SK = :sessionValue AND startTime BETWEEN :startDate AND :endDate',
          ExpressionAttributeValues: {
            ':sessionValue': 'SESSION',
            ':startDate': startTimestamp,
            ':endDate': endTimestamp
          },
          ExclusiveStartKey: lastEvaluatedKey,
          // Set a reasonable limit to avoid throughput issues
          Limit: 100
        }));
        
        if (result.Items && result.Items.length > 0) {
          allSessions.push(...result.Items);
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      console.log(`Downloaded ${allSessions.length} sessions in total for date range ${startDate} to ${endDate} (${startTimestamp} to ${endTimestamp})`);
      
      // Format the sessions for download, including key metrics
      return allSessions.map(session => {
        return {
          userId: session.userId,
          sessionId: session.sessionId,
          trackId: session.trackId,
          startTime: session.startTime,
          endTime: session.endTime,
          totalDuration: session.totalDuration,
          learningTime: session.learningTime,
          accuracyPracticeTime: session.accuracyPracticeTime,
          fluency6PracticeTime: session.fluency6PracticeTime || 0,
          fluency3PracticeTime: session.fluency3PracticeTime || 0,
          fluency2PracticeTime: session.fluency2PracticeTime || 0,
          fluency1_5PracticeTime: session.fluency1_5PracticeTime || 0,
          fluency1PracticeTime: session.fluency1PracticeTime || 0,
          assessmentTime: session.assessmentTime,
          otherTime: session.otherTime,
          // Count facts covered per activity type
          learningFactsCount: session.factsCovered?.learning?.length || 0,
          accuracyFactsCount: session.factsCovered?.accuracyPractice?.length || 0,
          fluency6FactsCount: session.factsCovered?.fluency6Practice?.length || 0,
          fluency3FactsCount: session.factsCovered?.fluency3Practice?.length || 0,
          fluency2FactsCount: session.factsCovered?.fluency2Practice?.length || 0,
          fluency1_5FactsCount: session.factsCovered?.fluency1_5Practice?.length || 0,
          fluency1FactsCount: session.factsCovered?.fluency1Practice?.length || 0,
          // Session XP and performance metrics
          sessionXP: session.sessionXP || 0,
          // Waste time metrics - extract individual activity waste data
          learningWasteTime: session.wasteTimeMetrics?.learning?.waste || 0,
          learningActiveTime: session.wasteTimeMetrics?.learning?.active || 0,
          accuracyPracticeWasteTime: session.wasteTimeMetrics?.accuracyPractice?.waste || 0,
          accuracyPracticeActiveTime: session.wasteTimeMetrics?.accuracyPractice?.active || 0,
          fluency6PracticeWasteTime: session.wasteTimeMetrics?.fluency6Practice?.waste || 0,
          fluency6PracticeActiveTime: session.wasteTimeMetrics?.fluency6Practice?.active || 0,
          fluency3PracticeWasteTime: session.wasteTimeMetrics?.fluency3Practice?.waste || 0,
          fluency3PracticeActiveTime: session.wasteTimeMetrics?.fluency3Practice?.active || 0,
          fluency2PracticeWasteTime: session.wasteTimeMetrics?.fluency2Practice?.waste || 0,
          fluency2PracticeActiveTime: session.wasteTimeMetrics?.fluency2Practice?.active || 0,
          fluency1_5PracticeWasteTime: session.wasteTimeMetrics?.fluency1_5Practice?.waste || 0,
          fluency1_5PracticeActiveTime: session.wasteTimeMetrics?.fluency1_5Practice?.active || 0,
          fluency1PracticeWasteTime: session.wasteTimeMetrics?.fluency1Practice?.waste || 0,
          fluency1PracticeActiveTime: session.wasteTimeMetrics?.fluency1Practice?.active || 0,
          assessmentWasteTime: session.wasteTimeMetrics?.assessment?.waste || 0,
          assessmentActiveTime: session.wasteTimeMetrics?.assessment?.active || 0,
          otherWasteTime: session.wasteTimeMetrics?.other?.waste || 0,
          otherActiveTime: session.wasteTimeMetrics?.other?.active || 0
        };
      });
    } catch (error) {
      console.error('Error getting sessions for download:', error);
      throw error;
    }
  }

  /**
   * Get all daily goals within a date range for CSV download
   * @param startDate ISO string for start date in YYYY-MM-DD format
   * @param endDate ISO string for end date in YYYY-MM-DD format
   * @returns Array of daily goals data with relevant fields
   */
  static async getDailyGoalsForDownload(startDate: string, endDate: string) {
    try {
      let lastEvaluatedKey: Record<string, any> | undefined = undefined;
      const allGoals: any[] = [];
      
      // Parse the date range
      const startTimestamp = startDate;
      const endTimestamp = endDate;
      
      // Paginated scan to get all goals within the date range
      do {
        const result: ScanCommandOutput = await dynamoDB.send(new ScanCommand({
          TableName: 'FastMath2',
          FilterExpression: 'begins_with(SK, :goalsPrefix) AND #date BETWEEN :startDate AND :endDate',
          ExpressionAttributeNames: {
            '#date': 'date'
          },
          ExpressionAttributeValues: {
            ':goalsPrefix': 'GOALS#',
            ':startDate': startTimestamp,
            ':endDate': endTimestamp
          },
          ExclusiveStartKey: lastEvaluatedKey,
          // Set a reasonable limit to avoid throughput issues
          Limit: 100
        }));
        
        if (result.Items && result.Items.length > 0) {
          allGoals.push(...result.Items);
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      console.log(`Downloaded ${allGoals.length} daily goals in total for date range ${startDate} to ${endDate}`);
      
      // Format the goals for download
      return allGoals.map(goalRecord => {
        const goalTypes = goalRecord.goals ? Object.keys(goalRecord.goals) : [];
        
        return {
          userId: goalRecord.userId,
          date: goalRecord.date,
          trackId: goalRecord.trackId,
          allCompleted: goalRecord.allCompleted,
          // Goal types and their counts
          learningGoal: goalRecord.goals?.learning?.total || 0,
          learningCompleted: goalRecord.goals?.learning?.completed || 0,
          accuracyGoal: goalRecord.goals?.accuracy?.total || 0,
          accuracyCompleted: goalRecord.goals?.accuracy?.completed || 0,
          fluencyGoal: goalRecord.goals?.fluency?.total || 0,
          fluencyCompleted: goalRecord.goals?.fluency?.completed || 0,
          assessmentGoal: goalRecord.goals?.assessment?.total || 0,
          assessmentCompleted: goalRecord.goals?.assessment?.completed || 0,
          // Metadata
          goalTypes: goalTypes.join(','),
          createdAt: goalRecord.createdAt,
          updatedAt: goalRecord.updatedAt
        };
      });
    } catch (error) {
      console.error('Error getting daily goals for download:', error);
      throw error;
    }
  }

  /**
   * Get user progress data across all tracks for CSV download
   * @param userId Optional user ID to filter by; if not provided, retrieves progress for all users
   * @returns Array of user progress data with relevant fields
   */
  static async getUserProgressForDownload(userId?: string) {
    try {
      const allProgress: any[] = [];
      
      if (userId) {
        // If userId is provided, only get progress for that user
        const result = await dynamoDB.send(new QueryCommand({
          TableName: 'FastMath2',
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': 'PROGRESS#'
          }
        }));
        
        if (result.Items && result.Items.length > 0) {
          allProgress.push(...result.Items);
        }
      } else {
        // If no userId is provided, scan for all user progress
        let lastEvaluatedKey: Record<string, any> | undefined = undefined;
        
        do {
          const result: ScanCommandOutput = await dynamoDB.send(new ScanCommand({
            TableName: 'FastMath2',
            FilterExpression: 'begins_with(SK, :progressPrefix)',
            ExpressionAttributeValues: {
              ':progressPrefix': 'PROGRESS#'
            },
            ExclusiveStartKey: lastEvaluatedKey,
            // Set a reasonable limit to avoid throughput issues
            Limit: 100
          }));
          
          if (result.Items && result.Items.length > 0) {
            allProgress.push(...result.Items);
          }
          
          lastEvaluatedKey = result.LastEvaluatedKey;
        } while (lastEvaluatedKey);
      }
      
      console.log(`Downloaded ${allProgress.length} progress records${userId ? ` for user ${userId}` : ''}`);
      
      // Format the progress data for download
      return allProgress.map(progress => {
        // Extract user ID from the PK
        const userIdMatch = progress.PK.match(/USER#(.*)/);
        const userIdFromPK = userIdMatch ? userIdMatch[1] : '';
        
        // Extract track ID from the SK
        const trackIdMatch = progress.SK.match(/PROGRESS#(.*)/);
        const trackId = trackIdMatch ? trackIdMatch[1] : '';
        
        // Calculate overall statistics
        const factStatuses: Record<string, number> = Object.values(progress.facts || {}).reduce((acc: Record<string, number>, fact: any) => {
          if (fact.status) {
            acc[fact.status] = (acc[fact.status] || 0) + 1;
          }
          return acc;
        }, {});
        
        const totalFacts = Object.keys(progress.facts || {}).length;
        
        // Calculate today's stats across all facts
        let todayDate = '';
        let todayTotalAttempts = 0;
        let todayCorrectAttempts = 0;
        let factsWithResponseTimes = 0;
        let sumAvgResponseTimes = 0;
        
        Object.values(progress.facts || {}).forEach((fact: any) => {
          if (fact.todayStats) {
            if (!todayDate && fact.todayStats.date) {
              todayDate = fact.todayStats.date;
            }
            todayTotalAttempts += fact.todayStats.attempts || 0;
            todayCorrectAttempts += fact.todayStats.correct || 0;
            
            if (fact.todayStats.avgResponseTime !== undefined) {
              sumAvgResponseTimes += fact.todayStats.avgResponseTime;
              factsWithResponseTimes++;
            }
          }
        });
        
        // Calculate average response time across facts that have response times
        const todayAvgResponseTime = factsWithResponseTimes > 0 
          ? sumAvgResponseTimes / factsWithResponseTimes 
          : undefined;
        
        return {
          userId: progress.userId || userIdFromPK,
          trackId: progress.trackId || trackId,
          startDate: progress.startDate,
          lastUpdated: progress.lastUpdated,
          status: progress.status,
          overallCQPM: progress.overallCQPM,
          accuracyRate: progress.accuracyRate,
          totalFacts,
          // Count facts by status
          notStartedCount: factStatuses.notStarted || 0,
          learningCount: factStatuses.learning || 0,
          accuracyPracticeCount: factStatuses.accuracyPractice || 0,
          fluency6PracticeCount: factStatuses.fluency6Practice || 0,
          fluency3PracticeCount: factStatuses.fluency3Practice || 0,
          fluency2PracticeCount: factStatuses.fluency2Practice || 0,
          fluency1_5PracticeCount: factStatuses.fluency1_5Practice || 0,
          fluency1PracticeCount: factStatuses.fluency1Practice || 0,
          masteredCount: factStatuses.mastered || 0,
          automaticCount: factStatuses.automatic || 0,
          // Calculate completion percentage
          completionPercentage: totalFacts > 0 
            ? (((factStatuses.mastered || 0) + (factStatuses.automatic || 0)) / totalFacts) * 100 
            : 0,
          // Today's statistics
          todayDate,
          todayTotalAttempts,
          todayCorrectAttempts,
          todayAccuracyRate: todayTotalAttempts > 0 
            ? (todayCorrectAttempts / todayTotalAttempts) * 100 
            : 0,
          todayAvgResponseTime: todayAvgResponseTime !== undefined 
            ? todayAvgResponseTime 
            : null
        };
      });
    } catch (error) {
      console.error('Error getting user progress for download:', error);
      throw error;
    }
  }

  /**
   * Get all progress assessments within a date range for CSV download
   * @param startDate ISO string for start date in YYYY-MM-DD format
   * @param endDate ISO string for end date in YYYY-MM-DD format
   * @returns Array of progress assessment data with relevant fields
   */
  static async getProgressAssessmentsForDownload(startDate: string, endDate: string) {
    try {
      let lastEvaluatedKey: Record<string, any> | undefined = undefined;
      const allAssessments: any[] = [];
      
      // Parse the date range - make end date inclusive of full day
      const startTimestamp = new Date(startDate).toISOString();
      const endDatePlusOne = new Date(endDate);
      endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
      const endTimestamp = endDatePlusOne.toISOString();
      
      // Paginated scan to get all progress assessments within the date range
      do {
        const result: ScanCommandOutput = await dynamoDB.send(new ScanCommand({
          TableName: 'FastMath2',
          FilterExpression: 'begins_with(SK, :assessmentPrefix) AND startDate BETWEEN :startDate AND :endDate',
          ExpressionAttributeValues: {
            ':assessmentPrefix': 'PROGRESSASSESSMENT#',
            ':startDate': startTimestamp,
            ':endDate': endTimestamp
          },
          ExclusiveStartKey: lastEvaluatedKey,
          // Set a reasonable limit to avoid throughput issues
          Limit: 100
        }));
        
        if (result.Items && result.Items.length > 0) {
          allAssessments.push(...result.Items);
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      console.log(`Downloaded ${allAssessments.length} progress assessments in total for date range ${startDate} to ${endDate} (${startTimestamp} to ${endTimestamp})`);
      
      // Format the assessments for download
      return allAssessments.map(assessment => {
        // Calculate aggregated stats from facts
        const facts = assessment.facts || {};
        const factValues = Object.values(facts);
        
        const totalFacts = factValues.length;
        const totalAttempts = factValues.reduce((sum: number, fact: any) => sum + (fact.attempts || 0), 0);
        const totalCorrect = factValues.reduce((sum: number, fact: any) => sum + (fact.correct || 0), 0);
        const totalTimeSpent = factValues.reduce((sum: number, fact: any) => sum + (fact.timeSpent || 0), 0);
        
        // Extract user ID from PK
        const userIdMatch = assessment.PK.match(/USER#(.*)/);
        const userId = userIdMatch ? userIdMatch[1] : '';
        
        return {
          userId: userId,
          assessmentId: assessment.assessmentId,
          trackId: assessment.trackId,
          startDate: assessment.startDate,
          lastUpdated: assessment.lastUpdated,
          status: assessment.status,
          overallCQPM: assessment.overallCQPM || 0,
          accuracyRate: assessment.accuracyRate || 0,
          duration: assessment.duration || 0,
          totalFacts,
          totalAttempts,
          totalCorrect,
          totalTimeSpent
        };
      });
    } catch (error) {
      console.error('Error getting progress assessments for download:', error);
      throw error;
    }
  }
} 