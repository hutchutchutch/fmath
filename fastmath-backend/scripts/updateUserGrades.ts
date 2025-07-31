/**
 * Script: updateUserGrades.ts
 * =============================
 * 
 * This script updates the grades for specified users by their email addresses.
 * It uses the DynamoDB email index to find users, then updates their ageGrade field.
 * 
 * INSTRUCTIONS FOR USE:
 * --------------------
 * 1. Update the userGradeUpdates array with the list of users you want to update
 *    Each entry should include:
 *    - email: The user's email address
 *    - newGrade: The grade to set
 *    - oldGrade: (optional) The previous grade for logging purposes
 * 
 * 2. Run the script with:
 *    $ ts-node backend/src/scripts/updateUserGrades.ts
 * 
 * WHAT THE SCRIPT DOES:
 * --------------------
 * - Looks up each user by email in DynamoDB
 * - If the user exists, updates their ageGrade field
 * - Logs the results to console and a log file (grade-update-log.txt)
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

// Interface for user grade update data
interface UserGradeUpdate {
  email: string;
  newGrade: number;
  oldGrade?: number;  // Optional, for logging purposes
}

// List of users to update with their correct grades
const userGradeUpdates: UserGradeUpdate[] = [
  { email: 'jay.lever@sportsacademy.school', newGrade: 1 },
  { email: 'beau.stern@alpha.school', newGrade: 1 },
  { email: 'patrick.henry@2hourlearning.com', newGrade: 2 },
  { email: 'willa.rubenstein@alpha.school', newGrade: 2 },
  { email: 'oslo.singer@alpha.school', newGrade: 2 },
  { email: 'milam.morgan@alpha.school', newGrade: 3 },
  { email: 'corinne.mcgowan@sportsacademy.school', newGrade: 3 },
  { email: 'levi.reeves@sportsacademy.school', newGrade: 3 },
  { email: 'kai.lever@sportsacademy.school', newGrade: 3 },
  { email: 'tyiir.woods@novatio.school', newGrade: 3 },
  { email: 'ozzie.lowe@alpha.school', newGrade: 4 },
  { email: 'ava.rosellini@2hourlearning.com', newGrade: 4 },
  { email: 'kaiden.szpitalak@alpha.school', newGrade: 5 },
  { email: 'johnny.darcy@alpha.school', newGrade: 5 },
  { email: 'william.rosellini@2hourlearning.com', newGrade: 5 },
  { email: 'penelope.marty@alpha.school', newGrade: 6 },
  { email: 'maxime.auvray@alpha.school', newGrade: 9 }
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
 * Update user's grade in DynamoDB
 */
async function updateUserGrade(userId: string, newGrade: number): Promise<boolean> {
  try {
    await dynamoDB.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE'
      },
      UpdateExpression: 'SET ageGrade = :grade',
      ExpressionAttributeValues: {
        ':grade': newGrade
      }
    }));
    
    return true;
  } catch (error) {
    console.error(`Error updating ageGrade for user ${userId}:`, error);
    return false;
  }
}

/**
 * Process all users in the update list
 */
async function processUserGradeUpdates() {
  // Create log file
  const logStream = fs.createWriteStream('grade-update-log.txt', { flags: 'a' });
  logStream.write(`\n===== Grade Update - ${new Date().toISOString()} =====\n`);
  
  // Count success/failure stats
  let usersFound = 0;
  let usersNotFound = 0;
  let updateSuccess = 0;
  let updateFailed = 0;
  
  console.log(`Processing ${userGradeUpdates.length} user grade updates...`);
  logStream.write(`Found ${userGradeUpdates.length} users to process\n\n`);
  
  // Process each user
  for (let i = 0; i < userGradeUpdates.length; i++) {
    const userInfo = userGradeUpdates[i];
    const email = userInfo.email;
    const newGrade = userInfo.newGrade;
    
    console.log(`\n[${i+1}/${userGradeUpdates.length}] Processing user: ${email}`);
    logStream.write(`\n--- User ${i+1}/${userGradeUpdates.length} ---\n`);
    logStream.write(`Email: ${email}\n`);
    logStream.write(`Previous Grade: ${userInfo.oldGrade !== undefined ? userInfo.oldGrade : 'Unknown'}\n`);
    logStream.write(`New Grade: ${newGrade}\n`);
    
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
      
      // Update user's grade
      const updateResult = await updateUserGrade(userId, newGrade);
      
      if (updateResult) {
        console.log(`Successfully updated grade for user ${email} (${userId}) to ${newGrade}`);
        logStream.write(`Status: UPDATED (userId: ${userId})\n`);
        updateSuccess++;
      } else {
        console.error(`Failed to update grade for user ${email} (${userId})`);
        logStream.write(`Status: UPDATE FAILED\n`);
        updateFailed++;
      }
    } catch (error) {
      console.error(`Error processing user ${email}:`, error);
      logStream.write(`Status: ERROR (${error instanceof Error ? error.message : 'Unknown error'})\n`);
      updateFailed++;
    }
    
    // Add a small delay between processing users
    if (i < userGradeUpdates.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  // Output summary
  const summary = `
===== Summary =====
- Users processed: ${userGradeUpdates.length}
- Users found: ${usersFound}
- Users not found: ${usersNotFound}
- Successful updates: ${updateSuccess}
- Failed updates: ${updateFailed}
==================
  `;
  
  console.log(summary);
  logStream.write(summary);
  logStream.end();
  
  console.log('\nLog saved to grade-update-log.txt');
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('Starting script to update user grades...');
    
    // Validation warnings
    if (userGradeUpdates.length === 0) {
      console.error('ERROR: No users provided in userGradeUpdates. Please add users before running the script.');
      process.exit(1);
    }
    
    await processUserGradeUpdates();
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