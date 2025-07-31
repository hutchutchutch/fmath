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
const ACCESS_TOKEN = 'eyJraWQiOiJjbXdNUGVOV2N6WW5FV21TXC85b2FyTG1RQ2s2aVNhTFwvZWZYVHdNcjFITDQ9IiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiIyaW9uaGk3NzA2bm80NG1pc2ZsaDk0bDZjNyIsInRva2VuX3VzZSI6ImFjY2VzcyIsInNjb3BlIjoiaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvb3JcL3YxcDFcL3Njb3BlXC9yZXNvdXJjZS5kZWxldGUgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvb3JcL3YxcDFcL3Njb3BlXC9ncmFkZWJvb2suZGVsZXRlIGh0dHBzOlwvXC9wdXJsLmltc2dsb2JhbC5vcmdcL3NwZWNcL29yXC92MXAxXC9zY29wZVwvZ3JhZGVib29rLmNyZWF0ZXB1dCBodHRwczpcL1wvcHVybC5pbXNnbG9iYWwub3JnXC9zcGVjXC9wb3dlcnBhdGhcL3YxcDFcL3Njb3BlXC9wb3dlcnBhdGgucmVhZG9ubHkgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvY2FsaXBlclwvdjFwMVwvc2NvcGVcL2V2ZW50LmNyZWF0ZSBodHRwczpcL1wvcHVybC5pbXNnbG9iYWwub3JnXC9zcGVjXC9vclwvdjFwMVwvc2NvcGVcL2dyYWRlYm9vay5yZWFkb25seSBodHRwczpcL1wvcHVybC5pbXNnbG9iYWwub3JnXC9zcGVjXC9vclwvdjFwMVwvc2NvcGVcL3Jvc3Rlci1jb3JlLnJlYWRvbmx5IGh0dHBzOlwvXC9wdXJsLmltc2dsb2JhbC5vcmdcL3NwZWNcL29yXC92MXAxXC9zY29wZVwvcm9zdGVyLnJlYWRvbmx5IGh0dHBzOlwvXC9wdXJsLmltc2dsb2JhbC5vcmdcL3NwZWNcL29yXC92MXAxXC9zY29wZVwvcmVzb3VyY2UucmVhZG9ubHkgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvb3JcL3YxcDFcL3Njb3BlXC9yZXNvdXJjZS5jcmVhdGVwdXQgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvb3JcL3YxcDFcL3Njb3BlXC9yb3N0ZXIuY3JlYXRlcHV0IGh0dHBzOlwvXC9wdXJsLmltc2dsb2JhbC5vcmdcL3NwZWNcL29yXC92MXAxXC9zY29wZVwvcm9zdGVyLWRlbW9ncmFwaGljcy5kZWxldGUgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvb3JcL3YxcDFcL3Njb3BlXC9yb3N0ZXIuZGVsZXRlIGh0dHBzOlwvXC9wdXJsLmltc2dsb2JhbC5vcmdcL3NwZWNcL29yXC92MXAxXC9zY29wZVwvcm9zdGVyLWRlbW9ncmFwaGljcy5jcmVhdGVwdXQgaHR0cHM6XC9cL3B1cmwuaW1zZ2xvYmFsLm9yZ1wvc3BlY1wvcG93ZXJwYXRoXC92MXAxXC9zY29wZVwvcG93ZXJwYXRoLmNyZWF0ZXB1dCBodHRwczpcL1wvcHVybC5pbXNnbG9iYWwub3JnXC9zcGVjXC9vclwvdjFwMVwvc2NvcGVcL3Jvc3Rlci1kZW1vZ3JhcGhpY3MucmVhZG9ubHkiLCJhdXRoX3RpbWUiOjE3NDQwMTA3MjcsImlzcyI6Imh0dHBzOlwvXC9jb2duaXRvLWlkcC51cy13ZXN0LTIuYW1hem9uYXdzLmNvbVwvdXMtd2VzdC0yX2lEWUR2dXFENyIsImV4cCI6MTc0NDAxNDMyNywiaWF0IjoxNzQ0MDEwNzI3LCJ2ZXJzaW9uIjoyLCJqdGkiOiI1OThmMmVlZC00NmEzLTRlZmMtYjBmMi0xN2JlN2VlMGY0NTciLCJjbGllbnRfaWQiOiIyaW9uaGk3NzA2bm80NG1pc2ZsaDk0bDZjNyJ9.fX8jksOWPp_kWTyg-SPkhgeTzk4ddZ4rIbl8gZArlyr47-Kn6483Y2fA5Z6gcMAApWAK5xSW17cfc6kWk-8tGjwKR3kmkpzX3j3R1Pir6lWQucdLICgyxt7YFyaJ9w1Hxepr0PY6irjTHxVuhVuiEqKuo2hJXOCxg3kz5Jmt0tD954ZtK_M96pR4ITcIQmjsrVgzwYqHulUR75mRa11fnFJbURhZJsyPtN5-_Ub70kZS5e8V1VCTgIlJchjOUOdElibSjUIRgn4OAMiQJJy2bZ2P_HXMjj9vgRjoky9C824ufLtq_Ncg7_utTPUnR8VI2uvu7VuamEMd8DrZ3GQX9g';

// Users to exclude (already processed)
const EXCLUDED_USERS = ['alyan.slizza@alpha.school'];

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
}

// Map of track IDs to class names
const TRACK_TO_CLASS_MAP: Record<string, string> = {
  'TRACK1': 'fastmath-addition',
  'TRACK2': 'fastmath-subtraction',
  'TRACK3': 'fastmath-multiplication',
  'TRACK4': 'fastmath-division'
};

