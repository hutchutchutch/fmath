import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { TRACK_RANGES } from '../src/types/constants';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});

const TABLE_NAME = 'FastMath2';

interface MigrationResult {
    userId: string;
    misplacedFacts: {
        factId: string;
        fromTrack: string;
        toTrack: string;
        factData: any;
    }[];
}

// Helper function to determine which track a fact belongs to
function getCorrectTrackForFact(factId: string): string | null {
    const factNumber = parseInt(factId.replace('FACT', ''));
    
    for (const [trackId, [min, max]] of Object.entries(TRACK_RANGES)) {
        if (factNumber >= min && factNumber <= max) {
            return trackId;
        }
    }
    
    return null;
}

// Helper function to check if a fact is in the correct track
function isFactInCorrectTrack(factId: string, trackId: string): boolean {
    const factNumber = parseInt(factId.replace('FACT', ''));
    const range = TRACK_RANGES[trackId as keyof typeof TRACK_RANGES];
    
    if (!range) {
        console.error(`Invalid track ID: ${trackId}`);
        return false;
    }
    
    const [min, max] = range;
    return factNumber >= min && factNumber <= max;
}

async function getAllUserProgress() {
    const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
    const allProgress = [];
    let lastEvaluatedKey = undefined;
    
    do {
        const params: any = {
            TableName: TABLE_NAME,
            FilterExpression: 'begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':sk': 'PROGRESS#'
            }
        };
        
        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const scanResult = await dynamoDB.send(new ScanCommand(params));
        
        if (scanResult.Items) {
            allProgress.push(...scanResult.Items);
        }
        
        lastEvaluatedKey = scanResult.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    return allProgress;
}

async function fixMisplacedFacts(dryRun: boolean = true, specificUserId?: string) {
    console.log(`Starting fact migration script in ${dryRun ? 'DRY RUN' : 'LIVE'} mode...`);
    if (specificUserId) {
        console.log(`Testing only for user ID: ${specificUserId}`);
    }
    
    const results: MigrationResult[] = [];
    
    try {
        let allProgress;
        
        if (specificUserId) {
            // Get progress records only for the specific user
            const params = {
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues: {
                    ':pk': `USER#${specificUserId}`,
                    ':sk': 'PROGRESS#'
                }
            };
            
            const result = await dynamoDB.send(new QueryCommand(params));
            allProgress = result.Items || [];
            console.log(`Found ${allProgress.length} progress records for user ${specificUserId}`);
        } else {
            // Get all user progress records
            allProgress = await getAllUserProgress();
            console.log(`Found ${allProgress.length} progress records to check`);
        }
        
        // Group progress records by user
        const progressByUser: { [userId: string]: any[] } = {};
        for (const progress of allProgress) {
            const userId = progress.PK.replace('USER#', '');
            if (!progressByUser[userId]) {
                progressByUser[userId] = [];
            }
            progressByUser[userId].push(progress);
        }
        
        // Process each user
        for (const [userId, userProgressRecords] of Object.entries(progressByUser)) {
            const misplacedFacts: MigrationResult['misplacedFacts'] = [];
            
            // Check each progress record for this user
            for (const progress of userProgressRecords) {
                const currentTrackId = progress.trackId;
                const facts = progress.facts || {};
                
                // Check each fact in this track
                for (const [factId, factData] of Object.entries(facts)) {
                    if (!isFactInCorrectTrack(factId, currentTrackId)) {
                        const correctTrackId = getCorrectTrackForFact(factId);
                        
                        if (correctTrackId) {
                            misplacedFacts.push({
                                factId,
                                fromTrack: currentTrackId,
                                toTrack: correctTrackId,
                                factData
                            });
                        } else {
                            console.warn(`Could not determine correct track for fact ${factId}`);
                        }
                    }
                }
            }
            
            if (misplacedFacts.length > 0) {
                results.push({ userId, misplacedFacts });
                
                if (!dryRun) {
                    // Perform the migration
                    await migrateFacts(userId, userProgressRecords, misplacedFacts);
                }
            }
        }
        
        // Generate report
        console.log('\n=== MIGRATION REPORT ===');
        console.log(`Total users with misplaced facts: ${results.length}`);
        
        let totalMisplacedFacts = 0;
        for (const result of results) {
            console.log(`\nUser ${result.userId}:`);
            for (const fact of result.misplacedFacts) {
                console.log(`  - ${fact.factId}: ${fact.fromTrack} → ${fact.toTrack}`);
                totalMisplacedFacts++;
            }
        }
        
        console.log(`\nTotal misplaced facts: ${totalMisplacedFacts}`);
        
        if (dryRun) {
            console.log('\nThis was a DRY RUN. No changes were made.');
            console.log('To perform the actual migration, run with --live flag');
        } else {
            console.log('\nMigration completed successfully!');
        }
        
    } catch (error) {
        console.error('Error during migration:', error);
        throw error;
    }
}

