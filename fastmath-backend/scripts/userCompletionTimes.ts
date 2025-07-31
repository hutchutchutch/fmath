import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import * as fs from 'fs';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

const TABLE_NAME = 'FastMath2';

// Function to calculate percentiles from an array of numbers
function calculatePercentiles(values: number[]): { p25: number; p50: number; p75: number } {
  if (values.length === 0) return { p25: 0, p50: 0, p75: 0 };
  
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  
  const p25Index = Math.ceil(n * 0.25) - 1;
  const p50Index = Math.ceil(n * 0.50) - 1;
  const p75Index = Math.ceil(n * 0.75) - 1;
  
  return {
    p25: sorted[Math.max(0, p25Index)],
    p50: sorted[Math.max(0, p50Index)],
    p75: sorted[Math.max(0, p75Index)]
  };
}

// Filter function to exclude test users (reused from adminService.ts)
function isTestUser(email: string): boolean {
  const lowercaseEmail = (email || '').toLowerCase();
  return lowercaseEmail.includes('test') || 
         lowercaseEmail.includes('admin') || 
         lowercaseEmail.endsWith('@trilogy.com');
}

// Get all users from the database
async function getAllUsers(): Promise<any[]> {
  const users: any[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;
  
  try {
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
    
    // Filter out test users
    return users.filter(user => !isTestUser(user.email));
  } catch (error) {
    console.error('Error getting users:', error);
    return [];
  }
}

// Collect individual fact times for all statuses
function collectAllFactTimes(userId: string, trackId: string): Promise<Record<string, number[]>> {
  return new Promise(async (resolve) => {
    try {
      // Query for sessions for this user and track
      const result = await dynamoDB.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':sk': `SESSION#${trackId}`
        }
      }));

      if (!result.Items || result.Items.length === 0) {
        resolve({});
        return;
      }

      // Initialize arrays for each status
      const statusTimes = {
        learning: [] as number[],
        accuracyPractice: [] as number[],
        fluency6Practice: [] as number[],
        fluency3Practice: [] as number[],
        fluency2Practice: [] as number[],
        fluency1_5Practice: [] as number[],
        fluency1Practice: [] as number[]
      };

      // Process all sessions to collect individual fact times for each status
      result.Items.forEach((session: any) => {
        // Learning times
        if (session.factsCovered?.learning && Array.isArray(session.factsCovered.learning)) {
          const sessionTime = session.learningTime || 0;
          const factsCount = session.factsCovered.learning.length;
          if (factsCount > 0 && sessionTime > 0) {
            const timePerFact = sessionTime / factsCount;
            for (let i = 0; i < factsCount; i++) {
              statusTimes.learning.push(timePerFact);
            }
          }
        }

        // Accuracy Practice times
        if (session.factsCovered?.accuracyPractice && Array.isArray(session.factsCovered.accuracyPractice)) {
          const sessionTime = session.accuracyPracticeTime || 0;
          const factsCount = session.factsCovered.accuracyPractice.length;
          if (factsCount > 0 && sessionTime > 0) {
            const timePerFact = sessionTime / factsCount;
            for (let i = 0; i < factsCount; i++) {
              statusTimes.accuracyPractice.push(timePerFact);
            }
          }
        }

        // Fluency 6s Practice times
        if (session.factsCovered?.fluency6Practice && Array.isArray(session.factsCovered.fluency6Practice)) {
          const sessionTime = session.fluency6PracticeTime || 0;
          const factsCount = session.factsCovered.fluency6Practice.length;
          if (factsCount > 0 && sessionTime > 0) {
            const timePerFact = sessionTime / factsCount;
            for (let i = 0; i < factsCount; i++) {
              statusTimes.fluency6Practice.push(timePerFact);
            }
          }
        }

        // Fluency 3s Practice times
        if (session.factsCovered?.fluency3Practice && Array.isArray(session.factsCovered.fluency3Practice)) {
          const sessionTime = session.fluency3PracticeTime || 0;
          const factsCount = session.factsCovered.fluency3Practice.length;
          if (factsCount > 0 && sessionTime > 0) {
            const timePerFact = sessionTime / factsCount;
            for (let i = 0; i < factsCount; i++) {
              statusTimes.fluency3Practice.push(timePerFact);
            }
          }
        }

        // Fluency 2s Practice times
        if (session.factsCovered?.fluency2Practice && Array.isArray(session.factsCovered.fluency2Practice)) {
          const sessionTime = session.fluency2PracticeTime || 0;
          const factsCount = session.factsCovered.fluency2Practice.length;
          if (factsCount > 0 && sessionTime > 0) {
            const timePerFact = sessionTime / factsCount;
            for (let i = 0; i < factsCount; i++) {
              statusTimes.fluency2Practice.push(timePerFact);
            }
          }
        }

        // Fluency 1.5s Practice times
        if (session.factsCovered?.fluency1_5Practice && Array.isArray(session.factsCovered.fluency1_5Practice)) {
          const sessionTime = session.fluency1_5PracticeTime || 0;
          const factsCount = session.factsCovered.fluency1_5Practice.length;
          if (factsCount > 0 && sessionTime > 0) {
            const timePerFact = sessionTime / factsCount;
            for (let i = 0; i < factsCount; i++) {
              statusTimes.fluency1_5Practice.push(timePerFact);
            }
          }
        }

        // Fluency 1s Practice times
        if (session.factsCovered?.fluency1Practice && Array.isArray(session.factsCovered.fluency1Practice)) {
          const sessionTime = session.fluency1PracticeTime || 0;
          const factsCount = session.factsCovered.fluency1Practice.length;
          if (factsCount > 0 && sessionTime > 0) {
            const timePerFact = sessionTime / factsCount;
            for (let i = 0; i < factsCount; i++) {
              statusTimes.fluency1Practice.push(timePerFact);
            }
          }
        }
      });

      resolve(statusTimes);
    } catch (error) {
      console.error(`Error collecting fact times for user ${userId} and track ${trackId}:`, error);
      resolve({});
    }
  });
}


