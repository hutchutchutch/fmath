import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'FastMath2';

interface Fact {
  PK: string;
  SK: string;
  factId: string;
  operation: string;
  operand1: number;
  operand2: number;
  result: number;
}

// Generate addition facts for TRACK12 (sums up to 10)
function generateTrack12Facts(): Fact[] {
  const facts: Fact[] = [];
  let factId = 1508; // Starting factId based on TRACK_RANGES
  
  // Generate all addition facts where sum <= 10
  for (let operand1 = 0; operand1 <= 10; operand1++) {
    for (let operand2 = 0; operand2 <= 10; operand2++) {
      const sum = operand1 + operand2;
      if (sum <= 10) {
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
  }
  
  return facts;
}

async function createTrackMetadata() {
  const trackMetadata = {
    PK: 'TRACK#TRACK12',
    SK: 'METADATA',
    trackId: 'TRACK12',
    trackName: 'Addition Within 10 (Sums up to 10)',
    description: 'Addition facts where the sum is 10 or less',
    minFactId: 'FACT1508',
    maxFactId: 'FACT1573',
    grade: 1,
    operation: 'addition',
    difficulty: 'beginner'
  };
  
  try {
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: trackMetadata
    }));
    console.log('✓ Created TRACK12 metadata');
  } catch (error) {
    console.error('Error creating track metadata:', error);
    throw error;
  }
}

async function insertFacts(facts: Fact[]) {
  const batchSize = 25; // DynamoDB batch write limit
  const batches = [];
  
  // Split facts into batches of 25
  for (let i = 0; i < facts.length; i += batchSize) {
    batches.push(facts.slice(i, i + batchSize));
  }
  
  console.log(`Inserting ${facts.length} facts in ${batches.length} batches...`);
  
  // Process each batch
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
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
      console.log(`✓ Inserted batch ${i + 1}/${batches.length} (${batch.length} facts)`);
    } catch (error) {
      console.error(`Error inserting batch ${i + 1}:`, error);
      throw error;
    }
  }
}

async function main() {
  console.log('=== Populating TRACK12 (Addition Within 10) ===\n');
  
  // Check for AWS credentials
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ AWS credentials not found in environment variables!');
    console.error('\nPlease set the following environment variables:');
    console.error('- AWS_ACCESS_KEY_ID');
    console.error('- AWS_SECRET_ACCESS_KEY');
    console.error('- AWS_REGION (optional, defaults to us-east-1)');
    console.error('\nExample:');
    console.error('export AWS_ACCESS_KEY_ID=your-access-key');
    console.error('export AWS_SECRET_ACCESS_KEY=your-secret-key');
    process.exit(1);
  }
  
  try {
    // Step 1: Create track metadata
    console.log('Step 1: Creating track metadata...');
    await createTrackMetadata();
    
    // Step 2: Generate facts
    console.log('\nStep 2: Generating facts...');
    const facts = generateTrack12Facts();
    console.log(`✓ Generated ${facts.length} facts`);
    
    // Display sample facts
    console.log('\nSample facts:');
    facts.slice(0, 5).forEach(fact => {
      console.log(`  ${fact.operand1} + ${fact.operand2} = ${fact.result}`);
    });
    console.log('  ...');
    
    // Step 3: Insert facts
    console.log('\nStep 3: Inserting facts into DynamoDB...');
    await insertFacts(facts);
    
    console.log('\n✅ Successfully populated TRACK12!');
    console.log('\nTrack summary:');
    console.log(`- Track ID: TRACK12`);
    console.log(`- Track Name: Addition Within 10 (Sums up to 10)`);
    console.log(`- Total Facts: ${facts.length}`);
    console.log(`- Fact ID Range: FACT1508 - FACT${1508 + facts.length - 1}`);
    
  } catch (error) {
    console.error('\n❌ Error populating TRACK12:', error);
    process.exit(1);
  }
}

// Run the script
main();