async function migrateFacts(userId: string, userProgressRecords: any[], misplacedFacts: MigrationResult['misplacedFacts']) {
    // Group misplaced facts by their target track
    const factsByTargetTrack: { [trackId: string]: any } = {};
    
    for (const misplaced of misplacedFacts) {
        if (!factsByTargetTrack[misplaced.toTrack]) {
            factsByTargetTrack[misplaced.toTrack] = {};
        }
        factsByTargetTrack[misplaced.toTrack][misplaced.factId] = misplaced.factData;
    }
    
    // Track all records that need to be updated (use a Map to avoid duplicates)
    const recordsToUpdate = new Map<string, any>();
    
    // First, handle target tracks (add facts)
    for (const [targetTrackId, factsToAdd] of Object.entries(factsByTargetTrack)) {
        // Find existing progress for this track
        let targetProgress = userProgressRecords.find(p => p.trackId === targetTrackId);
        
        if (!targetProgress) {
            // Create new progress record for this track
            targetProgress = {
                PK: `USER#${userId}`,
                SK: `PROGRESS#${targetTrackId}`,
                trackId: targetTrackId,
                startDate: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                status: 'in_progress',
                facts: {},
                overallCQPM: 0,
                accuracyRate: 0
            };
        } else {
            // Clone existing progress to avoid mutations
            targetProgress = { ...targetProgress, facts: { ...targetProgress.facts } };
        }
        
        // Add the misplaced facts to the correct track
        targetProgress.facts = {
            ...targetProgress.facts,
            ...factsToAdd
        };
        
        targetProgress.lastUpdated = new Date().toISOString();
        
        // Use the SK as the key to avoid duplicates
        recordsToUpdate.set(targetProgress.SK, targetProgress);
    }
    
    // Then, handle source tracks (remove facts)
    for (const progress of userProgressRecords) {
        const updatedFacts = { ...progress.facts };
        let hasChanges = false;
        
        // Remove misplaced facts from this track
        for (const misplaced of misplacedFacts) {
            if (misplaced.fromTrack === progress.trackId) {
                delete updatedFacts[misplaced.factId];
                hasChanges = true;
            }
        }
        
        if (hasChanges) {
            // Get existing record from map or create new one
            const existingRecord = recordsToUpdate.get(progress.SK);
            if (existingRecord) {
                // Update the existing record with the fact removals
                existingRecord.facts = {
                    ...existingRecord.facts,
                    ...updatedFacts
                };
                // Remove the facts that should be deleted
                for (const misplaced of misplacedFacts) {
                    if (misplaced.fromTrack === progress.trackId) {
                        delete existingRecord.facts[misplaced.factId];
                    }
                }
            } else {
                // Create new record
                const updatedProgress = {
                    ...progress,
                    facts: updatedFacts,
                    lastUpdated: new Date().toISOString()
                };
                recordsToUpdate.set(progress.SK, updatedProgress);
            }
        }
    }
    
    // Convert map to array for batch writing
    const updates = Array.from(recordsToUpdate.values()).map(record => ({
        PutRequest: {
            Item: record
        }
    }));
    
    // Execute batch writes (max 25 items per batch)
    while (updates.length > 0) {
        const batch = updates.splice(0, 25);
        await dynamoDB.send(new BatchWriteCommand({
            RequestItems: {
                [TABLE_NAME]: batch
            }
        }));
        
        // Add a small delay between batches to avoid throttling
        if (updates.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    console.log(`Migrated ${misplacedFacts.length} facts for user ${userId}`);
}

// Main execution
const args = process.argv.slice(2);
const isLive = args.includes('--live');
const userIdArg = args.find(arg => arg.startsWith('--user='));
const specificUserId = userIdArg ? userIdArg.split('=')[1] : undefined;

if (specificUserId) {
    console.log(`Script will process only user: ${specificUserId}`);
}

fixMisplacedFacts(!isLive, specificUserId)
    .then(() => {
        console.log('\nScript completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\nScript failed:', error);
        process.exit(1);
    });