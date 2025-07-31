import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { FactStatus, UserProgress } from '../types/progress';
import { 
  GradeErrorFactor, 
  StageTimeParameters, 
  TimeEstimationResponse,
  FactStatusCounts
} from '../types/timeEstimation';
import { TRACK_LENGTHS, TRACK_RANGES } from '../types/constants';
import { SessionAnalyticsQueryParams } from '../types/sessionAnalytics';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});
const TABLE_NAME = 'FastMath2';

// Default time parameters for each stage (in seconds per repetition)
const DEFAULT_STAGE_TIMES: StageTimeParameters = {
  learning: 28,
  accuracyPractice: 32,
  fluency6Practice: 23,
  fluency3Practice: 15,
  fluency2Practice: 22,
  fluency1_5Practice: 27,
  fluency1Practice: 30,
  mastered: 3 // For retention
};

// Grade-specific parameters
const GRADE_PARAMETERS: Record<string, GradeErrorFactor> = {
  // Grades 1-3
  'elementary': {
    errorFactor: 1.2 // 20% re-attempts
  },
  // Grades 4-6
  'middle': {
    errorFactor: 1.1 // 10% re-attempts
  },
  // Grades 7-12
  'high': {
    errorFactor: 1.0 // No error factor
  }
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
    return 12; // Default to grade 12 if error
  }
}

// Helper function to get grade parameter category
function getGradeParameterCategory(grade: number): string {
  if (grade >= 1 && grade <= 3) {
    return 'elementary';
  } else if (grade >= 4 && grade <= 6) {
    return 'middle';
  } else {
    return 'high';
  }
}

// Helper function to get user progress for a specific track
async function getUserProgress(userId: string, trackId: string): Promise<UserProgress | null> {
  try {
    const result = await dynamoDB.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'PROGRESS#'
      }
    }));

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    // Find the progress for the specified track
    const trackProgress = result.Items.find(item => item.trackId === trackId) as UserProgress;
    
    return trackProgress || null;
  } catch (error) {
    console.error('Error getting user progress:', error);
    return null;
  }
}

// Helper function to get track length with type safety
function getTrackLength(trackId: string): number {
  if (!(trackId in TRACK_LENGTHS)) {
    throw new Error(`Track ${trackId} not found`);
  }
  
  return TRACK_LENGTHS[trackId as keyof typeof TRACK_LENGTHS];
}

// Count facts by status using track ranges
function countFactsByStatus(progress: UserProgress | null, trackId: string): FactStatusCounts {
  const counts: FactStatusCounts = {
    notStarted: 0,
    learning: 0,
    accuracyPractice: 0,
    fluency6Practice: 0,
    fluency3Practice: 0,
    fluency2Practice: 0,
    fluency1_5Practice: 0,
    fluency1Practice: 0,
    mastered: 0,
    automatic: 0
  };

  // Get the track length from constants
  const trackLength = getTrackLength(trackId);
  
  // If no progress, all facts are not started
  if (!progress) {
    counts.notStarted = trackLength;
    return counts;
  }

  // Get the track range to determine which facts should exist
  if (!(trackId in TRACK_RANGES)) {
    throw new Error(`Track ${trackId} not found in TRACK_RANGES`);
  }
  
  const [startId, endId] = TRACK_RANGES[trackId as keyof typeof TRACK_RANGES];
  
  // Create a set of all fact IDs that should exist in this track
  const expectedFactIds = new Set<string>();
  for (let i = startId; i <= endId; i++) {
    // Add both formats: with and without "FACT" prefix
    expectedFactIds.add(i.toString());
    expectedFactIds.add(`FACT${i}`);
  }
  
  // Count facts by status from the progress data
  if (progress.facts) {
    // Track which numeric IDs have been processed to avoid double counting
    const processedNumericIds = new Set<number>();
    
    // Count facts by status
    Object.entries(progress.facts).forEach(([factId, fact]) => {
      // Only count facts that are in the expected range
      if (expectedFactIds.has(factId)) {
        // Extract the numeric part if it has a "FACT" prefix
        const numericId = factId.startsWith('FACT') 
          ? parseInt(factId.substring(4)) 
          : parseInt(factId);
        
        // Only process each numeric ID once
        if (!processedNumericIds.has(numericId)) {
          counts[fact.status]++;
          processedNumericIds.add(numericId);
          
          // Remove both formats of this ID from the expected set
          expectedFactIds.delete(numericId.toString());
          expectedFactIds.delete(`FACT${numericId}`);
        }
      }
    });
  }
  
  // Any remaining facts in the expected set are not started
  // Divide by 2 because we added each ID twice (with and without "FACT" prefix)
  counts.notStarted = Math.round(expectedFactIds.size / 2);
  
  return counts;
}

