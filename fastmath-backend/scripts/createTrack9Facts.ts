import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { Fact } from '../types';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'FastMath2';

// Generate addition facts for track 9 (operands from 0 to 9)
function generateTrack9Facts(): Fact[] {
  const facts: Fact[] = [];
  let factId = 1143; // Starting factId (adjust based on your existing facts)
  
  // For each first operand from 0 to 9
  for (let operand1 = 0; operand1 <= 9; operand1++) {
    // For each second operand from 0 to 9
    for (let operand2 = 0; operand2 <= 9; operand2++) {
      const sum = operand1 + operand2;
      
      facts.push({
        PK: `FACT#FACT${factId}`,
        SK: 'METADATA',
        factId: `FACT${factId}`,
        operation: 'addition',
        operand1: operand1,
        operand2: operand2,
        result: sum
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
    const facts = generateTrack9Facts();
    console.log(`Generated ${facts.length} facts`);
    
    await insertFacts(facts);
    console.log('Successfully inserted all facts');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 