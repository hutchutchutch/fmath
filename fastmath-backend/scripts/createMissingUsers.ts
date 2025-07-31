/**
 * Script: createMissingUsers.ts
 * =============================
 * 
 * This script creates user accounts for the list of users if they don't already exist.
 * It uses the auth.ts signup flow logic but runs it directly as a script.
 * 
 * INSTRUCTIONS FOR USE:
 * --------------------
 * 1. Update the userTrackList array with the list of users you want to create
 *    (You can take this from getUserTrackTime.ts or other sources)
 * 
 * 2. For each user, provide:
 *    - userId: The unique identifier for the user
 *    - trackId: The focus track for the user (TRACK1, TRACK2, TRACK3, TRACK4)
 * 
 * 3. Optionally, update the userEmails map to provide specific email addresses
 *    For any users without an email mapping, a default email will be generated:
 *    user.{userid-prefix}@alpha.school
 * 
 * 4. Optionally, update the userGrades map to provide specific grade levels
 *    DEFAULT_GRADE (5) will be used for users without a specific grade level
 * 
 * 5. Run the script with:
 *    $ ts-node backend/src/scripts/createMissingUsers.ts
 * 
 * WHAT THE SCRIPT DOES:
 * --------------------
 * - Checks if each user already exists (by email)
 * - Creates user accounts for those that don't exist
 * - Sets up the following fields:
 *   - Email: From mapping or generated from userId
 *   - Name: Parsed from email (e.g., john.doe@alpha.school -> John Doe)
 *   - Password: Everyone's password is set to "Iloveschool1!"
 *   - Created/lastActive: Set to current timestamp
 *   - FocusTrack: Uses the provided track ID
 *   - Grade: From mapping or default (5)
 * - Logs the results to console and a log file (user-creation-log.txt)
 * 
 * NOTE: This script does NOT create users in OneRoster, as that is handled
 * by the auth.ts signup flow which is called separately.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import * as fs from 'fs';
import axios from 'axios';
import userData from './userData';

// Load environment variables
dotenv.config({ path: '../../.env' });

// OneRoster API constants
const ONE_ROSTER_API_BASE = 'https://api.alpha-1edtech.com/ims/oneroster/rostering/v1p2';
const ORG_ID = 'alphak-8'; // The organization ID in OneRoster
const ACCESS_TOKEN = 'eyJraWQiOiJjbXdNUGVOV2N6WW5FV21TXC85b2FyTG1RQ2s2aVNhTFwvZWZYVHdNcjFITDQ9IiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiIyaW9uaGk3NzA2bm80NG1pc2ZsaDk0bDZjNyIsInRva2VuX3VzZSI6ImFjY2VzcyIsInNjb3BlIjoiaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvb3JcL3YxcDFcL3Njb3BlXC9yZXNvdXJjZS5kZWxldGUgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvb3JcL3YxcDFcL3Njb3BlXC9ncmFkZWJvb2suZGVsZXRlIGh0dHBzOlwvXC9wdXJsLmltc2dsb2JhbC5vcmdcL3NwZWNcL29yXC92MXAxXC9zY29wZVwvZ3JhZGVib29rLmNyZWF0ZXB1dCBodHRwczpcL1wvcHVybC5pbXNnbG9iYWwub3JnXC9zcGVjXC9wb3dlcnBhdGhcL3YxcDFcL3Njb3BlXC9wb3dlcnBhdGgucmVhZG9ubHkgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvY2FsaXBlclwvdjFwMVwvc2NvcGVcL2V2ZW50LmNyZWF0ZSBodHRwczpcL1wvcHVybC5pbXNnbG9iYWwub3JnXC9zcGVjXC9vclwvdjFwMVwvc2NvcGVcL2dyYWRlYm9vay5yZWFkb25seSBodHRwczpcL1wvcHVybC5pbXNnbG9iYWwub3JnXC9zcGVjXC9hbmFseXRpY3NcL3YxcDBcL3Njb3BlXC9yZWFkT25seSBodHRwczpcL1wvcHVybC5pbXNnbG9iYWwub3JnXC9zcGVjXC9vclwvdjFwMVwvc2NvcGVcL3Jvc3Rlci1jb3JlLnJlYWRvbmx5IGh0dHBzOlwvXC9wdXJsLmltc2dsb2JhbC5vcmdcL3NwZWNcL29yXC92MXAxXC9zY29wZVwvcm9zdGVyLnJlYWRvbmx5IGh0dHBzOlwvXC9wdXJsLmltc2dsb2JhbC5vcmdcL3NwZWNcL29yXC92MXAxXC9zY29wZVwvcmVzb3VyY2UucmVhZG9ubHkgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvb3JcL3YxcDFcL3Njb3BlXC9yZXNvdXJjZS5jcmVhdGVwdXQgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvb3JcL3YxcDFcL3Njb3BlXC9yb3N0ZXIuY3JlYXRlcHV0IGh0dHBzOlwvXC9wdXJsLmltc2dsb2JhbC5vcmdcL3NwZWNcL29yXC92MXAxXC9zY29wZVwvcm9zdGVyLWRlbW9ncmFwaGljcy5kZWxldGUgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvb3JcL3YxcDFcL3Njb3BlXC9yb3N0ZXIuZGVsZXRlIGh0dHBzOlwvXC9wdXJsLmltc2dsb2JhbC5vcmdcL3NwZWNcL29yXC92MXAxXC9zY29wZVwvcm9zdGVyLWRlbW9ncmFwaGljcy5jcmVhdGVwdXQgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvcG93ZXJwYXRoXC92MXAxXC9zY29wZVwvcG93ZXJwYXRoLmNyZWF0ZXB1dCBodHRwczpcL1wvcHVybC5pbXNnbG9iYWwub3JnXC9zcGVjXC9vclwvdjFwMVwvc2NvcGVcL3Jvc3Rlci1kZW1vZ3JhcGhpY3MucmVhZG9ubHkiLCJhdXRoX3RpbWUiOjE3NDg0MDczMjksImlzcyI6Imh0dHBzOlwvXC9jb2duaXRvLWlkcC51cy13ZXN0LTIuYW1hem9uYXdzLmNvbVwvdXMtd2VzdC0yX2lEWUR2dXFENyIsImV4cCI6MTc0ODQxMDkyOSwiaWF0IjoxNzQ4NDA3MzI5LCJ2ZXJzaW9uIjoyLCJqdGkiOiJlNjQ3OGVlMy04ODU4LTQzM2ItOTM4ZC1iNTE0MGVhYmQ0MjgiLCJjbGllbnRfaWQiOiIyaW9uaGk3NzA2bm80NG1pc2ZsaDk0bDZjNyJ9.D4zcBbOdeYpe-BsHud0XCE2IEd7L1xS-dtU0Vrazs0-V4De0RL0kS4Nv7Ye6ACtj9egVX2_ggz8bV8ATlQmGfHg-Xj42jogT7_dwltxvFAo32-z6FpRtfmPszxPpcgY2VAlgeldm9H_KSbIYQZIDZ1HHL3F2LqNhU2EwqSVReXZq-EGSxYXksxCrF-0lgofZya9T9-lxet3PyK9_3LddSEw_xjVXI2n0K9Qx5vbaU7xHkiZHi5qig6XMUCjxG5vHGPRnTyuwCdBcrsZqmK_zKV648zO2cDlQow-CZqU52QMPMDXSAfVpFdIK6xr0C21-_fMqOJskJXDpkjrObvwOSQ';

// Map of track IDs to class names
const TRACK_TO_CLASS_MAP: Record<string, string> = {
  'TRACK5': 'fastmath-division',
  'TRACK6': 'fastmath-addition',
  'TRACK7': 'fastmath-multiplication',
  'TRACK8': 'fastmath-subtraction',
  'TRACK9': 'fastmath-addition',
  'TRACK10': 'fastmath-subtraction',
  'TRACK11': 'fastmath-multiplication',
  'TRACK12': 'fastmath-addition'
};

// All available classes
const ALL_CLASSES = Object.values(TRACK_TO_CLASS_MAP);

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

// Constants
const TABLE_NAME = process.env.TABLE_NAME || 'FastMath2';
const DEFAULT_PASSWORD = 'Iloveschool1!';
const DEFAULT_GRADE = 5; // Default grade if not specified
const EMAIL_DOMAIN = 'alpha.school';

// Interface for track data from getUserTrackTime.ts
interface UserTrackData {
  userId: string;
  trackId: string;
}

// Interface for our processed user info
interface UserInfo {
  userId: string;
  email: string;
  trackId: string;
  grade?: number;
}

interface UserProfile {
  PK: string;
  SK: string;
  userId: string;
  name: string;
  email: string;
  ageGrade: number | null;
  password_hash: string;
  created: string;
  lastActive: string;
  focusTrack?: string;
  oneRosterSourcedId?: string;
}

interface OneRosterUser {
  sourcedId: string;
  status: string;
  userMasterIdentifier: string;
  username: string;
  enabledUser: boolean;
  givenName: string;
  familyName: string;
  middleName: null;
  email: string;
  roles: {
    roleType: string;
    role: string;
    org: {
      sourcedId: string;
    };
  }[];
}

interface OneRosterResponse {
  success: boolean;
  oneRosterSourcedId?: string;
  error?: string;
}

interface OneRosterUserResponse {
  users?: OneRosterUser[];
  [key: string]: any;
}

// Process user data imported from userData.ts
const userTrackList: UserTrackData[] = userData.map(user => ({
  userId: user.userId,
  trackId: user.trackId
}));

// Create email mappings from userData
const userEmails: Record<string, string> = {};
userData.forEach(user => {
  userEmails[user.userId] = user.email;
});

// Create grade mappings from userData
const userGrades: Record<string, number> = {};
userData.forEach(user => {
  userGrades[user.userId] = user.grade;
});

/**
 * Generate a default email address for users without a mapping
 */