// Check if user is an existing user with sufficient data
async function isExistingUser(userId: string, trackId: string): Promise<boolean> {
  try {
    // Import the session analytics service directly
    const sessionAnalyticsService = await import('../services/sessionAnalyticsService');
    
    // Query for sessions with this userId and trackId
    const queryParams = {
      TableName: TABLE_NAME,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':sk': `SESSION#${trackId}`
      }
    };
    
    const result = await dynamoDB.send(new QueryCommand(queryParams));
    
    // Consider user existing if they have at least 10 sessions
    return (result.Items?.length || 0) >= 10;
  } catch (error) {
    console.error('Error checking if user is existing:', error);
    return false;
  }
}

// Get user's actual time data from session analytics
async function getUserTimeData(userId: string, trackId: string): Promise<Partial<StageTimeParameters>> {
  try {
    // Import the session analytics service directly
    const sessionAnalyticsService = await import('../services/sessionAnalyticsService');
    
    // Call the service's getSessionAnalytics method with the user's ID and track ID
    const analyticsData = await sessionAnalyticsService.default.getSessionAnalytics({
      userId,
      trackId
    });
    
    // Check if we got valid data with averageTimePerIteration
    if (!analyticsData || !analyticsData.averageTimePerIteration) {
      return {};
    }
    
    // Filter out any zero or negative values to ensure we only return positive times
    const filteredTimeData: Partial<StageTimeParameters> = {};
    
    if (analyticsData.averageTimePerIteration) {
      // Only include positive values
      Object.entries(analyticsData.averageTimePerIteration).forEach(([stage, time]) => {
        if (time && time > 0) {
          filteredTimeData[stage as keyof StageTimeParameters] = time;
        }
      });
    }
    
    return filteredTimeData;
  } catch (error) {
    console.error('Error getting user time data:', error);
    return {};
  }
}

