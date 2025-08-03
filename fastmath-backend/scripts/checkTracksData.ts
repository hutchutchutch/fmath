import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { TRACK_NAMES, TRACK_RANGES } from '../src/types/constants';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'FastMath2';

async function checkTracksData() {
  console.log('Checking which tracks have data in the database...\n');
  
  interface TrackStatusInfo {
    name: string;
    hasMetadata: boolean;
    factRange: string;
    sampledFacts: string;
    status: string;
  }
  
  const trackStatus: Record<string, TrackStatusInfo> = {};
  
  // Check each track
  for (const [trackId, trackName] of Object.entries(TRACK_NAMES)) {
    if (trackId === 'ALL') continue; // Skip the ALL entry
    
    try {
      // Check if track metadata exists
      const metadataResult = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `TRACK#${trackId}`,
          SK: 'METADATA'
        }
      }));
      
      if (metadataResult.Item) {
        // Track metadata exists, now check for facts
        const range = TRACK_RANGES[trackId as keyof typeof TRACK_RANGES];
        if (range) {
          const [minId, maxId] = range;
          
          // Check a sample of facts
          const sampleFactIds = [
            minId,
            Math.floor((minId + maxId) / 2),
            maxId
          ];
          
          let foundFacts = 0;
          for (const factId of sampleFactIds) {
            const factResult = await docClient.send(new GetCommand({
              TableName: TABLE_NAME,
              Key: {
                PK: `FACT#FACT${factId}`,
                SK: 'METADATA'
              }
            }));
            
            if (factResult.Item) {
              foundFacts++;
            }
          }
          
          trackStatus[trackId] = {
            name: trackName,
            hasMetadata: true,
            factRange: `${minId}-${maxId}`,
            sampledFacts: `${foundFacts}/3`,
            status: foundFacts > 0 ? '✓ Has Data' : '✗ No Facts Found'
          };
        }
      } else {
        trackStatus[trackId] = {
          name: trackName,
          hasMetadata: false,
          factRange: TRACK_RANGES[trackId as keyof typeof TRACK_RANGES] 
            ? `${TRACK_RANGES[trackId as keyof typeof TRACK_RANGES][0]}-${TRACK_RANGES[trackId as keyof typeof TRACK_RANGES][1]}`
            : 'Unknown',
          sampledFacts: '0/3',
          status: '✗ No Metadata'
        };
      }
    } catch (error) {
      trackStatus[trackId] = {
        name: trackName,
        hasMetadata: false,
        factRange: 'Error',
        sampledFacts: '0/3',
        status: '✗ Error checking'
      };
      console.error(`Error checking ${trackId}:`, error);
    }
  }
  
  // Display results
  console.log('Track Data Status:');
  console.log('==================\n');
  
  for (const [trackId, status] of Object.entries(trackStatus)) {
    console.log(`${trackId}: ${status.name}`);
    console.log(`  Metadata: ${status.hasMetadata ? '✓' : '✗'}`);
    console.log(`  Fact Range: ${status.factRange}`);
    console.log(`  Sample Facts Found: ${status.sampledFacts}`);
    console.log(`  Status: ${status.status}`);
    console.log('');
  }
  
  // Summary
  const tracksWithData = Object.entries(trackStatus)
    .filter(([_, status]) => status.status.includes('✓'))
    .map(([id, _]) => id);
    
  console.log('\nSummary:');
  console.log(`Tracks with data: ${tracksWithData.join(', ') || 'None'}`);
  console.log(`Total tracks checked: ${Object.keys(trackStatus).length}`);
}

// Run the check
checkTracksData().catch(console.error);