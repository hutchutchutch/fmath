import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, ScanCommandInput } from '@aws-sdk/lib-dynamodb';
import axios from 'axios';
import * as fs from 'fs';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

// Constants
const TABLE_NAME = 'FastMath2';
const ONE_ROSTER_API_BASE = 'https://api.alpha-1edtech.com/ims/oneroster/rostering/v1p2';
const ORG_ID = 'alphak-8'; // The organization ID in OneRoster

// Hard-coded access token
const ACCESS_TOKEN = 'eyJraWQiOiJjbXdNUGVOV2N6WW5FV21TXC85b2FyTG1RQ2s2aVNhTFwvZWZYVHdNcjFITDQ9IiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiIyaW9uaGk3NzA2bm80NG1pc2ZsaDk0bDZjNyIsInRva2VuX3VzZSI6ImFjY2VzcyIsInNjb3BlIjoiaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvb3JcL3YxcDFcL3Njb3BlXC9yZXNvdXJjZS5kZWxldGUgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvb3JcL3YxcDFcL3Njb3BlXC9ncmFkZWJvb2suZGVsZXRlIGh0dHBzOlwvXC9wdXJsLmltc2dsb2JhbC5vcmdcL3NwZWNcL29yXC92MXAxXC9zY29wZVwvZ3JhZGVib29rLmNyZWF0ZXB1dCBodHRwczpcL1wvcHVybC5pbXNnbG9iYWwub3JnXC9zcGVjXC9wb3dlcnBhdGhcL3YxcDFcL3Njb3BlXC9wb3dlcnBhdGgucmVhZG9ubHkgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvY2FsaXBlclwvdjFwMVwvc2NvcGVcL2V2ZW50LmNyZWF0ZSBodHRwczpcL1wvcHVybC5pbXNnbG9iYWwub3JnXC9zcGVjXC9vclwvdjFwMVwvc2NvcGVcL2dyYWRlYm9vay5yZWFkb25seSBodHRwczpcL1wvcHVybC5pbXNnbG9iYWwub3JnXC9zcGVjXC9vclwvdjFwMVwvc2NvcGVcL3Jvc3Rlci1jb3JlLnJlYWRvbmx5IGh0dHBzOlwvXC9wdXJsLmltc2dsb2JhbC5vcmdcL3NwZWNcL29yXC92MXAxXC9zY29wZVwvcm9zdGVyLnJlYWRvbmx5IGh0dHBzOlwvXC9wdXJsLmltc2dsb2JhbC5vcmdcL3NwZWNcL29yXC92MXAxXC9zY29wZVwvcmVzb3VyY2UucmVhZG9ubHkgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvb3JcL3YxcDFcL3Njb3BlXC9yZXNvdXJjZS5jcmVhdGVwdXQgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvb3JcL3YxcDFcL3Njb3BlXC9yb3N0ZXIuY3JlYXRlcHV0IGh0dHBzOlwvXC9wdXJsLmltc2dsb2JhbC5vcmdcL3NwZWNcL29yXC92MXAxXC9zY29wZVwvcm9zdGVyLWRlbW9ncmFwaGljcy5kZWxldGUgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvb3JcL3YxcDFcL3Njb3BlXC9yb3N0ZXIuZGVsZXRlIGh0dHBzOlwvXC9wdXJsLmltc2dsb2JhbC5vcmdcL3NwZWNcL29yXC92MXAxXC9zY29wZVwvcm9zdGVyLWRlbW9ncmFwaGljcy5jcmVhdGVwdXQgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvcG93ZXJwYXRoXC92MXAxXC9zY29wZVwvcG93ZXJwYXRoLmNyZWF0ZXB1dCBodHRwczpcL1wvcHVybC5pbXNnbG9iYWwub3JnXC9zcGVjXC9vclwvdjFwMVwvc2NvcGVcL3Jvc3Rlci1kZW1vZ3JhcGhpY3MucmVhZG9ubHkiLCJhdXRoX3RpbWUiOjE3NDQ4OTI1MjMsImlzcyI6Imh0dHBzOlwvXC9jb2duaXRvLWlkcC51cy13ZXN0LTIuYW1hem9uYXdzLmNvbVwvdXMtd2VzdC0yX2lEWUR2dXFENyIsImV4cCI6MTc0NDg5NjEyMywiaWF0IjoxNzQ0ODkyNTIzLCJ2ZXJzaW9uIjoyLCJqdGkiOiJhNWNiOGM4NS03Zjg5LTRkMjAtOWY2ZS1hYjVmYTA0MzQ0ZTQiLCJjbGllbnRfaWQiOiIyaW9uaGk3NzA2bm80NG1pc2ZsaDk0bDZjNyJ9.qT5aB3W2SqhKt4UVUaSlrfWBmEC05OVTdiaSfCln5dIkBAJSex5zSDA8qg_jp0CEuvWNas4fbADZS8wcVLvWa6kLeYsP-zUVw-TYZhv517xCksf9VlGQdUxWJCfHFVSk8W_m7hw_KT5KEQsn32T1cCzrSRtFwSJ0LiEBWcLdkPmoV7zq4SgFlMCJh181Rhe0GGH5VI7389aO0bGVCwMi5KSBUBYvlgli3fQ2dubLzhkKEhsf6C96mo4jIJn37t2cSG1Bp70_txlpEQoaFBhHHourYTlGMCf7IbAOc0H4tLbEqewN6luVNhmzvqyxVUBxpDcZifnw3VkmPzGc50rf-Q';

