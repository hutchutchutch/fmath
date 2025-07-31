import { setUserProgressService } from '../src/services/userProgressService';
import { SetUserProgressRequest } from '../src/types/progress';

async function testFactValidation() {
    console.log('Testing fact validation in userProgressService...\n');
    
    // Test data
    const testUserId = 'test-user-123';
    const testCases = [
        {
            name: 'Valid facts for TRACK5',
            trackId: 'TRACK5',
            facts: {
                'FACT370': { attempts: 1, correct: 1, timeSpent: 3000 },
                'FACT400': { attempts: 1, correct: 0, timeSpent: 4000 },
                'FACT510': { attempts: 1, correct: 1, timeSpent: 2500 }
            },
            shouldSucceed: true
        },
        {
            name: 'Invalid facts for TRACK5',
            trackId: 'TRACK5',
            facts: {
                'FACT370': { attempts: 1, correct: 1, timeSpent: 3000 },
                'FACT885': { attempts: 1, correct: 1, timeSpent: 3000 }, // Outside range!
                'FACT1414': { attempts: 1, correct: 0, timeSpent: 4000 } // Outside range!
            },
            shouldSucceed: false
        },
        {
            name: 'Valid facts for TRACK7',
            trackId: 'TRACK7',
            facts: {
                'FACT750': { attempts: 1, correct: 1, timeSpent: 3000 },
                'FACT885': { attempts: 1, correct: 1, timeSpent: 2000 }, // Valid for TRACK7
                'FACT900': { attempts: 1, correct: 0, timeSpent: 4000 }
            },
            shouldSucceed: true
        }
    ];
    
    // Run tests
    for (const testCase of testCases) {
        console.log(`\nTest: ${testCase.name}`);
        console.log(`Track: ${testCase.trackId}`);
        console.log(`Facts: ${Object.keys(testCase.facts).join(', ')}`);
        
        const progress: SetUserProgressRequest = {
            facts: testCase.facts
        };
        
        try {
            // Note: This will fail without a real user profile in the database
            // For actual testing, you'd need to:
            // 1. Create a test user with a specific focusTrack
            // 2. Run this test
            // 3. Clean up the test data
            
            await setUserProgressService(testUserId, testCase.trackId, progress);
            
            if (testCase.shouldSucceed) {
                console.log('✅ Test passed - Update succeeded as expected');
            } else {
                console.log('❌ Test failed - Update should have been rejected');
            }
        } catch (error) {
            if (!testCase.shouldSucceed) {
                console.log('✅ Test passed - Update rejected as expected');
                console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            } else {
                console.log('❌ Test failed - Update should have succeeded');
                console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    }
    
    console.log('\n\nNote: For actual testing, you need to:');
    console.log('1. Create test users with different focusTrack values');
    console.log('2. Test with users who have focusTrack != ALL (should ignore frontend trackId)');
    console.log('3. Test with users who have focusTrack = ALL (should use frontend trackId)');
    console.log('4. Verify fact validation works correctly');
}

// Run the test
testFactValidation()
    .then(() => {
        console.log('\nTest script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\nTest script failed:', error);
        process.exit(1);
    });