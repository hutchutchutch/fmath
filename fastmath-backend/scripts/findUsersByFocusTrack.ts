import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, ScanCommandInput, ScanCommandOutput, UpdateCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'FastMath2';

// Define user profile interface
interface UserProfile {
  PK: string;
  SK: string;
  userId: string;
  email: string;
  name?: string;
  focusTrack?: string;
  [key: string]: any;
}

/**
 * Retrieves all users with a specific focus track
 */
async function getUsersByFocusTrack(targetTrack: string): Promise<UserProfile[]> {
  console.log(`Scanning for all users with focusTrack = ${targetTrack}...`);
  
  let matchingUsers: UserProfile[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;
  
  do {
    const params: ScanCommandInput = {
      TableName: TABLE_NAME,
      FilterExpression: 'SK = :sk AND focusTrack = :track',
      ExpressionAttributeValues: {
        ':sk': 'PROFILE',
        ':track': targetTrack
      },
      ExclusiveStartKey: lastEvaluatedKey
    };
    
    try {
      const result: ScanCommandOutput = await dynamoDB.send(new ScanCommand(params));
      
      if (result.Items && result.Items.length > 0) {
        // Filter out test users
        const validUsers = (result.Items as UserProfile[])
          .filter(profile => profile.email && !isTestUser(profile));
        
        matchingUsers = [...matchingUsers, ...validUsers];
      }
      
      lastEvaluatedKey = result.LastEvaluatedKey;
      console.log(`Retrieved batch of ${result.Items?.length || 0} profiles, found ${matchingUsers.length} matching users so far`);
      
    } catch (error) {
      console.error('Error scanning user profiles:', error);
      throw error;
    }
  } while (lastEvaluatedKey);
  
  console.log(`Found ${matchingUsers.length} users with focusTrack = ${targetTrack}`);
  return matchingUsers;
}

/**
 * Updates a user's focus track
 */
async function updateUserFocusTrack(user: UserProfile, newTrack: string): Promise<void> {
  const params: UpdateCommandInput = {
    TableName: TABLE_NAME,
    Key: {
      PK: user.PK,
      SK: user.SK
    },
    UpdateExpression: 'SET focusTrack = :newTrack',
    ExpressionAttributeValues: {
      ':newTrack': newTrack
    },
    ReturnValues: 'UPDATED_NEW'
  };

  try {
    await dynamoDB.send(new UpdateCommand(params));
    console.log(`Updated user ${user.email} from ${user.focusTrack} to ${newTrack}`);
  } catch (error) {
    console.error(`Error updating user ${user.email}:`, error);
    throw error;
  }
}

/**
 * Check if a user is a test user based on their email
 */
function isTestUser(profile: UserProfile): boolean {
  if (!profile.email) return true;
  
  const testDomains = ['test', 'example', 'dummy'];
  return testDomains.some(domain => profile.email.includes(domain));
}

/**
 * Display user information in a readable format
 */
function displayUserInfo(users: UserProfile[], oldTrack: string, newTrack: string): void {
  console.log(`\n========== USERS WITH FOCUS TRACK "${oldTrack}" ==========`);
  console.log(`Total users found: ${users.length}`);
  
  if (users.length > 0) {
    console.log('\n----- USER DETAILS -----');
    users.forEach((user, index) => {
      console.log(`\n[${index + 1}] User: ${user.name || 'Unknown'}`);
      console.log(`Email: ${user.email}`);
      console.log(`User ID: ${user.userId}`);
      console.log(`Focus Track: ${user.focusTrack} (will be updated to ${newTrack})`);
    });
  }
}

/**
 * Updates the focus track for multiple users
 */
async function updateUsersFocusTrack(users: UserProfile[], newTrack: string): Promise<void> {
  console.log(`\nUpdating focus track to '${newTrack}' for ${users.length} users...`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const user of users) {
    try {
      await updateUserFocusTrack(user, newTrack);
      successCount++;
    } catch (error) {
      failCount++;
    }
  }
  
  console.log('\n========== UPDATE SUMMARY ==========');
  console.log(`Total users processed: ${users.length}`);
  console.log(`Successful updates: ${successCount}`);
  console.log(`Failed updates: ${failCount}`);
}

async function main() {
  try {
    const oldTrack = 'TRACK1';
    const newTrack = 'TRACK9';
    
    // First find all users with the old track
    const users = await getUsersByFocusTrack(oldTrack);
    
    // Display user information
    displayUserInfo(users, oldTrack, newTrack);
    
    if (users.length === 0) {
      console.log('No users found to update');
      return;
    }
    
    // Update all users immediately
    await updateUsersFocusTrack(users, newTrack);
    console.log('\nFocus track update completed successfully');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 