// Users to exclude (if needed)
const EXCLUDED_USERS: string[] = [];

// Define types for our DynamoDB items
interface UserProfileItem {
  PK: string;
  SK: string;
  email: string;
  name?: string;
  focusTrack?: string;
  [key: string]: any; // For other properties
}

interface OneRosterUser {
  sourcedId: string;
  status: string;
  userMasterIdentifier: string;
  username: string;
  email?: string;
  enabledUser: boolean;
  givenName: string;
  familyName: string;
  middleName: null;
  roles: {
    roleType: string;
    role: string;
    org: {
      sourcedId: string;
    };
  }[];
  [key: string]: any; // For other properties
}

interface OneRosterUserResponse {
  user: OneRosterUser;
}

/**
 * Fetches all non-test user profiles from DynamoDB, excluding any users in the exclude list
 */
async function getAllNonTestUsers(): Promise<UserProfileItem[]> {
  console.log('Scanning for all user profiles...');
  
  let allProfiles: UserProfileItem[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;
  
  do {
    const params: ScanCommandInput = {
      TableName: TABLE_NAME,
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: {
        ':sk': 'PROFILE'
      },
      ExclusiveStartKey: lastEvaluatedKey
    };
    
    try {
      const result = await dynamoDB.send(new ScanCommand(params));
      
      if (result.Items && result.Items.length > 0) {
        const validProfiles = (result.Items as UserProfileItem[])
          .filter(profile => profile.email && !isTestUser(profile) && !EXCLUDED_USERS.includes(profile.email));
        
        allProfiles = [...allProfiles, ...validProfiles];
      }
      
      lastEvaluatedKey = result.LastEvaluatedKey;
      console.log(`Retrieved batch of ${result.Items?.length || 0} profiles, found ${allProfiles.length} non-test users so far`);
      
    } catch (error) {
      console.error('Error scanning user profiles:', error);
      throw error;
    }
  } while (lastEvaluatedKey);
  
  console.log(`Found ${allProfiles.length} non-test users to process`);
  return allProfiles;
}

/**
 * Check if a user is a test user based on their email
 */
function isTestUser(profile: UserProfileItem): boolean {
  if (!profile.email) return true; // Treat profiles without email as test users
  
  return profile.email.includes('test') || 
         profile.email.includes('example') ||
         profile.email.includes('dummy') ||
         profile.email.includes('2hourlearning.com') ||
         profile.email.includes('trilogy.com');
}

/**
 * Get a user from OneRoster API by their sourcedId
 */
async function getOneRosterUser(userId: string): Promise<OneRosterUser | null> {
  try {
    console.log(`Fetching user from OneRoster: ${userId}`);
    
    const response = await axios.get<OneRosterUserResponse>(
      `${ONE_ROSTER_API_BASE}/users/${userId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ACCESS_TOKEN}`
        }
      }
    );
    
    if (response.data && response.data.user) {
      console.log(`Successfully retrieved user data for: ${userId}`);
      return response.data.user;
    } else {
      console.error(`Invalid response format for user ${userId}`);
      return null;
    }
  } catch (error: any) {
    if (error.isAxiosError) {
      console.error(`Error retrieving user ${userId} from OneRoster:`, 
                   error.response?.status, error.response?.data || error.message);
    } else {
      console.error(`Error retrieving user ${userId} from OneRoster:`, error);
    }
    return null;
  }
}

/**
 * Update a user in OneRoster to add the email field
 */
