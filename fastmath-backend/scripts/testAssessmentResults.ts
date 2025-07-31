import axios from 'axios';
import { getValidOneRosterToken } from '../services/oneRosterService';

const GRADEBOOK_API_BASE = 'https://api.alpha-1edtech.com/ims/oneroster/gradebook/v1p2';

/**
 * Test script to fetch all assessment results from OneRoster API
 */
async function testFetchAssessmentResults() {
  try {
    console.log('🚀 Starting OneRoster Assessment Results Test...\n');
    
    // Step 1: Generate/get a valid token
    console.log('1. Generating OneRoster token...');
    const accessToken = await getValidOneRosterToken();
    console.log('✓ Token generated successfully\n');
    
    // Step 2: Fetch all assessment results
    console.log('2. Fetching assessment results...');
    const response = await axios.get(
      `${GRADEBOOK_API_BASE}/assessmentResults/`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    console.log('✓ Successfully fetched assessment results\n');
    
    // Step 3: Display results
    console.log('=== ASSESSMENT RESULTS ===');
    console.log(`Status: ${response.status}`);
    console.log(`Response Headers:`, response.headers);
    console.log('\n--- Response Data ---');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Step 4: Parse and display summary
    if (response.data && response.data.assessmentResults) {
      const results = response.data.assessmentResults;
      console.log(`\n=== SUMMARY ===`);
      console.log(`Total assessment results found: ${results.length}`);
      
      if (results.length > 0) {
        console.log('\nFirst few results:');
        results.slice(0, 3).forEach((result: any, index: number) => {
          console.log(`${index + 1}. ID: ${result.sourcedId}`);
          console.log(`   Student: ${result.student?.sourcedId || 'N/A'}`);
          console.log(`   Assessment: ${result.assessmentLineItem?.sourcedId || 'N/A'}`);
          console.log(`   Score: ${result.score || 'N/A'}`);
          console.log(`   Date: ${result.scoreDate || 'N/A'}`);
          console.log(`   Status: ${result.scoreStatus || 'N/A'}`);
          console.log('');
        });
      }
    } else {
      console.log('\n=== SUMMARY ===');
      console.log('No assessment results found or unexpected response format');
    }
    
  } catch (error: any) {
    console.error('\n❌ Error testing assessment results endpoint:');
    
    if (error.isAxiosError) {
      console.error(`HTTP Status: ${error.response?.status}`);
      console.error(`Response Headers:`, error.response?.headers);
      console.error(`Response Data:`, JSON.stringify(error.response?.data, null, 2));
      console.error(`Request URL: ${error.config?.url}`);
      console.error(`Request Headers:`, error.config?.headers);
    } else {
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
    }
  }
}

// Main execution
async function main() {
  console.log('🚀 OneRoster Assessment Results Test Script\n');
  
  // Test basic fetch
  await testFetchAssessmentResults();
  
  console.log('\n✅ Test script completed');
}

// Run the script
main().catch(console.error); 