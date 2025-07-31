import { dynamoDB } from '../config/aws';
import { QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  createUserInOneRosterWithProfile,
  getValidOneRosterToken
} from './oneRosterService';
import { TRACK_TO_CLASS_MAP } from '../types/oneRoster';
import { CAMPUS_NAMES } from '../types/constants';

// Constants
const TABLE_NAME = process.env.TABLE_NAME || 'FastMath2';
const DEFAULT_PASSWORD = 'Iloveschool1!';
const DEFAULT_GRADE = 5;

// Interface for user creation request
export interface UserCreationRequest {
  users: {
    userId?: string; // Optional - will be generated if not provided
    email: string;
    trackId?: string; // Optional - user can have no focus track
    grade?: number;
    name?: string; // Optional - will be parsed from email if not provided
    campus?: string; // Optional - campus identifier
  }[];
}

// Interface for our processed user info
export interface UserInfo {
  userId: string;
  email: string;
  trackId?: string; // Optional - user can have no focus track
  grade: number;
  name?: string;
  campus?: string;
}

// Interface for user profile in DynamoDB
export interface UserProfile {
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
  campus?: string;
}

// Response interfaces
export interface UserCreationResponse {
  success: boolean;
  message: string;
  results?: {
    totalProcessed: number;
    created: number;
    alreadyExisting: number;
    failed: number;
    details: UserCreationResult[];
  };
  error?: string;
}

export interface UserCreationResult {
  email: string;
  userId: string;
  status: 'created' | 'existing' | 'failed';
  message?: string;
  oneRosterStatus?: 'success' | 'failed' | 'already_exists';
  enrolledClasses?: string[];
}

/**
 * Get a user's profile from the database by email
 */
export async function getUserByEmail(email: string): Promise<UserProfile | null> {
  try {
    const result = await dynamoDB.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email.toLowerCase()
      },
      Limit: 1
    }));

    if (result.Items && result.Items.length > 0) {
      return result.Items[0] as UserProfile;
    }

    return null;
  } catch (error) {
    console.error(`Error getting user by email ${email}:`, error);
    throw error;
  }
}

/**
 * Check if a user already exists in the database
 */
export async function userExists(email: string): Promise<boolean> {
  const user = await getUserByEmail(email);
  return !!user;
}

/**
 * Parse user's name from email format (firstname.lastname@domain.com)
 */
export function parseNameFromEmail(email: string): string {
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
 * Update a user with their OneRoster sourcedId
 */
export async function updateUserWithOneRosterId(userId: string, oneRosterSourcedId: string): Promise<void> {
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
 * Create a new user in the database
 */
export async function createUser(userInfo: UserInfo): Promise<UserCreationResult> {
  try {
    // Normalize email
    const normalizedEmail = userInfo.email.toLowerCase();
    
    // Parse name from email if not provided
    const name = userInfo.name || parseNameFromEmail(normalizedEmail);
    
    // Hash password
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    
    // Current timestamp
    const timestamp = new Date().toISOString();
    
    // Use provided userId or generate a new one
    const userId = userInfo.userId || uuidv4();
    
    // Create user profile object
    const userProfile: UserProfile = {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      userId,
      name,
      email: normalizedEmail,
      ageGrade: userInfo.grade,
      password_hash: hashedPassword,
      created: timestamp,
      lastActive: timestamp
    };
    
    // Add focusTrack if it exists and is not empty
    if (userInfo.trackId && userInfo.trackId.trim() !== '') {
      userProfile.focusTrack = userInfo.trackId;
    }
    
    // Add campus if it exists and is not empty
    if (userInfo.campus && userInfo.campus.trim() !== '') {
      userProfile.campus = userInfo.campus;
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
      const token = await getValidOneRosterToken();
      const oneRosterResult = await createUserInOneRosterWithProfile(userProfile, token);
      
      if (oneRosterResult.success) {
        console.log(`Successfully created user in OneRoster: ${normalizedEmail} (${userId})`);
        
        // If we got a different OneRoster sourcedId than the userId, update the user
        if (oneRosterResult.oneRosterSourcedId && oneRosterResult.oneRosterSourcedId !== userId) {
          console.log(`Updating user with OneRoster sourcedId: ${oneRosterResult.oneRosterSourcedId}`);
          await updateUserWithOneRosterId(userId, oneRosterResult.oneRosterSourcedId);
        }
        
        return {
          email: normalizedEmail,
          userId,
          status: 'created',
          oneRosterStatus: oneRosterResult.existingUser ? 'already_exists' : 'success',
          enrolledClasses: oneRosterResult.enrolledClasses
        };
      } else {
        console.error(`Failed to create user in OneRoster: ${normalizedEmail} (${userId}). Error: ${oneRosterResult.message}`);
        
        return {
          email: normalizedEmail,
          userId,
          status: 'created',
          oneRosterStatus: 'failed',
          message: `User created in DB but failed in OneRoster: ${oneRosterResult.message}`
        };
      }
    } catch (oneRosterError) {
      console.error(`Error during OneRoster creation for user ${normalizedEmail} (${userId}):`, oneRosterError);
      
      return {
        email: normalizedEmail,
        userId,
        status: 'created',
        oneRosterStatus: 'failed',
        message: `User created in DB but error in OneRoster: ${oneRosterError instanceof Error ? oneRosterError.message : String(oneRosterError)}`
      };
    }
  } catch (error) {
    console.error(`Error creating user ${userInfo.email}:`, error);
    
    return {
      email: userInfo.email,
      userId: userInfo.userId || 'unknown',
      status: 'failed',
      message: `Error creating user: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Process a batch of users for creation
 */
export async function processUsers(users: UserCreationRequest['users']): Promise<UserCreationResponse> {
  // Stats
  let totalProcessed = 0;
  let created = 0;
  let alreadyExisting = 0;
  let failed = 0;
  const details: UserCreationResult[] = [];
  
  // Process each user
  for (const userRequest of users) {
    totalProcessed++;
    const email = userRequest.email.toLowerCase();
    
    try {
      // Check if user exists
      const exists = await userExists(email);
      
      if (exists) {
        console.log(`User ${email} already exists, skipping...`);
        details.push({
          email,
          userId: userRequest.userId || 'n/a',
          status: 'existing',
          message: 'User already exists in the system'
        });
        alreadyExisting++;
      } else {
        // Create the user
        const userInfo: UserInfo = {
          userId: userRequest.userId || uuidv4(),
          email,
          trackId: userRequest.trackId || undefined,
          grade: userRequest.grade !== undefined ? userRequest.grade : DEFAULT_GRADE,
          name: userRequest.name,
          campus: userRequest.campus
        };
        
        const result = await createUser(userInfo);
        details.push(result);
        
        if (result.status === 'created') {
          created++;
        } else {
          failed++;
        }
      }
    } catch (error) {
      console.error(`Failed to process user ${email}:`, error);
      details.push({
        email,
        userId: userRequest.userId || 'unknown',
        status: 'failed',
        message: `Error processing user: ${error instanceof Error ? error.message : String(error)}`
      });
      failed++;
    }
    
    // Add a small delay between processing users to avoid rate limiting
    if (totalProcessed < users.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return {
    success: failed === 0,
    message: `Processed ${totalProcessed} users: ${created} created, ${alreadyExisting} already existing, ${failed} failed`,
    results: {
      totalProcessed,
      created,
      alreadyExisting,
      failed,
      details
    }
  };
} 