import axios from 'axios';
import { getUserByEmail } from '../src/services/userRosteringService';

// Configuration
const ONE_ROSTER_API_BASE = 'https://api.alpha-1edtech.com/ims/oneroster/rostering/v1p2';

// OneRoster Auth Configuration
const AUTH_ENDPOINT = 'https://alpha-auth-production-idp.auth.us-west-2.amazoncognito.com/oauth2/token';
const CLIENT_ID = '2ionhi7706no44misflh94l6c7';
const CLIENT_SECRET = '1bmi87dba06d50lld729k5bj10kujnuflc7ss0q6iaeh3us69edd';

// Token cache
interface TokenCache {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

let tokenCache: TokenCache | null = null;

interface OneRosterEnrollment {
  sourcedId: string;
  status: string;
  dateLastModified: string;
  role: string;
  primary: boolean;
  user: {
    href: string;
    sourcedId: string;
    type: string;
  };
  class: {
    href: string;
    sourcedId: string;
    type: string;
  };
}

interface OneRosterEnrollmentsResponse {
  enrollments: OneRosterEnrollment[];
  totalCount: number;
  pageCount: number;
  pageNumber: number;
  offset: number;
  limit: number;
}

/**
 * Generate an OAuth token for the OneRoster API
 */
async function generateOneRosterToken(): Promise<string> {
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    const response = await axios.post(AUTH_ENDPOINT, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (response.data && (response.data as any).access_token) {
      // Calculate token expiration (expires_in is in seconds)
      const expiresIn = (response.data as any).expires_in || 3600; // Default to 1 hour if not provided
      const expiresAt = Date.now() + (expiresIn * 1000);
      
      // Update cache
      tokenCache = {
        token: (response.data as any).access_token,
        expiresAt
      };
      
      return (response.data as any).access_token;
    } else {
      throw new Error('Failed to generate token: No access_token in response');
    }
  } catch (error) {
    console.error('Error generating OneRoster token:', error);
    throw new Error(`Failed to generate OneRoster token: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get a valid OneRoster token, using cache if available and not expired
 */
async function getValidOneRosterToken(): Promise<string> {
  // If we have a cached token that's still valid (with 5 minute buffer)
  const bufferMs = 5 * 60 * 1000; // 5 minutes in milliseconds
  if (tokenCache && tokenCache.expiresAt > (Date.now() + bufferMs)) {
    console.log('Using cached OneRoster token');
    return tokenCache.token;
  }
  
  // Otherwise generate a new token
  console.log('Generating new OneRoster token');
  return generateOneRosterToken();
}

/**
 * Fetch enrollments for a specific user using OneRoster API filtering
 */
async function fetchUserEnrollments(
  accessToken: string,
  sourcedId: string
): Promise<OneRosterEnrollmentsResponse> {
  try {
    const response = await axios.get<OneRosterEnrollmentsResponse>(
      `${ONE_ROSTER_API_BASE}/enrollments/`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          filter: `user.sourcedId='${sourcedId}'`
        }
      }
    );
    
    return response.data;
  } catch (error: any) {
    if (error.isAxiosError) {
      console.error(`Error fetching enrollments for user ${sourcedId}:`, 
                   error.response?.status, error.response?.data || error.message);
    } else {
      console.error(`Error fetching enrollments for user ${sourcedId}:`, error);
    }
    throw error;
  }
}

/**
 * Find user enrollments by email address
 */
async function findUserEnrollmentsByEmail(email: string): Promise<OneRosterEnrollment[]> {
  try {
    console.log(`🔍 Looking up user by email: ${email}`);
    
    // Get user from FastMath database
    const user = await getUserByEmail(email);
    if (!user) {
      throw new Error(`User not found with email: ${email}`);
    }
    
    if (!user.oneRosterSourcedId) {
      throw new Error(`User ${email} does not have a OneRoster sourcedId`);
    }
    
    console.log(`✅ Found user: ${user.name} (OneRoster ID: ${user.oneRosterSourcedId})`);
    console.log(`📡 Generating OneRoster authentication token...`);
    
    // Get a valid token
    const accessToken = await getValidOneRosterToken();
    console.log(`✅ Token generated successfully`);
    
    // Fetch enrollments using API filtering
    console.log(`📊 Fetching enrollments for OneRoster ID: ${user.oneRosterSourcedId}`);
    const response = await fetchUserEnrollments(accessToken, user.oneRosterSourcedId);
    
    console.log(`📋 Found ${response.enrollments.length} enrollment(s)`);
    return response.enrollments;
    
  } catch (error) {
    console.error(`❌ Error in findUserEnrollmentsByEmail:`, error);
    throw error;
  }
}

/**
 * Display enrollment information in a formatted way
 */
function displayEnrollments(enrollments: OneRosterEnrollment[], email: string): void {
  if (enrollments.length === 0) {
    console.log(`❌ No enrollments found for user: ${email}`);
    return;
  }
  
  console.log(`\n🎉 Found ${enrollments.length} enrollment(s) for user: ${email}`);
  console.log(`${'='.repeat(80)}`);
  
  enrollments.forEach((enrollment, index) => {
    console.log(`\n📚 Enrollment ${index + 1}:`);
    console.log(`   Enrollment ID: ${enrollment.sourcedId}`);
    console.log(`   Class: ${enrollment.class.sourcedId}`);
    console.log(`   Role: ${enrollment.role}`);
    console.log(`   Status: ${enrollment.status}`);
    console.log(`   Primary: ${enrollment.primary}`);
    console.log(`   Last Modified: ${enrollment.dateLastModified}`);
    console.log(`   Class URL: ${enrollment.class.href}`);
    console.log(`   User URL: ${enrollment.user.href}`);
  });
  
  console.log(`\n📋 Summary:`);
  console.log(`   Total Enrollments: ${enrollments.length}`);
  console.log(`   Enrollment IDs: ${enrollments.map(e => e.sourcedId).join(', ')}`);
  console.log(`   Classes: ${enrollments.map(e => e.class.sourcedId).join(', ')}`);
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  try {
    // Get email from command line arguments
    const email = process.argv[2];
    if (!email) {
      console.error('❌ Please provide an email address as an argument');
      console.log('Usage: ts-node findUserEnrollments.ts <email>');
      process.exit(1);
    }
    
    console.log(`🚀 Starting enrollment search for email: ${email}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    
    const enrollments = await findUserEnrollmentsByEmail(email);
    displayEnrollments(enrollments, email);
    
    console.log(`\n✅ Search completed successfully at: ${new Date().toISOString()}`);
    
  } catch (error) {
    console.error(`❌ Script failed:`, error);
    process.exit(1);
  }
}

// Run the script if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(`❌ Unhandled error:`, error);
    process.exit(1);
  });
}

export { findUserEnrollmentsByEmail }; 