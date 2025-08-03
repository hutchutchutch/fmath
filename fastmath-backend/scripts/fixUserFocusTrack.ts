import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'FastMath2';

async function getUserProfile(userId: string) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE'
      }
    }));
    
    return result.Item;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
}

async function updateUserFocusTrack(userId: string, focusTrack: string) {
  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE'
      },
      UpdateExpression: 'SET focusTrack = :focusTrack',
      ExpressionAttributeValues: {
        ':focusTrack': focusTrack
      },
      ReturnValues: 'ALL_NEW'
    }));
    
    return result.Attributes;
  } catch (error) {
    console.error('Error updating user focus track:', error);
    throw error;
  }
}

async function main() {
  console.log('=== Fixing User Focus Track ===\n');
  
  // Check for AWS credentials
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ AWS credentials not found in environment variables!');
    console.error('\nPlease set the following environment variables:');
    console.error('- AWS_ACCESS_KEY_ID');
    console.error('- AWS_SECRET_ACCESS_KEY');
    console.error('- AWS_REGION (optional, defaults to us-east-1)');
    process.exit(1);
  }
  
  // The user ID from the logs
  const userId = 'b1dc6b58-7306-4bcb-8e7a-b2c110d12d32';
  
  try {
    // Step 1: Get current user profile
    console.log('Step 1: Fetching current user profile...');
    const userProfile = await getUserProfile(userId);
    
    if (!userProfile) {
      console.error('❌ User profile not found!');
      process.exit(1);
    }
    
    console.log('\nCurrent user profile:');
    console.log(`- Email: ${userProfile.email}`);
    console.log(`- Name: ${userProfile.name || 'Not set'}`);
    console.log(`- Age/Grade: ${userProfile.ageGrade || 'Not set'}`);
    console.log(`- Focus Track: ${userProfile.focusTrack || 'NULL (this is the problem!)'}`);
    console.log(`- Current Track: ${userProfile.currentTrack || 'Not set'}`);
    
    // Step 2: Update focus track
    console.log('\nStep 2: Updating focus track to ALL...');
    const updatedProfile = await updateUserFocusTrack(userId, 'ALL');
    
    console.log('\n✅ Successfully updated user profile!');
    console.log('\nUpdated profile:');
    console.log(`- Focus Track: ${updatedProfile.focusTrack}`);
    
    console.log('\n📝 Note: Setting focusTrack to "ALL" allows the user to access all tracks.');
    console.log('The onboarding assessment will guide them through the appropriate track selection.');
    
  } catch (error) {
    console.error('\n❌ Error fixing user focus track:', error);
    process.exit(1);
  }
}

// Run the script
main();