// Calculate time needed for a fact in a specific status
function calculateTimeForFactStatus(
  status: FactStatus, 
  gradeParams: GradeErrorFactor,
  stageTimes: StageTimeParameters
): number {
  let totalSeconds = 0;

  // For facts that are not started, calculate time for the full journey
  if (status === 'notStarted') {
    // Learning stage
    totalSeconds += stageTimes.learning;
    
    // Accuracy practice stage
    totalSeconds += stageTimes.accuracyPractice;
    
    // All fluency stages
    totalSeconds += stageTimes.fluency6Practice;
    totalSeconds += stageTimes.fluency3Practice;
    totalSeconds += stageTimes.fluency2Practice;
    totalSeconds += stageTimes.fluency1_5Practice;
    totalSeconds += stageTimes.fluency1Practice;
    
    // Retention/mastery stage
    totalSeconds += stageTimes.mastered;
    
    return totalSeconds;
  }

  // For facts in progress, calculate remaining time based on current status
  switch (status) {
    case 'learning':
      // Still need accuracy practice and all fluency stages
      totalSeconds += stageTimes.accuracyPractice;
      totalSeconds += stageTimes.fluency6Practice;
      totalSeconds += stageTimes.fluency3Practice;
      totalSeconds += stageTimes.fluency2Practice;
      totalSeconds += stageTimes.fluency1_5Practice;
      totalSeconds += stageTimes.fluency1Practice;
      totalSeconds += stageTimes.mastered;
      break;
      
    case 'accuracyPractice':
      // Need all fluency stages
      totalSeconds += stageTimes.fluency6Practice;
      totalSeconds += stageTimes.fluency3Practice;
      totalSeconds += stageTimes.fluency2Practice;
      totalSeconds += stageTimes.fluency1_5Practice;
      totalSeconds += stageTimes.fluency1Practice;
      totalSeconds += stageTimes.mastered;
      break;
      
    case 'fluency6Practice':
      // Need remaining fluency stages
      totalSeconds += stageTimes.fluency3Practice;
      totalSeconds += stageTimes.fluency2Practice;
      totalSeconds += stageTimes.fluency1_5Practice;
      totalSeconds += stageTimes.fluency1Practice;
      totalSeconds += stageTimes.mastered;
      break;
      
    case 'fluency3Practice':
      // Need remaining fluency stages
      totalSeconds += stageTimes.fluency2Practice;
      totalSeconds += stageTimes.fluency1_5Practice;
      totalSeconds += stageTimes.fluency1Practice;
      totalSeconds += stageTimes.mastered;
      break;
      
    case 'fluency2Practice':
      // Need remaining fluency stages
      totalSeconds += stageTimes.fluency1_5Practice;
      totalSeconds += stageTimes.fluency1Practice;
      totalSeconds += stageTimes.mastered;
      break;
      
    case 'fluency1_5Practice':
      // Need final fluency stage
      totalSeconds += stageTimes.fluency1Practice;
      totalSeconds += stageTimes.mastered;
      break;
      
    case 'fluency1Practice':
      // Just need retention/mastery
      totalSeconds += stageTimes.mastered;
      break;
      
    case 'mastered':
      // Some retention practice may still be needed
      totalSeconds += stageTimes.mastered / 2;
      break;
      
    case 'automatic':
      // Fully mastered, no additional time needed
      totalSeconds = 0;
      break;
  }
  
  return totalSeconds;
}

// Main function to calculate time to completion
export const calculateTimeToCompletion = async (
  userId: string, 
  trackId: string
): Promise<TimeEstimationResponse> => {
  try {
    // Get user's grade level
    const grade = await getUserGrade(userId);
    
    // Get grade-specific parameters
    const gradeCategory = getGradeParameterCategory(grade);
    const gradeParams = GRADE_PARAMETERS[gradeCategory];
    
    // Get user's progress for the track
    const progress = await getUserProgress(userId, trackId);
    
    // Count facts by status
    const factCounts = countFactsByStatus(progress, trackId);
    
    // Check if user is an existing user
    const isExisting = await isExistingUser(userId, trackId);
    
    // Initialize with default stage times
    let stageTimes = { ...DEFAULT_STAGE_TIMES };
    
    // For existing users, use actual time data where available
    if (isExisting) {
      // Get user's actual time data
      const userTimeData = await getUserTimeData(userId, trackId);
      
      // Merge user's actual time data with defaults (only replacing values that are > 0)
      if (userTimeData) {
        // Create a new stageTimes object with user data that's greater than 0
        const mergedStageTimes: StageTimeParameters = { ...stageTimes };
        
        // Only use user values when they're greater than 0
        Object.entries(userTimeData).forEach(([stage, time]) => {
          if (time && time > 0) {
            mergedStageTimes[stage as keyof StageTimeParameters] = time;
          }
        });
        
        stageTimes = mergedStageTimes;
      }
    }
    
    // Calculate total time needed
    let totalSeconds = 0;
    
    // For each fact status, calculate time needed
    Object.entries(factCounts).forEach(([status, count]) => {
      if (count > 0) {
        const timeForStatus = calculateTimeForFactStatus(
          status as FactStatus,
          gradeParams,
          stageTimes
        );
        
        totalSeconds += timeForStatus * count;
      }
    });
    
    // Apply error factor only for new users
    if (!isExisting) {
      totalSeconds *= gradeParams.errorFactor;
    }
    
    // Convert to minutes
    const totalMinutes = Math.ceil(totalSeconds / 60);
    
    return { totalMinutes };
  } catch (error) {
    console.error('Error calculating time to completion:', error);
    throw error;
  }
}; 