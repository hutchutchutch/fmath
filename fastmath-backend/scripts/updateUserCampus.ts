/**
 * Script: updateUserCampus.ts
 * ============================
 * 
 * This script adds a new "campus" field to existing user profiles.
 * It uses the DynamoDB to find users by their userId and updates their profile with the campus information.
 * 
 * INSTRUCTIONS FOR USE:
 * --------------------
 * 1. The userCampusUpdates array is pre-populated with the provided user data
 *    Each entry includes:
 *    - userId: The user's unique identifier
 *    - campus: The campus name to be assigned
 * 
 * 2. Run the script with:
 *    $ ts-node backend/src/scripts/updateUserCampus.ts
 * 
 * WHAT THE SCRIPT DOES:
 * --------------------
 * - Looks up each user by userId in DynamoDB
 * - If the user exists, adds/updates their campus field
 * - Logs the results to console and a log file (campus-update-log.txt)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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

// Interface for user campus update data
interface UserCampusUpdate {
  userId: string;
  campus: string;
}

// List of users to update with their campus information
const userCampusUpdates: UserCampusUpdate[] = [
  { userId: '498f123f-fa6d-4176-a6d2-1ca6aa9f2655', campus: 'Texas Preparatory School' },
  { userId: 'd106e338-b3ce-41b8-9f70-6e22b79b09cb', campus: 'Colearn Academy' },
  { userId: '25e76b68-acc3-46ff-88b0-575cab45178f', campus: 'Alpha Miami' },
  { userId: '55f82e79-9a6b-4ac0-aa5f-ac4b88d36350', campus: 'Single-user 2hr learning' },
  { userId: '42181f3a-3437-4600-8723-28afefc5e9c0', campus: 'Austin K-8' },
  { userId: '25c5cec4-4f5f-4c71-b87f-92bd04b98d5b', campus: 'Sports Academy: Lakeway' },
  { userId: '8d0f6c9a-1be8-4b05-ae3c-79013cbb5258', campus: 'Texas Preparatory School' },
  { userId: '34234a7a-38bc-45a9-97e6-8a7ccc7ba6ba', campus: 'Texas Preparatory School' },
  { userId: 'c424c7b3-a22c-4370-99e0-70bb1bb589ef', campus: 'Texas Preparatory School' },
  { userId: '96bff6f4-1d8b-48a7-bc5b-166aec53f589', campus: 'Alpha High School' },
  { userId: '95a31769-75cf-4069-9958-8f0b5fac4dd4', campus: 'Alpha Miami' },
  { userId: '626bffaa-2383-4203-84c5-e3f0d4c37e65', campus: 'Alpha Fort Worth' },
  { userId: 'ef76e3ff-70d8-4771-8e2e-5b7dc16717c6', campus: 'Austin K-8' },
  { userId: '34d5d914-8f22-4485-afee-83af1c30f1dd', campus: 'Austin K-8' },
  { userId: 'b6fa7128-f641-4efd-9075-375411fd6c39', campus: 'Austin K-8' },
  { userId: 'e45b5beb-4c37-4616-a15b-e1ac1ab73193', campus: 'Alpha High School' },
  { userId: '146a8313-eded-4c9f-a321-c3e69b99be61', campus: 'Vita High School' },
  { userId: '9741628c-7133-4e2e-94bb-f95efc770fae', campus: 'Austin K-8' },
  { userId: '9ed6f676-f695-40b2-af49-c28c0a47ce91', campus: 'GT School: Georgetown TX' },
  { userId: '32db468c-b42b-4701-b166-b5b74c3763c4', campus: 'Alpha West Palm Beach' },
  { userId: 'f3d5984e-a208-4013-8686-6e6ad77fb7a7', campus: 'Brownsville K-8' },
  { userId: '4e38e1f4-14e4-46e4-92d5-6c67332ecf1e', campus: 'Texas Preparatory School' },
  { userId: 'e0fcc6b9-9db1-4792-a6aa-0d1d4da8a57f', campus: 'Austin K-8' },
  { userId: 'e2b3964b-b280-47e6-b330-f0e216a09d87', campus: 'Alpha Miami' },
  { userId: 'ed089064-ae5c-48f8-b632-e82f25807d5b', campus: 'Austin K-8' },
  { userId: 'f73bf3bc-7a9e-4199-8b5c-ea4e54df9738', campus: 'Austin K-8' },
  { userId: '9efbef62-5c9a-4a77-9c3c-1c6321eedaf8', campus: 'Alpha Miami' },
  { userId: '62a49c2f-420d-4163-9c91-4570975866e1', campus: 'Colearn Academy' },
  { userId: 'cc07d5d2-62c9-4a6e-bfb7-bbfd882cdf00', campus: 'Austin K-8' },
  { userId: '321d8311-ec5d-498a-bc9a-0d4f429ef4e9', campus: 'Sports Academy: Lakeway' },
  { userId: '958fd368-a48a-426b-87cb-05585b25efa4', campus: 'Brownsville K-8' },
  { userId: 'd5e58b79-325d-482d-ab49-a4db2d8a5aa3', campus: 'Single-user 2hr learning' },
  { userId: '051cf892-d264-4484-8d5e-e10ad51615ab', campus: 'Austin K-8' },
  { userId: 'd693e856-979e-4255-80e9-f26a2169277f', campus: 'Single-user 2hr learning' },
  { userId: '63426c35-134a-4669-a900-b5133f9da42c', campus: 'Esports Academy: Austin' },
  { userId: '207a95d2-11b9-4f05-936e-e8b883ea576c', campus: 'Austin K-8' },
  { userId: 'b1593c1a-a7e7-45cd-869d-225928a0d698', campus: 'Texas Preparatory School' },
  { userId: 'e0cf8deb-29ab-4a20-a217-10bc6fb872bb', campus: 'Brownsville K-8' },
  { userId: '5fb4f721-295d-4d59-afe8-4ab4fcee3057', campus: 'Alpha Tampa' },
  { userId: '4928b448-1876-41ff-b90c-9f88c8a83023', campus: 'Austin K-8' },
  { userId: '651052cd-9ab3-4451-948f-f030b05f4112', campus: 'Alpha Miami' },
  { userId: 'c60d83ac-ab29-415f-a1aa-bf5f0cb1c1fc', campus: 'Alpha High School' },
  { userId: '764ac19e-cc25-448a-a0dd-79bf4364b1c2', campus: 'Alpha Miami' },
  { userId: 'f39de852-9a6c-4721-b60d-5ede15c203f6', campus: 'Austin K-8' },
  { userId: 'd42cb007-7c01-42d4-baf6-55437a34db0c', campus: 'Colearn Academy' },
  { userId: '4449739e-3913-4dcc-8b65-5154b1f2c9db', campus: 'Texas Preparatory School' },
  { userId: '3988a901-bc31-49d0-baee-dbd02cdb71ad', campus: 'Texas Preparatory School' },
  { userId: 'a8f802d1-36ea-41f8-a644-9c38e22fb0a3', campus: 'Austin K-8' },
  { userId: 'b3c94e03-5dbf-441d-81b9-7426ca19986c', campus: 'Austin K-8' },
  { userId: '7ddcbeb5-48eb-476b-b794-e93cbc7a56b0', campus: 'Alpha Miami' },
  { userId: 'd72af576-2c42-46af-aeae-5e5cd24e1f55', campus: 'GT School: Georgetown TX' },
  { userId: '1d60c88b-11e4-4ee1-a457-5c13ea7d4f78', campus: 'Brownsville K-8' },
  { userId: 'b0b2bc49-1d70-45cd-8aa2-5db2784f241b', campus: 'Alpha Fort Worth' },
  { userId: '5226187a-b243-4aa4-ad32-c95a0363f94a', campus: 'GT School: Georgetown TX' },
  { userId: 'fe9dbe0c-33c1-4916-a3c2-7d7cf0ea3692', campus: 'Sports Academy: Lakeway' },
  { userId: '0d92f705-1fc5-4dbc-b302-fefb62f51ab0', campus: 'Austin K-8' },
  { userId: '7ecf2c30-df6e-40ed-ba3a-349048a768ab', campus: 'Brownsville K-8' }
];

/**
 * Check if a user exists in DynamoDB
 */
