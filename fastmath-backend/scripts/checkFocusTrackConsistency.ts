import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, ScanCommandInput, GetCommand, ScanCommandOutput } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'FastMath2';

// Define user profile interface
interface UserProfile {
  PK: string;
  SK: string;
  userId: string;
  email: string;
  name?: string;
  focusTrack?: string;
  [key: string]: any;
}

// Interface for storing inconsistencies
interface Inconsistency {
  email: string;
  userId: string;
  name?: string;
  currentFocusTrack?: string;
  mappingFocusTrack?: string;
  type: 'MISSING_IN_USER' | 'MISSING_IN_MAPPING' | 'MISMATCH';
}

/**
 * Retrieves the focus track mapping from DynamoDB
 */
async function getFocusTrackMapping(): Promise<Record<string, string>> {
  try {
    const result = await dynamoDB.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: 'MAPPING#FOCUSMAPPING',
        SK: 'METADATA'
      }
    }));

    if (result.Item && result.Item.mappings) {
      console.log(`Retrieved focus track mapping with ${Object.keys(result.Item.mappings).length} entries`);
      return result.Item.mappings;
    } else {
      console.error('Focus track mapping not found or empty');
      return {};
    }
  } catch (error) {
    console.error('Error retrieving focus track mapping:', error);
    return {};
  }
}

/**
 * Retrieves all user profiles from DynamoDB
 */
async function getAllUserProfiles(): Promise<UserProfile[]> {
  console.log('Scanning for all user profiles...');
  
  let allProfiles: UserProfile[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;
  
  do {
    const params: ScanCommandInput = {
      TableName: TABLE_NAME,
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: {
        ':sk': 'PROFILE'
      },
      ExclusiveStartKey: lastEvaluatedKey
    };
    
    try {
      const result: ScanCommandOutput = await dynamoDB.send(new ScanCommand(params));
      
      if (result.Items && result.Items.length > 0) {
        // Only include profiles with email
        const validProfiles = (result.Items as UserProfile[])
          .filter(profile => profile.email && !isTestUser(profile));
        
        allProfiles = [...allProfiles, ...validProfiles];
      }
      
      lastEvaluatedKey = result.LastEvaluatedKey;
      console.log(`Retrieved batch of ${result.Items?.length || 0} profiles, found ${allProfiles.length} valid users so far`);
      
    } catch (error) {
      console.error('Error scanning user profiles:', error);
      throw error;
    }
  } while (lastEvaluatedKey);
  
  console.log(`Found ${allProfiles.length} user profiles to check`);
  return allProfiles;
}

/**
 * Check if a user is a test user based on their email
 */
function isTestUser(profile: UserProfile): boolean {
  if (!profile.email) return true;
  
  const testDomains = ['test', 'example', 'dummy'];
  return testDomains.some(domain => profile.email.includes(domain));
}

/**
 * Checks for inconsistencies between user profiles and the focus track mapping
 */
async function checkFocusTrackConsistency(): Promise<void> {
  // Get all user profiles
  const userProfiles = await getAllUserProfiles();
  
  // Get the focus track mapping
  const focusTrackMapping = await getFocusTrackMapping();
  
  // Track inconsistencies
  const inconsistencies: Inconsistency[] = [];
  
  // Track statistics
  let missingInUser = 0;
  let missingInMapping = 0;
  let mismatch = 0;
  let consistent = 0;
  
  // Check each user profile
  for (const profile of userProfiles) {
    const email = profile.email.toLowerCase();
    const mappingTrack = focusTrackMapping[email];
    const userTrack = profile.focusTrack;
    
    // Case 1: User has no focusTrack but exists in mapping
    if (!userTrack && mappingTrack) {
      inconsistencies.push({
        email,
        userId: profile.userId,
        name: profile.name,
        mappingFocusTrack: mappingTrack,
        type: 'MISSING_IN_USER'
      });
      missingInUser++;
    }
    // Case 2: User has focusTrack but doesn't exist in mapping
    else if (userTrack && !mappingTrack) {
      inconsistencies.push({
        email,
        userId: profile.userId,
        name: profile.name,
        currentFocusTrack: userTrack,
        type: 'MISSING_IN_MAPPING'
      });
      missingInMapping++;
    }
    // Case 3: User has focusTrack that differs from mapping
    else if (userTrack && mappingTrack && userTrack !== mappingTrack) {
      inconsistencies.push({
        email,
        userId: profile.userId,
        name: profile.name,
        currentFocusTrack: userTrack,
        mappingFocusTrack: mappingTrack,
        type: 'MISMATCH'
      });
      mismatch++;
    }
    else if (userTrack && mappingTrack && userTrack === mappingTrack) {
      // Consistent case
      consistent++;
    }
  }
  
  // Print summary
  console.log('\n========== FOCUS TRACK CONSISTENCY CHECK SUMMARY ==========');
  console.log(`Total users checked: ${userProfiles.length}`);
  console.log(`Consistent users: ${consistent}`);
  console.log(`Inconsistencies found: ${inconsistencies.length}`);
  console.log(`  - Missing in user (in mapping but not set in user): ${missingInUser}`);
  console.log(`  - Missing in mapping (set in user but not in mapping): ${missingInMapping}`);
  console.log(`  - Mismatch (different values): ${mismatch}`);
  
  // Print detailed inconsistencies
  if (inconsistencies.length > 0) {
    console.log('\n========== DETAILED INCONSISTENCIES ==========');
    
    // Group by type
    console.log('\n--- MISSING IN USER ---');
    inconsistencies.filter(i => i.type === 'MISSING_IN_USER').forEach(i => {
      console.log(`${i.email} (${i.name || 'Unknown'}) - Should have focusTrack: ${i.mappingFocusTrack}`);
    });
    
    console.log('\n--- MISSING IN MAPPING ---');
    inconsistencies.filter(i => i.type === 'MISSING_IN_MAPPING').forEach(i => {
      console.log(`${i.email} (${i.name || 'Unknown'}) - Has focusTrack: ${i.currentFocusTrack} but not in mapping`);
    });
    
    console.log('\n--- MISMATCH ---');
    inconsistencies.filter(i => i.type === 'MISMATCH').forEach(i => {
      console.log(`${i.email} (${i.name || 'Unknown'}) - Has ${i.currentFocusTrack} but mapping has ${i.mappingFocusTrack}`);
    });
  }
}

async function main() {
  try {
    await checkFocusTrackConsistency();
    console.log('Focus track consistency check completed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 