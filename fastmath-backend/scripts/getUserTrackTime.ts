import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../../.env' });

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);

// Constants
const SESSION_TABLE = process.env.SESSION_TABLE || 'FastMath2';

// Interface for user and track data
interface UserTrackData {
  userId: string;
  trackId: string;
}

async function getUserTrackTimeForDate() {
  // Target date: March 31st, 2025
  const targetDate = '2025-04-04T00:00:00.000Z';
  const nextDate = '2025-04-05T00:00:00.000Z';
  
  // List of users and their tracks
  const userTrackList: UserTrackData[] = [
    { userId: '0cc40817-0c74-425a-938a-ea6d04c71d60', trackId: 'TRACK3' },
    { userId: '609dc454-aa01-4ba4-b8b-07b4388133c6', trackId: 'TRACK1' },
    { userId: '7395e99d-a213-48b7-b1a1-067816083f3b', trackId: 'TRACK2' },
    { userId: 'd100d2f7-eb88-4f1d-9e63-baaba95654de', trackId: 'TRACK1' },
    { userId: 'bf0fd274-6064-4824-9eaf-f6978a1b5276', trackId: 'TRACK1' },
    { userId: '2b43fe6c-abfe-4f5c-8405-ee19140078d3', trackId: 'TRACK1' },
    { userId: 'ffb93b38-50af-4836-9e46-5c76dee51193', trackId: 'TRACK1' },
    { userId: 'e28937fa-e86a-4e3e-881d-5b288760050b', trackId: 'TRACK2' },
    { userId: '5ed72957-0099-4ea4-af68-1491d49a89f0', trackId: 'TRACK1' },
    { userId: 'e0fcc6b9-9db1-4792-a6aa-0d1d4da8a57f', trackId: 'TRACK2' },
    { userId: 'dd84d285-a260-42ea-8aea-3a6925286bbf', trackId: 'TRACK1' },
    { userId: 'ef437d2a-10d5-4819-aa47-9ca5c6ed9bbc', trackId: 'TRACK2' },
    { userId: '61808df0-7da3-4afc-9eb2-f287532e0f93', trackId: 'TRACK1' },
    { userId: 'ef2fb0cf-40eb-47d8-ad74-222bc18646a9', trackId: 'TRACK1' },
    { userId: '6e4285bb-f26f-4f60-b4e9-cb3641b94c82', trackId: 'TRACK2' },
    { userId: '00e1bad8-e53b-422b-aae6-47ceb0fb9053', trackId: 'TRACK2' },
    { userId: '1599d5c3-17d9-4e7a-9352-4935cf6f78f5', trackId: 'TRACK2' },
    { userId: '3bda7314-1828-439a-965d-a41c17f87e32', trackId: 'TRACK1' },
    { userId: 'c44ca1f4-09bd-4c81-a9e0-49d844f657ff', trackId: 'TRACK1' },
    { userId: '7dd3f460-6fb1-4b84-bf00-a2d52d5b9e09', trackId: 'TRACK2' },
    { userId: 'f99e947e-e4c0-49c9-acd7-08b81590b8bc', trackId: 'TRACK2' },
    { userId: '663a5401-ec40-4b32-ab98-b4f32df70829', trackId: 'TRACK1' },
    { userId: 'd5e1f898-dca1-4274-860e-2df0bc1128b5', trackId: 'TRACK1' },
    { userId: '4000cc92-5321-4dfc-a7d1-f2004d6a2f90', trackId: 'TRACK3' },
    { userId: 'ffeac7ab-33f3-4ae3-a1eb-7967ba5fac96', trackId: 'TRACK4' },
    { userId: '7b276c16-c573-480f-962b-d92dc2d8e160', trackId: 'TRACK1' },
    { userId: '02d66def-08c2-425e-92b5-24dd8836db67', trackId: 'TRACK2' },
    { userId: 'ed089064-ae5c-48f8-b632-e82f25807d5b', trackId: 'TRACK2' },
    { userId: 'b7f1d41f-9385-4908-bb1e-4ccf59c93aec', trackId: 'TRACK1' },
    { userId: '138ef3ce-2f66-4b83-801d-893c119a01ca', trackId: 'TRACK2' },
    { userId: '5db81eab-f06f-421e-a897-6dbf82f1e091', trackId: 'TRACK1' },
    { userId: '2e9f82d7-2335-4305-9394-d5695fb5cb5f', trackId: 'TRACK1' },
    { userId: '57fe8ecf-a6f0-4359-8ab2-b1c9fc66d01b', trackId: 'TRACK2' },
    { userId: 'a3cec910-95d2-4c59-85e3-10e58289c42a', trackId: 'TRACK1' },
    { userId: 'b6fa7128-f641-4efd-9075-375411fd6c39', trackId: 'TRACK2' },
    { userId: 'a324eba3-a343-4e41-88e6-0d92ec9ad88d', trackId: 'TRACK1' },
    { userId: '36f6a826-59f7-4fc1-984a-ada623affdcd', trackId: 'TRACK2' },
    { userId: '63426c35-134a-4669-a900-b5133f9da42c', trackId: 'TRACK1' },
    { userId: '63426c35-134a-4669-a900-b5133f9da42c', trackId: 'TRACK2' },
    { userId: '63426c35-134a-4669-a900-b5133f9da42c', trackId: 'TRACK3' },
    { userId: '63426c35-134a-4669-a900-b5133f9da42c', trackId: 'TRACK4' },
    { userId: '7fa92d47-0386-45e1-82ad-ea747a6b1ed2', trackId: 'TRACK1' },
    { userId: '7fa92d47-0386-45e1-82ad-ea747a6b1ed2', trackId: 'TRACK2' },
    { userId: '7fa92d47-0386-45e1-82ad-ea747a6b1ed2', trackId: 'TRACK3' },
    { userId: '7fa92d47-0386-45e1-82ad-ea747a6b1ed2', trackId: 'TRACK4' },
    { userId: '42181f3a-3437-4600-8723-28afefc5e9c0', trackId: 'TRACK1' },
    { userId: '42181f3a-3437-4600-8723-28afefc5e9c0', trackId: 'TRACK2' },
    { userId: '42181f3a-3437-4600-8723-28afefc5e9c0', trackId: 'TRACK3' },
    { userId: '42181f3a-3437-4600-8723-28afefc5e9c0', trackId: 'TRACK4' },
    { userId: '8bcc71d5-d722-4776-9caa-f00c3906704e', trackId: 'TRACK1' },
    { userId: '8bcc71d5-d722-4776-9caa-f00c3906704e', trackId: 'TRACK2' },
    { userId: '8bcc71d5-d722-4776-9caa-f00c3906704e', trackId: 'TRACK3' },
    { userId: '8bcc71d5-d722-4776-9caa-f00c3906704e', trackId: 'TRACK4' },
    { userId: '6f72323c-d4ef-4c10-a697-b820191dffd0', trackId: 'TRACK1' },
    { userId: '6f72323c-d4ef-4c10-a697-b820191dffd0', trackId: 'TRACK2' },
    { userId: '6f72323c-d4ef-4c10-a697-b820191dffd0', trackId: 'TRACK3' },
    { userId: '6f72323c-d4ef-4c10-a697-b820191dffd0', trackId: 'TRACK4' },
    { userId: '48a7b263-edc3-4582-89fb-5cd6cfd337e2', trackId: 'TRACK1' },
    { userId: '48a7b263-edc3-4582-89fb-5cd6cfd337e2', trackId: 'TRACK2' },
    { userId: '48a7b263-edc3-4582-89fb-5cd6cfd337e2', trackId: 'TRACK3' },
    { userId: '48a7b263-edc3-4582-89fb-5cd6cfd337e2', trackId: 'TRACK4' },
  ];

  console.log(`\nUser Activity Report for March 31st, 2025\n`);
  
  // Print table header
  console.log('╔════════════════════════════════════╦═════════╦════════════════╗');
  console.log('║ User ID                            ║ Track   ║ Total Time (s) ║');
  console.log('╠════════════════════════════════════╬═════════╬════════════════╣');

  // Get data for each user-track combination
  for (const userTrack of userTrackList) {
    try {
      // Query for sessions with this userId and trackId within the date range
      const result = await dynamoDB.send(new QueryCommand({
        TableName: SESSION_TABLE,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        FilterExpression: 'SK = :sk AND startTime BETWEEN :startDate AND :endDate',
        ExpressionAttributeValues: {
          ':userId': userTrack.userId,
          ':sk': `SESSION#${userTrack.trackId}`,
          ':startDate': targetDate,
          ':endDate': nextDate
        }
      }));

      // Calculate total time spent
      let totalTimeSpent = 0;
      if (result.Items && result.Items.length > 0) {
        result.Items.forEach(item => {
          if (item.totalDuration) {
            totalTimeSpent += item.totalDuration;
          }
        });
      }

      // Format and print the result
      const userId = userTrack.userId.padEnd(36);
      const trackId = userTrack.trackId.padEnd(7);
      const timeStr = totalTimeSpent.toString().padEnd(14);
      
      console.log(`║ ${userId} ║ ${trackId} ║ ${timeStr} ║`);
    } catch (error) {
      console.error(`Error getting data for user ${userTrack.userId}:`, error);
      
      // Format and print error
      const userId = userTrack.userId.padEnd(36);
      const trackId = userTrack.trackId.padEnd(7);
      const timeStr = 'ERROR'.padEnd(14);
      
      console.log(`║ ${userId} ║ ${trackId} ║ ${timeStr} ║`);
    }
  }
  
  // Print table footer
  console.log('╚════════════════════════════════════╩═════════╩════════════════╝');
}

// Execute the function
getUserTrackTimeForDate().catch(error => {
  console.error('Script execution failed:', error);
});