function generateDefaultEmail(userId: string): string {
  // Use first 8 chars of userId to create a somewhat readable email
  const shortId = userId.substring(0, 8);
  return `user.${shortId}@${EMAIL_DOMAIN}`;
}

/**
 * Get user email from the mapping or generate a default one
 */
function getUserEmail(userId: string): string {
  return userEmails[userId] || generateDefaultEmail(userId);
}

/**
 * Get user grade from the mapping or use default
 */
function getUserGrade(userId: string): number {
  return userGrades[userId] !== undefined ? userGrades[userId] : DEFAULT_GRADE;
}

/**
 * Parse user's name from email format (firstname.lastname@domain.com)
 */
function parseNameFromEmail(email: string): string {
  try {
    // Extract the part before @
    const localPart = email.split('@')[0];
    
    // Split by dot
    const nameParts = localPart.split('.');
    
    if (nameParts.length >= 2) {
      // Capitalize first letter of each name part
      const firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
      const lastName = nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1);
      
      return `${firstName} ${lastName}`;
    }
    
    // Fallback if email format is not as expected
    return localPart.charAt(0).toUpperCase() + localPart.slice(1);
  } catch (error) {
    console.error(`Error parsing name from email ${email}:`, error);
    return 'Unknown User';
  }
}

/**
 * Check if a user already exists in the database
 */
