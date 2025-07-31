import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { Fact } from '../types';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'FastMath2';

// Generate subtraction facts for track 8 (single-digit subtrahends from minuends 0-20)
function generateTrack8Facts(): Fact[] {
  const facts: Fact[] = [];
  let factId = 1243; // Starting factId (adjust based on your existing facts)
  
  // For each minuend from 0 to 20
  for (let minuend = 0; minuend <= 20; minuend++) {
    // For each subtrahend from 0 to 9, where subtrahend <= minuend
    for (let subtrahend = 0; subtrahend <= 9 && subtrahend <= minuend; subtrahend++) {
      const difference = minuend - subtrahend;
      
      facts.push({
        PK: `FACT#FACT${factId}`,
        SK: 'METADATA',
        factId: `FACT${factId}`,
        operation: 'subtraction',
        operand1: minuend,
        operand2: subtrahend,
        result: difference
      });
      
      factId++;
    }
  }

  return facts;
}

async function insertFacts(facts: Fact[]) {
  const batchSize = 25; // DynamoDB batch write limit
  const batches = [];
  
  // Split facts into batches of 25
  for (let i = 0; i < facts.length; i += batchSize) {
    batches.push(facts.slice(i, i + batchSize));
  }
  
  // Process each batch
  for (const batch of batches) {
    const command = new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: batch.map(fact => ({
          PutRequest: {
            Item: fact
          }
        }))
      }
    });
    
    try {
      await docClient.send(command);
      console.log(`Successfully inserted batch of ${batch.length} facts`);
    } catch (error) {
      console.error('Error inserting batch:', error);
      throw error;
    }
  }
}

async function main() {
  try {
    const facts = generateTrack8Facts();
    console.log(`Generated ${facts.length} facts`);
    
    await insertFacts(facts);
    console.log('Successfully inserted all facts');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 