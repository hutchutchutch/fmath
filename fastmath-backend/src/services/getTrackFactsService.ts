import { GetCommand, ScanCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDB } from '../config/aws';

const TABLE_NAME = 'FastMath2';

export async function getTrackFacts(trackId: string) {
  try {
    // Get track metadata first
    const trackResult = await dynamoDB.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `TRACK#${trackId}`,
        SK: 'METADATA'
      }
    }));

    if (!trackResult.Item) {
      throw new Error(`Track ${trackId} not found`);
    }

    const { minFactId, maxFactId } = trackResult.Item;

    // Extract numbers from minFactId and maxFactId
    const minNum = parseInt(minFactId.replace(/\D/g, ''));
    const maxNum = parseInt(maxFactId.replace(/\D/g, ''));

    // Use getFactsInRange to efficiently fetch all facts in the range
    // This ensures we get all facts within the range without pagination issues
    const facts = await getFactsInRange(minNum, maxNum);
    
    return facts;
  } catch (error) {
    console.error('Error fetching track facts:', error);
    throw error;
  }
}

/**
 * Gets facts within a specific ID range, more efficient than getting all facts and filtering
 * @param minFactId The minimum fact ID to include
 * @param maxFactId The maximum fact ID to include
 * @returns Array of facts within the specified range
 */
export async function getFactsInRange(minFactId: number, maxFactId: number) {
  try {
    // Create an array of fact IDs to fetch
    const factIds = [];
    for (let i = minFactId; i <= maxFactId; i++) {
      factIds.push(`FACT#FACT${i}`);
    }
    
    // DynamoDB doesn't support IN conditions for partition keys in Query operations,
    // so we need to use a batch get or multiple gets
    
    // For small ranges, we can do a BatchGetItem
    // For larger ranges, we might need to split into multiple BatchGetItem operations
    // DynamoDB has a limit of 100 items per BatchGetItem
    
    const batchSize = 100;
    const batches = [];
    
    for (let i = 0; i < factIds.length; i += batchSize) {
      const batch = factIds.slice(i, i + batchSize);
      batches.push(batch);
    }
    
    // Process all batches
    const allFacts = [];
    
    for (const batch of batches) {
      const keys = batch.map(factId => ({
        PK: factId,
        SK: 'METADATA'
      }));
      
      const batchGetParams = {
        RequestItems: {
          [TABLE_NAME]: {
            Keys: keys
          }
        }
      };
      
      const result = await dynamoDB.send(new BatchGetCommand(batchGetParams));
      
      if (result && result.Responses && result.Responses[TABLE_NAME]) {
        allFacts.push(...result.Responses[TABLE_NAME]);
      }
    }
    
    return allFacts;
  } catch (error) {
    console.error('Error fetching facts in range:', error);
    throw error;
  }
}