async function userExists(email: string): Promise<boolean> {
  try {
    // Check if user exists using QueryCommand with email-index
    const existingUser = await dynamoDB.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email.toLowerCase()
      },
      Limit: 1
    }));

    return !!(existingUser.Items && existingUser.Items.length > 0);
  } catch (error) {
    console.error(`Error checking if user ${email} exists:`, error);
    throw error;
  }
}

/**
 * Create a new user in the database
 */
async function createUser(userInfo: UserInfo): Promise<string> {
  try {
    // Normalize email
    const normalizedEmail = userInfo.email.toLowerCase();
    
    // Parse name from email
    const name = parseNameFromEmail(normalizedEmail);
    
    // Hash password
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    
    // Current timestamp
    const timestamp = new Date().toISOString();
    
    // Use provided userId
    const userId = userInfo.userId;
    
    // Create user profile object
    const userProfile: UserProfile = {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      userId,
      name,
      email: normalizedEmail,
      ageGrade: userInfo.grade !== undefined ? userInfo.grade : DEFAULT_GRADE,
      password_hash: hashedPassword,
      created: timestamp,
      lastActive: timestamp
    };
    
    // Add focusTrack if it exists and is not empty
    if (userInfo.trackId && userInfo.trackId.trim() !== '') {
      userProfile.focusTrack = userInfo.trackId;
    }
    
    // Save user to DynamoDB
    await dynamoDB.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: userProfile
    }));
    
    console.log(`Successfully created user in DynamoDB: ${normalizedEmail} (${userId})`);
    
    // Create user in OneRoster
    try {
      console.log(`Creating user in OneRoster: ${normalizedEmail} (${userId})`);
      const oneRosterResult = await createUserInOneRoster(userProfile);
      
      if (oneRosterResult.success) {
        console.log(`Successfully created user in OneRoster: ${normalizedEmail} (${userId})`);
        
        // If we got a different OneRoster sourcedId than the userId, update the user
        if (oneRosterResult.oneRosterSourcedId && oneRosterResult.oneRosterSourcedId !== userId) {
          console.log(`Updating user with OneRoster sourcedId: ${oneRosterResult.oneRosterSourcedId}`);
          await updateUserWithOneRosterId(userId, oneRosterResult.oneRosterSourcedId);
        }
      } else {
        console.error(`Failed to create user in OneRoster: ${normalizedEmail} (${userId}). Error: ${oneRosterResult.error}`);
      }
    } catch (oneRosterError) {
      console.error(`Error during OneRoster creation for user ${normalizedEmail} (${userId}):`, oneRosterError);
      // Continue even if OneRoster creation fails
    }
    
    return userId;
  } catch (error) {
    console.error(`Error creating user ${userInfo.email}:`, error);
    throw error;
  }
}

