#!/usr/bin/env ts-node

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.SESSION_TABLE || 'FastMath2';

async function main() {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 180);

  const sessions: any[] = [];
  let lastEvaluatedKey: any = null;

  do {
    const params: any = {
      TableName: TABLE_NAME,
      FilterExpression: '#sk = :sessionSK AND #startTime BETWEEN :fromDate AND :toDate',
      ExpressionAttributeNames: { '#sk': 'SK', '#startTime': 'startTime' },
      ExpressionAttributeValues: {
        ':sessionSK': 'SESSION',
        ':fromDate': fromDate.toISOString(),
        ':toDate': toDate.toISOString()
      }
    };
    
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }
    
    const result = await dynamoDB.send(new ScanCommand(params));
    
    if (result.Items) sessions.push(...result.Items);
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  const userDays = new Map();

  sessions.forEach(session => {
    const userId = session.PK.split('#')[1];
    const date = session.startTime.split('T')[0];
    const key = `${userId}:${date}`;

    if (!userDays.has(key)) {
      userDays.set(key, {
        totalTime: 0,
        learningTime: 0,
        accuracyPracticeTime: 0,
        fluency6PracticeTime: 0,
        fluency3PracticeTime: 0,
        fluency2PracticeTime: 0,
        fluency1_5PracticeTime: 0,
        fluency1PracticeTime: 0,
        assessmentTime: 0,
        otherTime: 0,
        pages: 0,
        facts: new Set()
      });
    }

    const day = userDays.get(key);
    day.totalTime += session.totalDuration || 0;
    day.learningTime += session.learningTime || 0;
    day.accuracyPracticeTime += session.accuracyPracticeTime || 0;
    day.fluency6PracticeTime += session.fluency6PracticeTime || 0;
    day.fluency3PracticeTime += session.fluency3PracticeTime || 0;
    day.fluency2PracticeTime += session.fluency2PracticeTime || 0;
    day.fluency1_5PracticeTime += session.fluency1_5PracticeTime || 0;
    day.fluency1PracticeTime += session.fluency1PracticeTime || 0;
    day.assessmentTime += session.assessmentTime || 0;
    day.otherTime += session.otherTime || 0;
    day.pages += (session.pageTransitions || []).length;

    if (session.factsCovered) {
      Object.values(session.factsCovered).forEach((facts: any) => {
        if (Array.isArray(facts)) {
          facts.forEach((fact: any) => {
            const factId = typeof fact === 'string' ? fact : fact.factId;
            if (factId) day.facts.add(factId);
          });
        }
      });
    }

    if (session.pageTransitions) {
      session.pageTransitions.forEach((transition: any) => {
        if (transition.factsByStage) {
          Object.values(transition.factsByStage).forEach((facts: any) => {
            if (Array.isArray(facts)) {
              facts.forEach((factId: string) => day.facts.add(factId));
            }
          });
        }
      });
    }
  });

  const days = Array.from(userDays.values());
  const count = days.length;

  if (count === 0) {
    console.log('No data found');
    return;
  }

  console.log('Average time per user per day (seconds):');
  console.log(`Total: ${(days.reduce((sum, day) => sum + day.totalTime, 0) / count).toFixed(1)}`);
  console.log(`Learning: ${(days.reduce((sum, day) => sum + day.learningTime, 0) / count).toFixed(1)}`);
  console.log(`Accuracy Practice: ${(days.reduce((sum, day) => sum + day.accuracyPracticeTime, 0) / count).toFixed(1)}`);
  console.log(`Fluency 6s: ${(days.reduce((sum, day) => sum + day.fluency6PracticeTime, 0) / count).toFixed(1)}`);
  console.log(`Fluency 3s: ${(days.reduce((sum, day) => sum + day.fluency3PracticeTime, 0) / count).toFixed(1)}`);
  console.log(`Fluency 2s: ${(days.reduce((sum, day) => sum + day.fluency2PracticeTime, 0) / count).toFixed(1)}`);
  console.log(`Fluency 1.5s: ${(days.reduce((sum, day) => sum + day.fluency1_5PracticeTime, 0) / count).toFixed(1)}`);
  console.log(`Fluency 1s: ${(days.reduce((sum, day) => sum + day.fluency1PracticeTime, 0) / count).toFixed(1)}`);
  console.log(`Assessment: ${(days.reduce((sum, day) => sum + day.assessmentTime, 0) / count).toFixed(1)}`);
  console.log(`Other: ${(days.reduce((sum, day) => sum + day.otherTime, 0) / count).toFixed(1)}`);

  console.log(`\nAverage pages per user per day: ${(days.reduce((sum, day) => sum + day.pages, 0) / count).toFixed(1)}`);

  console.log(`\nAverage facts per user per day: ${(days.reduce((sum, day) => sum + day.facts.size, 0) / count).toFixed(1)}`);
}

main().catch(console.error);