async function checkUserExists(userId: string): Promise<{ exists: boolean, userEmail?: string }> {
  try {
    const userProfile = await dynamoDB.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE'
      }
    }));

    if (userProfile.Item) {
      return { 
        exists: true,
        userEmail: userProfile.Item.email
      };
    }
    
    return { exists: false };
  } catch (error) {
    console.error(`Error checking user with ID ${userId}:`, error);
    throw error;
  }
}

/**
 * Update user's campus in DynamoDB
 */
async function updateUserCampus(userId: string, campus: string): Promise<boolean> {
  try {
    await dynamoDB.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE'
      },
      UpdateExpression: 'SET campus = :campus',
      ExpressionAttributeValues: {
        ':campus': campus
      }
    }));
    
    return true;
  } catch (error) {
    console.error(`Error updating campus for user ${userId}:`, error);
    return false;
  }
}

/**
 * Process all users in the update list
 */
async function processUserCampusUpdates() {
  // Create log file
  const logStream = fs.createWriteStream('campus-update-log.txt', { flags: 'a' });
  logStream.write(`\n===== Campus Update - ${new Date().toISOString()} =====\n`);
  
  // Count success/failure stats
  let usersFound = 0;
  let usersNotFound = 0;
  let updateSuccess = 0;
  let updateFailed = 0;
  
  console.log(`Processing ${userCampusUpdates.length} user campus updates...`);
  logStream.write(`Found ${userCampusUpdates.length} users to process\n\n`);
  
  // Process each user
  for (let i = 0; i < userCampusUpdates.length; i++) {
    const userInfo = userCampusUpdates[i];
    const userId = userInfo.userId;
    const campus = userInfo.campus;
    
    console.log(`\n[${i+1}/${userCampusUpdates.length}] Processing user: ${userId}`);
    logStream.write(`\n--- User ${i+1}/${userCampusUpdates.length} ---\n`);
    logStream.write(`User ID: ${userId}\n`);
    logStream.write(`Campus: ${campus}\n`);
    
    try {
      // Check if user exists
      const userCheck = await checkUserExists(userId);
      
      if (!userCheck.exists) {
        console.log(`User ${userId} not found, skipping...`);
        logStream.write(`Status: NOT FOUND\n`);
        usersNotFound++;
        continue;
      }
      
      usersFound++;
      logStream.write(`Email: ${userCheck.userEmail || 'N/A'}\n`);
      
      // Update user's campus
      const updateResult = await updateUserCampus(userId, campus);
      
      if (updateResult) {
        console.log(`Successfully updated campus for user ${userId} to "${campus}"`);
        logStream.write(`Status: UPDATED\n`);
        updateSuccess++;
      } else {
        console.error(`Failed to update campus for user ${userId}`);
        logStream.write(`Status: UPDATE FAILED\n`);
        updateFailed++;
      }
    } catch (error) {
      console.error(`Error processing user ${userId}:`, error);
      logStream.write(`Status: ERROR (${error instanceof Error ? error.message : 'Unknown error'})\n`);
      updateFailed++;
    }
    
    // Add a small delay between processing users
    if (i < userCampusUpdates.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  // Output summary
  const summary = `
===== Summary =====
- Users processed: ${userCampusUpdates.length}
- Users found: ${usersFound}
- Users not found: ${usersNotFound}
- Successful updates: ${updateSuccess}
- Failed updates: ${updateFailed}
==================
  `;
  
  console.log(summary);
  logStream.write(summary);
  logStream.end();
  
  console.log('\nLog saved to campus-update-log.txt');
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('Starting script to update user campus information...');
    
    // Validation warnings
    if (userCampusUpdates.length === 0) {
      console.error('ERROR: No users provided in userCampusUpdates. Please add users before running the script.');
      process.exit(1);
    }
    
    await processUserCampusUpdates();
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