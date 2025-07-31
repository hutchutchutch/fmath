import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { UserProgress, FactProgress } from '../types/progress';
import { TRACK_RANGES } from '../types/constants';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});
const TABLE_NAME = 'FastMath2';

// CONFIGURE THESE VALUES
const USER_ID = "4db1373b-3331-47fc-97d3-9cec58e1026a"; // Add user ID here
const TRACK_ID = "TRACK8"; // Add track ID here

// Maximum number of facts to update in a single batch
const BATCH_SIZE = 25;

if (!USER_ID || !TRACK_ID) {
    console.error('Please provide user ID and track ID in the script');
    process.exit(1);
}

// Generate all fact IDs for a track
function generateFactIdsForTrack(trackId: string): string[] {
    if (!TRACK_RANGES[trackId as keyof typeof TRACK_RANGES]) {
        console.error(`Invalid track ID: ${trackId}`);
        process.exit(1);
    }
    
    const [start, end] = TRACK_RANGES[trackId as keyof typeof TRACK_RANGES];
    const factIds: string[] = [];
    
    for (let i = start; i <= end; i++) {
        factIds.push(`FACT${i}`);
    }
    
    return factIds;
}

// Create a default fact progress object
function createDefaultFactProgress(): FactProgress {
    const now = new Date().toISOString();
    return {
        status: 'mastered',
        attempts: 1,
        correct: 1,
        cqpm: 60, // Reasonable default
        accuracyRate: 100,
        timeSpent: 1000, // 1 second
        lastAttemptDate: now,
        statusUpdatedDate: now
    };
}

async function getProgressForUser(userId: string, trackId: string): Promise<UserProgress | null> {
    const params = {
        TableName: TABLE_NAME,
        Key: {
            PK: `USER#${userId}`,
            SK: `PROGRESS#${trackId}`
        }
    };
    
    try {
        const result = await dynamoDB.send(new GetCommand(params));
        return result.Item as UserProgress || null;
    } catch (error) {
        console.error('Error fetching user progress:', error);
        return null;
    }
}

// Create a new progress object if none exists
async function createNewProgress(
    userId: string,
    trackId: string,
    factIds: string[]
): Promise<boolean> {
    const now = new Date().toISOString();
    
    // Create the basic progress object (without facts)
    const newProgress: UserProgress = {
        PK: `USER#${userId}`,
        SK: `PROGRESS#${trackId}`,
        trackId,
        startDate: now,
        lastUpdated: now,
        status: 'in_progress',
        overallCQPM: 0,
        accuracyRate: 0,
        facts: {}
    };
    
    try {
        // First, create the progress structure without facts
        await dynamoDB.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `USER#${userId}`,
                SK: `PROGRESS#${trackId}`
            },
            UpdateExpression: 'SET #trackId = :trackId, #startDate = :startDate, #lastUpdated = :lastUpdated, ' +
                            '#status = :status, #overallCQPM = :overallCQPM, #accuracyRate = :accuracyRate, ' +
                            '#facts = :facts',
            ExpressionAttributeNames: {
                '#trackId': 'trackId',
                '#startDate': 'startDate',
                '#lastUpdated': 'lastUpdated',
                '#status': 'status',
                '#overallCQPM': 'overallCQPM',
                '#accuracyRate': 'accuracyRate',
                '#facts': 'facts'
            },
            ExpressionAttributeValues: {
                ':trackId': newProgress.trackId,
                ':startDate': newProgress.startDate,
                ':lastUpdated': newProgress.lastUpdated,
                ':status': newProgress.status,
                ':overallCQPM': newProgress.overallCQPM,
                ':accuracyRate': newProgress.accuracyRate,
                ':facts': {}
            }
        }));
        
        // Now add facts in batches
        const batches = [];
        for (let i = 0; i < factIds.length; i += BATCH_SIZE) {
            batches.push(factIds.slice(i, i + BATCH_SIZE));
        }
        
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(`Processing batch ${i+1}/${batches.length} (${batch.length} facts)`);
            
            const updateExpressions: string[] = [];
            const expressionAttributeValues: Record<string, any> = {
                ':lastUpdated': now
            };
            const expressionAttributeNames: Record<string, string> = {
                '#lastUpdated': 'lastUpdated',
                '#facts': 'facts'
            };
            
            // Process facts in this batch
            batch.forEach((factId, index) => {
                const factPath = `#facts.#fact${index}`;
                const factValueKey = `:fact${index}`;
                
                expressionAttributeNames[`#fact${index}`] = factId;
                expressionAttributeValues[factValueKey] = createDefaultFactProgress();
                
                updateExpressions.push(`${factPath} = ${factValueKey}`);
            });
            
            const updateExpression = `SET #lastUpdated = :lastUpdated, ${updateExpressions.join(', ')}`;
            
            await dynamoDB.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: {
                    PK: `USER#${userId}`,
                    SK: `PROGRESS#${trackId}`
                },
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues
            }));
        }
        
        return true;
    } catch (error) {
        console.error('Error creating progress:', error);
        return false;
    }
}