// Main function to run the script
async function main() {
  try {
    console.log('Collecting fact times for all statuses by grade...');
    
    // Get all non-test users
    const users = await getAllUsers();
    console.log(`Found ${users.length} non-test users`);

    // Tracks to analyze
    const tracksToAnalyze = ['TRACK5', 'TRACK6', 'TRACK7', 'TRACK8'];
    
    // Collect all times by grade and status
    const timesByGradeAndStatus: Record<string, Record<string, number[]>> = {};

    // Process each user
    for (const user of users) {
      const userId = user.PK.replace('USER#', '');
      const userGrade = user.ageGrade || 'Unknown';
      const gradeKey = `Grade ${userGrade}`;
      
      console.log(`Processing user ${userId} (${gradeKey})...`);
      
      // Initialize grade data structure if not exists
      if (!timesByGradeAndStatus[gradeKey]) {
        timesByGradeAndStatus[gradeKey] = {
          learning: [],
          accuracyPractice: [],
          fluency6Practice: [],
          fluency3Practice: [],
          fluency2Practice: [],
          fluency1_5Practice: [],
          fluency1Practice: []
        };
      }
      
      // Process each track for this user
      for (const trackId of tracksToAnalyze) {
        const userTimes = await collectAllFactTimes(userId, trackId);
        
        // Add times to the corresponding grade and status arrays
        Object.keys(userTimes).forEach(status => {
          if (userTimes[status] && userTimes[status].length > 0) {
            timesByGradeAndStatus[gradeKey][status].push(...userTimes[status]);
          }
        });
      }
    }

    console.log('\n=== FACT STATUS TIME PERCENTILES BY GRADE ===');
    
    // Status display names
    const statusNames = {
      learning: 'Learning',
      accuracyPractice: 'Accuracy Practice',
      fluency6Practice: 'Fluency 6s Practice',
      fluency3Practice: 'Fluency 3s Practice',
      fluency2Practice: 'Fluency 2s Practice',
      fluency1_5Practice: 'Fluency 1.5s Practice',
      fluency1Practice: 'Fluency 1s Practice'
    };

    // Sort grades for consistent output
    const sortedGrades = Object.keys(timesByGradeAndStatus).sort((a, b) => {
      // Extract grade numbers for proper sorting
      const gradeA = a.replace('Grade ', '');
      const gradeB = b.replace('Grade ', '');
      
      // Handle 'Unknown' grade
      if (gradeA === 'Unknown') return 1;
      if (gradeB === 'Unknown') return -1;
      
      return parseInt(gradeA) - parseInt(gradeB);
    });

    // Calculate and display percentiles for each grade and status
    sortedGrades.forEach(grade => {
      console.log(`\n\n🎓 ${grade.toUpperCase()}`);
      console.log('='.repeat(50));
      
      const gradeData = timesByGradeAndStatus[grade];
      
      Object.entries(gradeData).forEach(([status, times]) => {
        const statusName = statusNames[status as keyof typeof statusNames];
        
        if (times.length === 0) {
          console.log(`\n${statusName}: No data found`);
          return;
        }

        const percentiles = calculatePercentiles(times);
        console.log(`\n${statusName} (${times.length} data points):`);
        console.log(`  25th percentile: ${percentiles.p25.toFixed(2)} seconds`);
        console.log(`  50th percentile (median): ${percentiles.p50.toFixed(2)} seconds`);
        console.log(`  75th percentile: ${percentiles.p75.toFixed(2)} seconds`);
      });
    });
    
  } catch (error) {
    console.error('Error running script:', error);
  }
}

// Run the script
main().catch(console.error); 