async function updateOneRosterUserEmail(userId: string, userData: OneRosterUser): Promise<boolean> {
  try {
    // Ensure the email field exists and matches the username
    userData.email = userData.username;
    
    console.log(`Updating user in OneRoster: ${userId} with email: ${userData.email}`);
    
    const response = await axios.put(
      `${ONE_ROSTER_API_BASE}/users/${userId}`,
      { user: userData },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ACCESS_TOKEN}`
        }
      }
    );
    
    console.log(`Successfully updated user in OneRoster: ${userId}`);
    return true;
  } catch (error: any) {
    if (error.isAxiosError) {
      console.error(`Error updating user ${userId} in OneRoster:`, 
                   error.response?.status, error.response?.data || error.message);
    } else {
      console.error(`Error updating user ${userId} in OneRoster:`, error);
    }
    return false;
  }
}

/**
 * Process all users and update them with email field
 */
async function updateAllUsersWithEmail() {
  try {
    // Get all non-test user profiles, excluding any in the exclude list
    const userProfiles = await getAllNonTestUsers();
    
    if (userProfiles.length === 0) {
      console.log('No users to process');
      return;
    }
    
    // Create log file
    const logStream = fs.createWriteStream('oneroster-email-update-log.txt', { flags: 'a' });
    logStream.write(`\n===== OneRoster Email Update - ${new Date().toISOString()} =====\n`);
    logStream.write(`Found ${userProfiles.length} users to process\n\n`);
    
    // Count success/failure stats
    let successCount = 0;
    let updateFailed = 0;
    let notFound = 0;
    
    console.log(`Processing ${userProfiles.length} users...`);
    
    // Process each user
    for (let i = 0; i < userProfiles.length; i++) {
      const profile = userProfiles[i];
      
      // Extract user info
      const userId = profile.PK.replace('USER#', '');
      const email = profile.email;
      
      console.log(`\n[${i+1}/${userProfiles.length}] Processing user: ${email} (${userId})`);
      logStream.write(`\n--- User ${i+1}/${userProfiles.length} ---\n`);
      logStream.write(`Email: ${email}\n`);
      logStream.write(`ID: ${userId}\n`);
      
      // Step 1: Get the user from OneRoster
      const userData = await getOneRosterUser(userId);
      
      if (!userData) {
        console.log(`User ${userId} not found in OneRoster`);
        logStream.write(`Status: NOT FOUND in OneRoster\n`);
        notFound++;
        continue;
      }
      
      // Step 2: Update the user with the email field
      const updateResult = await updateOneRosterUserEmail(userId, userData);
      
      if (updateResult) {
        successCount++;
        logStream.write(`Status: UPDATE SUCCESS\n`);
      } else {
        updateFailed++;
        logStream.write(`Status: UPDATE FAILED\n`);
      }
      
      // Add a delay between processing users to avoid rate limiting
      console.log(`Waiting before processing next user...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Output summary
    const summary = `
===== Summary =====
- Users processed: ${userProfiles.length}
- Users not found: ${notFound}
- User updates successful: ${successCount}
- User updates failed: ${updateFailed}
==================
    `;
    
    console.log(summary);
    logStream.write(summary);
    logStream.end();
    
    console.log('\nLog saved to oneroster-email-update-log.txt');
    
  } catch (error) {
    console.error('Error processing users:', error);
  }
}

/**
 * Process a single user for testing purposes
 */
async function testSingleUser(userId: string) {
  try {
    console.log(`Testing update for a single user: ${userId}`);
    
    // Create log file
    const logStream = fs.createWriteStream('oneroster-email-update-test.txt', { flags: 'a' });
    logStream.write(`\n===== OneRoster Email Update Test - ${new Date().toISOString()} =====\n`);
    logStream.write(`Testing user ID: ${userId}\n\n`);
    
    // Step 1: Get the user from OneRoster
    const userData = await getOneRosterUser(userId);
    
    if (!userData) {
      console.log(`User ${userId} not found in OneRoster`);
      logStream.write(`Status: NOT FOUND in OneRoster\n`);
      logStream.end();
      return;
    }
    
    console.log('User data retrieved:');
    console.log(JSON.stringify(userData, null, 2));
    logStream.write(`User data retrieved: ${JSON.stringify(userData, null, 2)}\n`);
    
    // Step 2: Update the user with the email field
    const updateResult = await updateOneRosterUserEmail(userId, userData);
    
    if (updateResult) {
      console.log(`Successfully updated user ${userId} with email: ${userData.username}`);
      logStream.write(`Status: UPDATE SUCCESS\n`);
    } else {
      console.log(`Failed to update user ${userId}`);
      logStream.write(`Status: UPDATE FAILED\n`);
    }
    
    logStream.end();
    console.log('\nLog saved to oneroster-email-update-test.txt');
    
  } catch (error) {
    console.error('Error testing single user:', error);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Check if a user ID is provided as command line argument
    const testUserId = process.argv[2];
    
    if (testUserId) {
      console.log('Starting script to test updating a single OneRoster user...');
      await testSingleUser(testUserId);
    } else {
      console.log('Starting script to update all OneRoster users with email field...');
      await updateAllUsersWithEmail();
    }
    
    console.log('Script completed');
  } catch (error) {
    console.error('Script execution failed:', error);
  }
}

// Execute script
main(); 