// Update existing progress with batched facts
async function updateExistingProgress(
    userId: string,
    trackId: string,
    existingProgress: UserProgress,
    factIds: string[]
): Promise<boolean> {
    const now = new Date().toISOString();
    
    try {
        // Split facts into batches
        const batches = [];
        for (let i = 0; i < factIds.length; i += BATCH_SIZE) {
            batches.push(factIds.slice(i, i + BATCH_SIZE));
        }
        
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(`Processing batch ${i+1}/${batches.length} (${batch.length} facts)`);
            
            const updateExpressions: string[] = [];
            const expressionAttributeValues: Record<string, any> = {
                ':lastUpdated': now
            };
            const expressionAttributeNames: Record<string, string> = {
                '#lastUpdated': 'lastUpdated',
                '#facts': 'facts'
            };
            
            // Process facts in this batch
            batch.forEach((factId, index) => {
                const factPath = `#facts.#fact${index}`;
                const factValueKey = `:fact${index}`;
                
                expressionAttributeNames[`#fact${index}`] = factId;
                
                // If fact exists in progress, update only its status to 'mastered'
                if (existingProgress.facts[factId]) {
                    expressionAttributeValues[factValueKey] = {
                        ...existingProgress.facts[factId],
                        status: 'mastered',
                        statusUpdatedDate: now
                    };
                } 
                // If fact doesn't exist, create a new default fact progress
                else {
                    expressionAttributeValues[factValueKey] = createDefaultFactProgress();
                }
                
                updateExpressions.push(`${factPath} = ${factValueKey}`);
            });
            
            const updateExpression = `SET #lastUpdated = :lastUpdated, ${updateExpressions.join(', ')}`;
            
            await dynamoDB.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: {
                    PK: `USER#${userId}`,
                    SK: `PROGRESS#${trackId}`
                },
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues
            }));
        }
        
        return true;
    } catch (error) {
        console.error('Error updating fact statuses:', error);
        return false;
    }
}

async function main() {
    console.log(`Setting all facts to mastered for user ${USER_ID} on track ${TRACK_ID}`);
    
    // Generate all fact IDs for the track
    const factIds = generateFactIdsForTrack(TRACK_ID);
    console.log(`Generated ${factIds.length} fact IDs for track ${TRACK_ID}`);
    
    // Get current progress
    const progress = await getProgressForUser(USER_ID, TRACK_ID);
    
    let success = false;
    
    if (progress) {
        console.log(`Found existing progress with ${Object.keys(progress.facts).length} facts`);
        success = await updateExistingProgress(USER_ID, TRACK_ID, progress, factIds);
    } else {
        console.log(`No existing progress found for user ${USER_ID} on track ${TRACK_ID}, will create new progress`);
        success = await createNewProgress(USER_ID, TRACK_ID, factIds);
    }
    
    if (success) {
        console.log(`Successfully updated all ${factIds.length} facts to mastered for user ${USER_ID} on track ${TRACK_ID}`);
    } else {
        console.error(`Failed to update facts for user ${USER_ID} on track ${TRACK_ID}`);
    }
}

main().catch(console.error); 