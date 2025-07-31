import axios from 'axios';

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
 * Delete an enrollment by its sourcedId using OneRoster API
 */
async function deleteEnrollment(accessToken: string, enrollmentId: string): Promise<void> {
  try {
    console.log(`🗑️  Attempting to delete enrollment: ${enrollmentId}`);
    
    const response = await axios.delete(
      `${ONE_ROSTER_API_BASE}/enrollments/${enrollmentId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    console.log(`✅ Successfully deleted enrollment: ${enrollmentId}`);
    console.log(`   Response status: ${response.status}`);
    
  } catch (error: any) {
    if (error.isAxiosError) {
      console.error(`❌ Error deleting enrollment ${enrollmentId}:`, 
                   error.response?.status, error.response?.data || error.message);
      
      // Handle specific error cases
      if (error.response?.status === 404) {
        throw new Error(`Enrollment not found: ${enrollmentId}`);
      } else if (error.response?.status === 403) {
        throw new Error(`Access denied: insufficient permissions to delete enrollment ${enrollmentId}`);
      } else if (error.response?.status === 401) {
        throw new Error(`Authentication failed: invalid or expired token`);
      }
    } else {
      console.error(`❌ Error deleting enrollment ${enrollmentId}:`, error);
    }
    throw error;
  }
}

/**
 * Delete enrollment by ID
 */
async function deleteEnrollmentById(enrollmentId: string): Promise<void> {
  try {
    console.log(`🚀 Starting enrollment deletion for ID: ${enrollmentId}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    
    // Get a valid token
    console.log(`📡 Generating OneRoster authentication token...`);
    const accessToken = await getValidOneRosterToken();
    console.log(`✅ Token generated successfully`);
    
    // Delete the enrollment
    await deleteEnrollment(accessToken, enrollmentId);
    
    console.log(`\n✅ Enrollment deletion completed successfully at: ${new Date().toISOString()}`);
    
  } catch (error) {
    console.error(`❌ Error in deleteEnrollmentById:`, error);
    throw error;
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  try {
    // Get enrollment ID from command line arguments
    const enrollmentId = process.argv[2];
    if (!enrollmentId) {
      console.error('❌ Please provide an enrollment ID as an argument');
      console.log('Usage: ts-node deleteEnrollment.ts <enrollmentId>');
      process.exit(1);
    }
    
    // Confirm deletion
    console.log(`⚠️  WARNING: You are about to delete enrollment: ${enrollmentId}`);
    console.log(`⚠️  This action cannot be undone!`);
    
    await deleteEnrollmentById(enrollmentId);
    
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

export { deleteEnrollmentById };