/**
 * Process users from the track list
 */
async function processUsers() {
  // Create log file
  const logStream = fs.createWriteStream('user-creation-log.txt', { flags: 'a' });
  logStream.write(`\n===== User Creation - ${new Date().toISOString()} =====\n`);
  
  // Count success/failure stats
  let existingUsers = 0;
  let createdUsers = 0;
  let failedUsers = 0;
  let oneRosterSuccess = 0;
  let oneRosterFailed = 0;
  
  // Process track data to get unique users with their primary track
  const uniqueUsers = new Map<string, UserInfo>();
  
  for (const trackData of userTrackList) {
    const userId = trackData.userId;
    const email = getUserEmail(userId);
    const grade = getUserGrade(userId);
    
    // Only process each userId once (use the first track as their focus track)
    if (!uniqueUsers.has(userId)) {
      uniqueUsers.set(userId, {
        userId,
        email,
        trackId: trackData.trackId,
        grade
      });
    }
  }
  
  const usersToCreate = Array.from(uniqueUsers.values());
  console.log(`Processing ${usersToCreate.length} unique users...`);
  logStream.write(`Found ${usersToCreate.length} unique users to process\n\n`);
  
  // Process each user
  for (let i = 0; i < usersToCreate.length; i++) {
    const userInfo = usersToCreate[i];
    const email = userInfo.email;
    
    console.log(`\n[${i+1}/${usersToCreate.length}] Processing user: ${email}`);
    logStream.write(`\n--- User ${i+1}/${usersToCreate.length} ---\n`);
    logStream.write(`Email: ${email}\n`);
    logStream.write(`User ID: ${userInfo.userId}\n`);
    logStream.write(`Track: ${userInfo.trackId}\n`);
    logStream.write(`Grade: ${userInfo.grade}\n`);
    
    try {
      // Check if user already exists
      const exists = await userExists(email);
      
      if (exists) {
        console.log(`User ${email} already exists, skipping...`);
        logStream.write(`Status: SKIPPED (already exists)\n`);
        existingUsers++;
      } else {
        // Create the user (and OneRoster integration)
        const userId = await createUser(userInfo);
        logStream.write(`Status: CREATED (userId: ${userId})\n`);
        createdUsers++;
        
        // For now we're counting OneRoster as successful if we get here
        // since actual failures are logged but don't stop the process
        oneRosterSuccess++;
      }
    } catch (error) {
      console.error(`Failed to process user ${email}:`, error);
      logStream.write(`Status: FAILED (${error instanceof Error ? error.message : 'Unknown error'})\n`);
      failedUsers++;
      oneRosterFailed++;
    }
    
    // Add a small delay between processing users
    if (i < usersToCreate.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Output summary
  const summary = `
===== Summary =====
- Users processed: ${usersToCreate.length}
- Already existing: ${existingUsers}
- Successfully created in DynamoDB: ${createdUsers}
- Failed to create in DynamoDB: ${failedUsers}
- OneRoster integration: ~${oneRosterSuccess} successful / ~${oneRosterFailed} failed
  (Note: See logs for detailed OneRoster status)
==================
  `;
  
  console.log(summary);
  logStream.write(summary);
  logStream.end();
  
  console.log('\nLog saved to user-creation-log.txt');
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('Starting script to create missing users...');
    
    // Validation warnings
    if (Object.keys(userEmails).length === 0) {
      console.warn('WARNING: No email mappings provided. Default emails will be generated for all users.');
    }
    
    if (userTrackList.length === 0) {
      console.error('ERROR: No users provided in userTrackList. Please add users before running the script.');
      process.exit(1);
    }
    
    await processUsers();
    console.log('\nScript completed successfully.');
  } catch (error) {
    console.error('Script execution failed:', error);
    process.exit(1);
  }
}

// Execute the script
main().catch(error => {
  console.error('Script execution failed:', error);
  process.exit(1);
});

/**
 * Check if user exists in OneRoster based on email
 */
async function checkUserInOneRoster(email: string): Promise<{ exists: boolean, sourcedId?: string }> {
  try {
    console.log(`Checking if user with email ${email} exists in OneRoster...`);
    
    // Encode the email for the URL
    const encodedEmail = encodeURIComponent(`'${email}'`);
    
    const response = await axios.get<OneRosterUserResponse>(
      `${ONE_ROSTER_API_BASE}/users?filter=email=${encodedEmail}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ACCESS_TOKEN}`
        }
      }
    );
    
    if (response.data && response.data.users && response.data.users.length > 0) {
      console.log(`User with email ${email} found in OneRoster with sourcedId: ${response.data.users[0].sourcedId}`);
      return { exists: true, sourcedId: response.data.users[0].sourcedId };
    } else {
      console.log(`User with email ${email} not found in OneRoster`);
      return { exists: false };
    }
  } catch (error: any) {
    if (error.isAxiosError) {
      console.error(`Error checking OneRoster for user ${email}:`, 
                   error.response?.status, error.response?.data || error.message);
    } else {
      console.error(`Error checking OneRoster for user ${email}:`, error);
    }
    // Return false on error - we'll try to create the user anyway
    return { exists: false };
  }
}