// All available classes
const ALL_CLASSES = Object.values(TRACK_TO_CLASS_MAP);

/**
 * Fetches all non-test user profiles from DynamoDB, excluding already processed users
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
 * Parse user's name from email (format: given_name.family_name@alpha.school)
 */
function parseNameFromEmail(email: string): { givenName: string, familyName: string } {
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
function getClassesForUser(profile: UserProfileItem): string[] {
  const focusTrack = profile.focusTrack;
  
  // If focusTrack doesn't exist or is blank, enroll in all classes
  if (!focusTrack) {
    console.log('No focusTrack found, will enroll in all classes');
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
 * Create a user in OneRoster
 * Returns true if successful, false otherwise
 */
async function createOneRosterUser(
  userId: string,
  email: string,
  givenName: string,
  familyName: string
): Promise<boolean> {
  try {
    const userData: OneRosterUser = {
      sourcedId: userId,
      status: "active",
      userMasterIdentifier: email,
      username: email,
      enabledUser: true,
      givenName: givenName,
      familyName: familyName,
      middleName: null,
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
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    return true; // Success
  } catch (error: any) {
    if (error.isAxiosError) {
      console.error(`Error creating user ${email} (${userId}) in OneRoster:`, 
                   error.response?.status, error.response?.data || error.message);
    } else {
      console.error(`Error creating user ${email} (${userId}) in OneRoster:`, error);
    }
    return false; // Failed
  }
}

/**
 * Enroll a user in FastMath classes based on their focusTrack
 * Returns the number of successful enrollments
 */
async function enrollUserInClasses(
  userId: string, 
  email: string, 
  profile: UserProfileItem
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
      
      console.log(`Successfully enrolled user ${email} (${userId}) in class ${className}`);
      console.log('Response:', JSON.stringify(response.data, null, 2));
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

/**
 * Process all remaining non-test users
 */
async function processAllRemainingUsers() {
  try {
    // Get all non-test user profiles, excluding already processed ones
    const userProfiles = await getAllNonTestUsers();
    
    if (userProfiles.length === 0) {
      console.log('No remaining users to process');
      return;
    }
    
    // Create log file
    const logStream = fs.createWriteStream('oneroster-batch-creation-log.txt', { flags: 'a' });
    logStream.write(`\n===== OneRoster Batch Creation - ${new Date().toISOString()} =====\n`);
    logStream.write(`Found ${userProfiles.length} users to process\n\n`);
    
    // Count success/failure stats
    let userCreationSuccess = 0;
    let userCreationFailed = 0;
    let enrollmentSuccess = 0;
    let enrollmentFailed = 0;
    let totalEnrollmentsAttempted = 0;
    
    console.log(`Processing ${userProfiles.length} users...`);
    
    // Process each user
    for (let i = 0; i < userProfiles.length; i++) {
      const profile = userProfiles[i];
      
      // Extract user info
      const userId = profile.PK.replace('USER#', '');
      const email = profile.email;
      const { givenName, familyName } = parseNameFromEmail(email);
      
      console.log(`\n[${i+1}/${userProfiles.length}] Processing user: ${email} (${userId})`);
      console.log(`Name: ${givenName} ${familyName}`);
      console.log(`Focus Track: ${profile.focusTrack || 'Not specified'}`);
      
      logStream.write(`\n--- User ${i+1}/${userProfiles.length} ---\n`);
      logStream.write(`Email: ${email}\n`);
      logStream.write(`ID: ${userId}\n`);
      logStream.write(`Name: ${givenName} ${familyName}\n`);
      logStream.write(`Focus Track: ${profile.focusTrack || 'Not specified'}\n`);
      
      // Create user in OneRoster
      const userCreated = await createOneRosterUser(userId, email, givenName, familyName);
      
      if (userCreated) {
        userCreationSuccess++;
        logStream.write(`User creation: SUCCESS\n`);
        
        // Wait a moment before trying to enroll the user
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Enroll user in appropriate FastMath classes
        const classesToEnroll = getClassesForUser(profile);
        totalEnrollmentsAttempted += classesToEnroll.length;
        
        const successfulEnrollments = await enrollUserInClasses(userId, email, profile);
        
        if (successfulEnrollments === classesToEnroll.length) {
          enrollmentSuccess += successfulEnrollments;
          logStream.write(`Enrollments: SUCCESS (${successfulEnrollments}/${classesToEnroll.length})\n`);
        } else {
          // Partial or complete enrollment failure
          enrollmentSuccess += successfulEnrollments;
          enrollmentFailed += (classesToEnroll.length - successfulEnrollments);
          logStream.write(`Enrollments: PARTIAL (${successfulEnrollments}/${classesToEnroll.length})\n`);
        }
      } else {
        userCreationFailed++;
        logStream.write(`User creation: FAILED\n`);
      }
      
      // Add a delay between processing users to avoid rate limiting
      console.log(`Waiting before processing next user...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Output summary
    const summary = `
===== Summary =====
- Users processed: ${userProfiles.length}
- User creation: ${userCreationSuccess} successful, ${userCreationFailed} failed
- Class enrollments: ${enrollmentSuccess} successful, ${enrollmentFailed} failed (out of ${totalEnrollmentsAttempted} attempted)
==================
    `;
    
    console.log(summary);
    logStream.write(summary);
    logStream.end();
    
    console.log('\nLog saved to oneroster-batch-creation-log.txt');
    
  } catch (error) {
    console.error('Error processing users:', error);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('Starting script to create remaining OneRoster users...');
    console.log(`Excluding already processed users: ${EXCLUDED_USERS.join(', ')}`);
    await processAllRemainingUsers();
  } catch (error) {
    console.error('Script execution failed:', error);
  }
}

// Execute script
main(); 