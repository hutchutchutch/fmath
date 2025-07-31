/**
 * Script: updateUserGrades.ts
 * =============================
 * 
 * This script updates the focus tracks for specified users by their email addresses.
 * It uses the DynamoDB email index to find users, then updates their focusTrack field.
 * 
 * INSTRUCTIONS FOR USE:
 * --------------------
 * 1. Update the userTrackUpdates array with the list of users you want to update
 *    Each entry should include:
 *    - email: The user's email address
 *    - newTrack: The track to set
 *    - oldTrack: (optional) The previous track for logging purposes
 * 
 * 2. Run the script with:
 *    $ ts-node backend/src/scripts/updateUserGrades.ts
 * 
 * WHAT THE SCRIPT DOES:
 * --------------------
 * - Looks up each user by email in DynamoDB
 * - If the user exists, updates their focusTrack field
 * - Logs the results to console and a log file (track-update-log.txt)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: '../../.env' });

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

// Constants
const TABLE_NAME = process.env.TABLE_NAME || 'FastMath2';

// Interface for user track update data
interface UserTrackUpdate {
  email: string;
  newTrack: string;
  oldTrack?: string;  // Optional, for logging purposes
}

// List of users to update with their correct focus tracks
const userTrackUpdates: UserTrackUpdate[] = [
  { email: 'beau.stern@alpha.school', newTrack: 'TRACK12' },
  { email: 'patrick.henry@2hourlearning.com', newTrack: 'TRACK9' },
  { email: 'willa.rubenstein@alpha.school', newTrack: 'TRACK9' },
  { email: 'oslo.singer@alpha.school', newTrack: 'TRACK9' },
  { email: 'theodore.salgado-singer@alpha.school', newTrack: 'TRACK9' },
  { email: 'milam.morgan@alpha.school', newTrack: 'TRACK6' },
  { email: 'corinne.mcgowan@sportsacademy.school', newTrack: 'TRACK6' },
  { email: 'levi.reeves@sportsacademy.school', newTrack: 'TRACK6' },
  { email: 'tyiir.woods@novatio.school', newTrack: 'TRACK6' },
  { email: 'ava.rosellini@2hourlearning.com', newTrack: 'TRACK6' },
  { email: 'william.rosellini@2hourlearning.com', newTrack: 'TRACK8' }
];

/**
 * Find a user by email in DynamoDB
 */
async function findUserByEmail(email: string): Promise<{ userId?: string, found: boolean }> {
  try {
    // Normalize email
    const normalizedEmail = email.toLowerCase();
    
    // Check if user exists using QueryCommand with email-index
    const existingUser = await dynamoDB.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': normalizedEmail
      },
      Limit: 1
    }));

    if (existingUser.Items && existingUser.Items.length > 0) {
      return { 
        userId: existingUser.Items[0].userId,
        found: true
      };
    }
    
    return { found: false };
  } catch (error) {
    console.error(`Error finding user with email ${email}:`, error);
    throw error;
  }
}

/**
 * Update user's focus track in DynamoDB
 */
async function updateUserTrack(userId: string, newTrack: string): Promise<boolean> {
  try {
    await dynamoDB.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE'
      },
      UpdateExpression: 'SET focusTrack = :track',
      ExpressionAttributeValues: {
        ':track': newTrack
      }
    }));
    
    return true;
  } catch (error) {
    console.error(`Error updating focus track for user ${userId}:`, error);
    return false;
  }
}

/**
 * Process all users in the update list
 */
async function processUserTrackUpdates() {
  // Create log file
  const logStream = fs.createWriteStream('track-update-log.txt', { flags: 'a' });
  logStream.write(`\n===== Focus Track Update - ${new Date().toISOString()} =====\n`);
  
  // Count success/failure stats
  let usersFound = 0;
  let usersNotFound = 0;
  let updateSuccess = 0;
  let updateFailed = 0;
  
  console.log(`Processing ${userTrackUpdates.length} user track updates...`);
  logStream.write(`Found ${userTrackUpdates.length} users to process\n\n`);
  
  // Process each user
  for (let i = 0; i < userTrackUpdates.length; i++) {
    const userInfo = userTrackUpdates[i];
    const email = userInfo.email;
    const newTrack = userInfo.newTrack;
    
    console.log(`\n[${i+1}/${userTrackUpdates.length}] Processing user: ${email}`);
    logStream.write(`\n--- User ${i+1}/${userTrackUpdates.length} ---\n`);
    logStream.write(`Email: ${email}\n`);
    logStream.write(`Previous Track: ${userInfo.oldTrack || 'Unknown'}\n`);
    logStream.write(`New Track: ${newTrack}\n`);
    
    try {
      // Find user by email
      const userLookup = await findUserByEmail(email);
      
      if (!userLookup.found || !userLookup.userId) {
        console.log(`User ${email} not found, skipping...`);
        logStream.write(`Status: NOT FOUND\n`);
        usersNotFound++;
        continue;
      }
      
      usersFound++;
      const userId = userLookup.userId;
      
      // Update user's track
      const updateResult = await updateUserTrack(userId, newTrack);
      
      if (updateResult) {
        console.log(`Successfully updated focus track for user ${email} (${userId}) to ${newTrack}`);
        logStream.write(`Status: UPDATED (userId: ${userId})\n`);
        updateSuccess++;
      } else {
        console.error(`Failed to update focus track for user ${email} (${userId})`);
        logStream.write(`Status: UPDATE FAILED\n`);
        updateFailed++;
      }
    } catch (error) {
      console.error(`Error processing user ${email}:`, error);
      logStream.write(`Status: ERROR (${error instanceof Error ? error.message : 'Unknown error'})\n`);
      updateFailed++;
    }
    
    // Add a small delay between processing users
    if (i < userTrackUpdates.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  // Output summary
  const summary = `
===== Summary =====
- Users processed: ${userTrackUpdates.length}
- Users found: ${usersFound}
- Users not found: ${usersNotFound}
- Successful updates: ${updateSuccess}
- Failed updates: ${updateFailed}
==================
  `;
  
  console.log(summary);
  logStream.write(summary);
  logStream.end();
  
  console.log('\nLog saved to track-update-log.txt');
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('Starting script to update user focus tracks...');
    
    // Validation warnings
    if (userTrackUpdates.length === 0) {
      console.error('ERROR: No users provided in userTrackUpdates. Please add users before running the script.');
      process.exit(1);
    }
    
    await processUserTrackUpdates();
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