/**
 * Create a user in OneRoster and enroll them in classes
 */
async function createUserInOneRoster(userProfile: UserProfile): Promise<OneRosterResponse> {
  try {
    const userId = userProfile.userId;
    const email = userProfile.email.toLowerCase();
    
    // First check if user already exists in OneRoster by email
    const oneRosterCheck = await checkUserInOneRoster(email);
    
    if (oneRosterCheck.exists && oneRosterCheck.sourcedId) {
      console.log(`User ${email} already exists in OneRoster with sourcedId: ${oneRosterCheck.sourcedId}`);
      
      // Update the local user with the OneRoster sourcedId
      await updateUserWithOneRosterId(userId, oneRosterCheck.sourcedId);
      
      return {
        success: true,
        oneRosterSourcedId: oneRosterCheck.sourcedId
      };
    }
    
    // Parse name from email or use existing name
    const nameParts = parseNamePartsFromEmail(email);
    const givenName = nameParts.givenName;
    const familyName = nameParts.familyName;
    
    // Create OneRoster user object
    const userData: OneRosterUser = {
      sourcedId: userId,
      status: "active",
      userMasterIdentifier: email,
      username: email,
      enabledUser: true,
      givenName: givenName,
      familyName: familyName,
      middleName: null,
      email: email,
      roles: [
        {
          roleType: "primary",
          role: "student",
          org: {
            sourcedId: ORG_ID
          }
        }
      ]
    };

    console.log(`Creating user in OneRoster: ${email} (${userId})`);

    const response = await axios.post(
      `${ONE_ROSTER_API_BASE}/users/`,
      { user: userData },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ACCESS_TOKEN}`
        }
      }
    );

    console.log(`Successfully created user in OneRoster: ${email} (${userId})`);
    
    // Update the user in DynamoDB with the OneRoster sourcedId
    await updateUserWithOneRosterId(userId, userId);
    
    // Enroll user in classes based on focusTrack
    await enrollUserInClasses(userId, email, userProfile);
    
    return {
      success: true,
      oneRosterSourcedId: userId
    };
    
  } catch (error: any) {
    if (error.isAxiosError) {
      console.error(`Error creating user in OneRoster:`, 
                  error.response?.status, error.response?.data || error.message);
    } else {
      console.error(`Error creating user in OneRoster:`, error);
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Update a user with their OneRoster sourcedId
 */
async function updateUserWithOneRosterId(userId: string, oneRosterSourcedId: string): Promise<void> {
  try {
    await dynamoDB.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE'
      },
      UpdateExpression: 'SET oneRosterSourcedId = :sourcedId',
      ExpressionAttributeValues: {
        ':sourcedId': oneRosterSourcedId
      }
    }));
    
    console.log(`Updated user ${userId} with OneRoster sourcedId: ${oneRosterSourcedId}`);
  } catch (error) {
    console.error(`Error updating user ${userId} with OneRoster sourcedId:`, error);
    throw error;
  }
}

/**
 * Parse first and last name from email
 */
function parseNamePartsFromEmail(email: string): { givenName: string, familyName: string } {
  try {
    // Extract the part before @
    const localPart = email.split('@')[0];
    
    // Split by dot
    const nameParts = localPart.split('.');
    
    if (nameParts.length >= 2) {
      // Capitalize first letter of each name part
      const givenName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
      const familyName = nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1);
      
      return { givenName, familyName };
    }
    
    // Fallback if email format is not as expected
    return { 
      givenName: localPart.charAt(0).toUpperCase() + localPart.slice(1),
      familyName: 'User'
    };
  } catch (error) {
    console.error(`Error parsing name from email ${email}:`, error);
    return { givenName: 'Unknown', familyName: 'User' };
  }
}

/**
 * Determine which classes to enroll the user in based on their focusTrack
 */
function getClassesForUser(profile: UserProfile): string[] {
  const focusTrack = profile.focusTrack;
  
  // If focusTrack doesn't exist or is blank, enroll in all classes
  if (!focusTrack) {
    console.log('No focusTrack found, will enroll in all classes');
    return ALL_CLASSES;
  }
  
  // Ignore TRACKS 1-4
  if (focusTrack === 'TRACK1' || focusTrack === 'TRACK2' || focusTrack === 'TRACK3' || focusTrack === 'TRACK4') {
    console.log(`Ignoring old track format "${focusTrack}", will enroll in all classes`);
    return ALL_CLASSES;
  }
  
  // Get the class corresponding to the track
  const className = TRACK_TO_CLASS_MAP[focusTrack];
  
  // If the focusTrack value doesn't map to a class, enroll in all classes
  if (!className) {
    console.log(`Unknown focusTrack "${focusTrack}", will enroll in all classes`);
    return ALL_CLASSES;
  }
  
  console.log(`Found focusTrack "${focusTrack}", will enroll in ${className}`);
  return [className];
}

/**
 * Enroll user in FastMath classes based on their focusTrack
 */
async function enrollUserInClasses(
  userId: string, 
  email: string, 
  profile: UserProfile
): Promise<number> {
  // Determine which classes to enroll in based on focusTrack
  const classesToEnroll = getClassesForUser(profile);
  console.log(`Enrolling user ${email} in ${classesToEnroll.length} class(es): ${classesToEnroll.join(', ')}`);
  
  let successfulEnrollments = 0;
  
  for (const className of classesToEnroll) {
    try {
      const enrollmentData = {
        enrollment: {
          sourcedId: `fastmath-enrollment-${userId}-${className}`,
          user: {
            sourcedId: userId
          }
        }
      };
      
      console.log(`Enrolling user in class ${className}`);
      
      const response = await axios.post(
        `${ONE_ROSTER_API_BASE}/classes/${className}/students`,
        enrollmentData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ACCESS_TOKEN}`
          }
        }
      );
      
      console.log(`[ONEROSTER] ✅ SUCCESS: Enrolled user ${email} (${userId}) in class ${className}`);
      // Extract the sourcedId from the response using the correct format
      const responseData = response.data;
      console.log(`[ONEROSTER] Response status: ${response.status}, Response data:`, JSON.stringify(responseData));
      successfulEnrollments++;
      
      // Add a small delay between enrollment API calls
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error: any) {
      if (error.isAxiosError) {
        console.error(`Error enrolling user ${email} (${userId}) in class ${className}:`, 
                     error.response?.status, error.response?.data || error.message);
      } else {
        console.error(`Error enrolling user ${email} (${userId}) in class ${className}:`, error);
      }
    }
  }
  
  return successfulEnrollments;
} 