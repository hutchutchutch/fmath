import axios from 'axios';
import { dynamoDB } from '../config/aws';
import { ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { 
  OneRosterUser, 
  CreateOneRosterUserResult, 
  UserProfile, 
  TRACK_TO_CLASS_MAP,
  FASTMATH_CLASS_NAME,
  DEFAULT_INITIAL_CLASS,
  ALL_ACCESS_CLASS,
  GRADE_CLASS_NAMES,
  OneRosterAssessmentResult,
  CreateAssessmentResultResponse,
  OneRosterAssessmentResultResponse,
  AssessmentResultMetadata
} from '../types/oneRoster';
import { v4 as uuidv4 } from 'uuid';

const ONE_ROSTER_API_BASE = 'https://api.alpha-1edtech.com/ims/oneroster/rostering/v1p2';
const AUTH_ENDPOINT = 'https://alpha-auth-production-idp.auth.us-west-2.amazoncognito.com/oauth2/token';
const CLIENT_ID = '2ionhi7706no44misflh94l6c7';
const CLIENT_SECRET = '1bmi87dba06d50lld729k5bj10kujnuflc7ss0q6iaeh3us69edd';
const ORG_ID = 'alphak-8'; // The organization ID in OneRoster
const TABLE_NAME = 'FastMath2';

// All available classes - now includes grade-based classes
const ALL_CLASSES = [FASTMATH_CLASS_NAME, ...Object.values(GRADE_CLASS_NAMES)];

// Token cache
interface TokenCache {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

let tokenCache: TokenCache | null = null;

/**
 * Retry wrapper for OneRoster operations with exponential backoff
 * @param operation The async operation to retry
 * @param maxAttempts Maximum number of attempts
 * @param operationName Name of the operation for logging
 * @returns Result of the operation
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  operationName: string = 'OneRoster operation'
): Promise<T> {
  let lastError: any;
  let delayMs = 1000; // Start with 1 second
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on 4xx errors (except 429 rate limit)
      if (error.isAxiosError && error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
        throw error;
      }
      
      if (attempt < maxAttempts) {
        console.log(`${operationName} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2; // Exponential backoff
      }
    }
  }
  
  console.error(`${operationName} failed after ${maxAttempts} attempts`);
  throw lastError;
}

/**
 * Generate an OAuth token for the OneRoster API
 */
export async function generateOneRosterToken(): Promise<string> {
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
export async function getValidOneRosterToken(): Promise<string> {
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
 * Parse user's name from email (format: given_name.family_name@alpha.school)
 */
function parseNameFromEmail(email: string): { givenName: string, familyName: string } {
  try {
    // Extract the part before @
    const localPart = email.split('@')[0];
    
    // Split by dot
    const nameParts = localPart.split('.');
    
    if (nameParts.length >= 2) {
      // Capitalize first letter of each name part
      const givenName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
      const familyName = nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1);
      
      return { givenName, familyName };
    }
    
    // Fallback if email format is not as expected
    return { 
      givenName: localPart.charAt(0).toUpperCase() + localPart.slice(1),
      familyName: 'User'
    };
  } catch (error) {
    console.error(`Error parsing name from email ${email}:`, error);
    return { givenName: 'Unknown', familyName: 'User' };
  }
}

/**
 * Get user profile from DynamoDB by email
 */
async function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
  console.log(`[PROFILE DEBUG] Looking for user with email: '${email}'`);
  try {
    // Scan the table to find the user with this email
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: 'SK = :sk AND email = :email',
      ExpressionAttributeValues: {
        ':sk': 'PROFILE',
        ':email': email
      }
    };
    
    // Use AWS SDK v3 ScanCommand
    const { Items } = await dynamoDB.send(new ScanCommand(params));
    
    if (Items && Items.length > 0) {
      const user = Items[0];
      return user as UserProfile;
    }
    
    return null;
  } catch (error) {
    console.error(`Error getting user profile for ${email}:`, error);
    return null;
  }
}

/**
 * Determine which classes to enroll the user in based on their focus track
 * For new users without a focus track, defaults to Grade 1 class
 */
function getClassesForUser(profile: UserProfile): string[] {
  // If user doesn't have a focus track yet, start with Grade 1
  if (!profile.focusTrack) {
    return [DEFAULT_INITIAL_CLASS];
  }
  
  // If user has 'ALL' access, put them in the highest grade class
  if (profile.focusTrack === 'ALL') {
    return [ALL_ACCESS_CLASS];
  }
  
  // Map focus track to appropriate grade class
  const targetClass = TRACK_TO_CLASS_MAP[profile.focusTrack];
  return targetClass ? [targetClass] : [DEFAULT_INITIAL_CLASS];
}

/**
 * Get the target class name for a given focus track
 */
export function getTargetClassForTrack(focusTrack: string): string {
  if (focusTrack === 'ALL') {
    return ALL_ACCESS_CLASS;
  }
  
  return TRACK_TO_CLASS_MAP[focusTrack] || DEFAULT_INITIAL_CLASS;
}

/**
 * Enroll a user in FastMath classes based on their focusTrack
 * Returns an array of class names that were successfully enrolled
 */
async function enrollUserInClasses(
  accessToken: string,
  userId: string, 
  email: string, 
  profile: UserProfile
): Promise<string[]> {
  // Determine which classes to enroll in based on focusTrack
  const classesToEnroll = getClassesForUser(profile);
  console.log(`Enrolling user ${email} in ${classesToEnroll.length} class(es): ${classesToEnroll.join(', ')}`);
  
  const successfulEnrollments: string[] = [];
  
  for (const className of classesToEnroll) {
    try {
      const enrollmentData = {
        enrollment: {
          sourcedId: `fastmath-enrollment-${userId}-${className}`,
          user: {
            sourcedId: userId
          }
        }
      };
      
      console.log(`Enrolling user in class ${className}`);
      
      const response = await axios.post(
        `${ONE_ROSTER_API_BASE}/classes/${className}/students`,
        enrollmentData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      console.log(`Successfully enrolled user ${email} (${userId}) in class ${className}`);
      console.log('Response:', JSON.stringify(response.data, null, 2));
      successfulEnrollments.push(className);
      
      // Add a small delay between enrollment API calls
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error: any) {
      if (error.isAxiosError) {
        console.error(`Error enrolling user ${email} (${userId}) in class ${className}:`, 
                     error.response?.status, error.response?.data || error.message);
      } else {
        console.error(`Error enrolling user ${email} (${userId}) in class ${className}:`, error);
      }
    }
  }
  
  return successfulEnrollments;
}

/**
 * Creates a user in OneRoster by email, with automatic enrollment in the correct classes
 * based on the user's focusTrack in the system. Automatically manages token.
 */
export async function createUserInOneRoster(email: string): Promise<CreateOneRosterUserResult> {
  try {
    // Get a valid token
    const accessToken = await getValidOneRosterToken();
    
    // Find the user in our database
    const userProfile = await getUserProfileByEmail(email);
    
    if (!userProfile) {
      return {
        success: false,
        message: `User with email ${email} not found in the system`
      };
    }
    
    return createUserInOneRosterWithProfile(userProfile, accessToken);
  } catch (error) {
    console.error(`Error creating user in OneRoster:`, error);
    return {
      success: false,
      message: `Internal error creating user in OneRoster: ${error instanceof Error ? error.message : String(error)}`,
      errors: [error]
    };
  }
}

/**
 * Creates a user in OneRoster with the provided user profile object. Automatically manages token.
 * If the user already exists in OneRoster (by email), returns their existing sourcedId.
 */
export async function createUserInOneRosterWithProfile(
  userProfile: UserProfile,
  accessToken?: string
): Promise<CreateOneRosterUserResult> {
  try {    
    // Get token if not provided
    const token = accessToken || await getValidOneRosterToken();
    
    // Extract user information
    const userId = userProfile.PK.replace('USER#', '');
    const email = userProfile.email;
    const { givenName, familyName } = parseNameFromEmail(email);
    
    console.log(`Processing user: ${email} (${userId})`);
    console.log(`Name: ${givenName} ${familyName}`);
    console.log(`Focus Track: ${userProfile.focusTrack || 'Not specified'}`);
    
    // First check if user already exists in OneRoster by email
    const existingUser = await getUserByEmail(email);
    
    if (existingUser) {
      console.log(`User with email ${email} already exists in OneRoster with ID: ${existingUser.sourcedId}`);
      
      // Enroll existing user in appropriate classes
      const enrolledClasses = await enrollUserInClasses(
        token,
        existingUser.sourcedId,
        email,
        userProfile
      );
      
      return {
        success: true,
        message: `User already exists in OneRoster and enrolled in ${enrolledClasses.length} class(es)`,
        userId: existingUser.sourcedId,
        enrolledClasses,
        existingUser: true,
        oneRosterSourcedId: existingUser.sourcedId
      };
    }
    
    // Create user in OneRoster if doesn't exist
    const userCreated = await createOneRosterUserInternal(
      token,
      userId,
      email,
      givenName,
      familyName
    );
    
    if (!userCreated) {
      return {
        success: false,
        message: `Failed to create user ${email} in OneRoster`
      };
    }
    
    // Wait a moment before enrolling
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Enroll user in appropriate classes
    const enrolledClasses = await enrollUserInClasses(
      token,
      userId,
      email,
      userProfile
    );
    
    // Return the results
    const classesToEnroll = getClassesForUser(userProfile);
    
    if (enrolledClasses.length === 0) {
      return {
        success: false,
        message: `User created in OneRoster but failed to enroll in any classes`,
        userId,
        oneRosterSourcedId: userId
      };
    }
    
    if (enrolledClasses.length < classesToEnroll.length) {
      return {
        success: true,
        message: `User created in OneRoster but only enrolled in ${enrolledClasses.length}/${classesToEnroll.length} classes`,
        userId,
        enrolledClasses,
        oneRosterSourcedId: userId
      };
    }
    
    return {
      success: true,
      message: `User successfully created in OneRoster and enrolled in ${enrolledClasses.length} class(es)`,
      userId,
      enrolledClasses,
      oneRosterSourcedId: userId
    };
    
  } catch (error) {
    console.error(`Error creating user in OneRoster:`, error);
    return {
      success: false,
      message: `Internal error creating user in OneRoster: ${error instanceof Error ? error.message : String(error)}`,
      errors: [error]
    };
  }
}

/**
 * Internal function to create a user in OneRoster API
 */
async function createOneRosterUserInternal(
  accessToken: string,
  userId: string,
  email: string,
  givenName: string,
  familyName: string
): Promise<boolean> {
  try {
    const userData: OneRosterUser = {
      sourcedId: userId,
      status: "active",
      userMasterIdentifier: email,
      username: email,
      enabledUser: true,
      givenName: givenName,
      familyName: familyName,
      middleName: null,
      email: email,
      roles: [
        {
          roleType: "primary",
          role: "student",
          org: {
            sourcedId: ORG_ID
          }
        }
      ]
    };

    console.log(`Creating user in OneRoster: ${email} (${userId})`);

    const response = await axios.post(
      `${ONE_ROSTER_API_BASE}/users/`,
      { user: userData },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    console.log(`Successfully created user in OneRoster: ${email} (${userId})`);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    return true; // Success
  } catch (error: any) {
    if (error.isAxiosError) {
      console.error(`Error creating user ${email} (${userId}) in OneRoster:`, 
                   error.response?.status, error.response?.data || error.message);
    } else {
      console.error(`Error creating user ${email} (${userId}) in OneRoster:`, error);
    }
    return false; // Failed
  }
}

/**
 * Get user from OneRoster API by email
 * @param email The email address to search for
 * @returns The user if found, null if not found
 */
export async function getUserByEmail(email: string): Promise<OneRosterUser | null> {
  try {
    // Get a valid token
    const accessToken = await getValidOneRosterToken();
    
    // Create filter parameter
    const params = new URLSearchParams();
    params.set('filter', `email='${email}'`);
    
    // Make the API call
    const response = await axios.get(
      `${ONE_ROSTER_API_BASE}/users?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    // Check if any users were found
    if (response.data && (response.data as any).users?.length > 0) {
      console.log(`Found user in OneRoster with email ${email}`);
      return (response.data as any).users[0];
    } else {
      console.log(`No user found in OneRoster with email ${email}`);
      return null;
    }
  } catch (error: any) {
    if (error.isAxiosError) {
      console.error(`Error getting user by email ${email}:`, 
                   error.response?.status, error.response?.data || error.message);
    } else {
      console.error(`Error getting user by email ${email}:`, error);
    }
    return null;
  }
}

/**
 * Submit assessment results to OneRoster
 * @param assessmentResult The assessment result data to submit
 * @returns Response with success/failure and details
 */
export async function submitAssessmentResult(
  assessmentResult: OneRosterAssessmentResult
): Promise<CreateAssessmentResultResponse> {
  try {
    // Get a valid token
    const accessToken = await getValidOneRosterToken();
    
    console.log(`Submitting assessment result for student: ${assessmentResult.student.sourcedId}, assessment: ${assessmentResult.assessmentLineItem.sourcedId}`);
    
    // OneRoster API endpoint - note the different base path for gradebook
    const GRADEBOOK_API_BASE = 'https://api.alpha-1edtech.com/ims/oneroster/gradebook/v1p2';
    
    // Make the API call
    const response = await axios.post<OneRosterAssessmentResultResponse>(
      `${GRADEBOOK_API_BASE}/assessmentResults/`,
      { assessmentResult },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    console.log(`Successfully submitted assessment result: ${assessmentResult.sourcedId}`);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    // Handle successful response - contains sourcedIdPairs with suppliedSourcedId and allocatedSourcedId
    return {
      success: true,
      message: 'Assessment result successfully submitted',
      sourcedId: response.data.sourcedIdPairs.suppliedSourcedId,
      allocatedSourcedId: response.data.sourcedIdPairs.allocatedSourcedId
    };
    
  } catch (error: any) {
    if (error.isAxiosError) {
      console.error(`Error submitting assessment result: ${assessmentResult.sourcedId}:`, 
                   error.response?.status, error.response?.data || error.message);
      
      return {
        success: false,
        message: `Failed to submit assessment result: ${error.response?.data?.message || error.message}`,
        error: error.response?.data
      };
    } else {
      console.error(`Error submitting assessment result: ${assessmentResult.sourcedId}:`, error);
      
      return {
        success: false,
        message: `Internal error submitting assessment result: ${error instanceof Error ? error.message : String(error)}`,
        error
      };
    }
  }
}

/**
 * Helper function to create and submit an assessment result with minimal parameters
 * @param assessmentLineItemId The assessment line item sourcedId
 * @param score The score (numeric value)
 * @param userId The user ID to use for the student
 * @param metadata Additional metadata for the assessment
 * @returns Response with success/failure and details
 */
export async function createAndSubmitAssessmentResult(
  assessmentLineItemId: string,
  score: number,
  userId: string,
  metadata?: AssessmentResultMetadata
): Promise<CreateAssessmentResultResponse> {
  try {
    // Use the provided userId directly
    const userSourcedId = userId;
    console.log(`Using userId ${userId} for assessment result`);
    
    // Generate a unique sourcedId for this assessment result
    // Format: userId-timestamp-assessmentId (changed from date to timestamp)
    const now = new Date();
    const timestamp = now.getTime(); // Use millisecond timestamp instead of date
    const sourcedId = `${userId}-${timestamp}-${assessmentLineItemId}`;
    
    // Create the assessment result object
    const assessmentResult: OneRosterAssessmentResult = {
      sourcedId,
      status: "active",
      assessmentLineItem: {
        sourcedId: assessmentLineItemId
      },
      student: {
        sourcedId: userSourcedId
      },
      score,
      scoreDate: now.toISOString(),
      scoreStatus: "fully graded",
      metadata
    };
    
    // Submit the assessment result
    return submitAssessmentResult(assessmentResult);
    
  } catch (error) {
    console.error(`Error creating and submitting assessment result:`, error);
    return {
      success: false,
      message: `Internal error creating assessment result: ${error instanceof Error ? error.message : String(error)}`,
      error
    };
  }
}

/**
 * Get all enrollments for a user from OneRoster
 * @param userId The user's sourcedId in OneRoster
 * @returns Array of class sourcedIds the user is enrolled in
 */
export async function getUserEnrollments(userId: string): Promise<string[]> {
  try {
    const accessToken = await getValidOneRosterToken();
    
    const response = await axios.get(
      `${ONE_ROSTER_API_BASE}/users/${userId}/classes`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    if (response.data && (response.data as any).classes) {
      // Note: The /users/{id}/classes endpoint returns all classes regardless of enrollment status
      // We'll need to cross-check with actual enrollments to filter active ones
      const classes = (response.data as any).classes.map((cls: any) => cls.sourcedId);
      
      // Get actual enrollments to check status
      const enrollmentsResponse = await axios.get(
        `${ONE_ROSTER_API_BASE}/enrollments`,
        {
          params: {
            filter: `user.sourcedId='${userId}'`
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      const activeEnrollments = ((enrollmentsResponse.data as any).enrollments || [])
        .filter((enrollment: any) => enrollment.status === 'active')
        .map((enrollment: any) => enrollment.class?.sourcedId);
      
      // Return only classes that have active enrollments
      return classes.filter((classId: string) => activeEnrollments.includes(classId));
    }
    
    return [];
  } catch (error: any) {
    if (error.isAxiosError) {
      console.error(`Error getting enrollments for user ${userId}:`, 
                   error.response?.status, error.response?.data || error.message);
    } else {
      console.error(`Error getting enrollments for user ${userId}:`, error);
    }
    return [];
  }
}

/**
 * Remove user enrollment from a specific class
 * @param userId The user's sourcedId in OneRoster
 * @param className The class sourcedId to remove enrollment from
 * @returns Success boolean
 */
export async function removeUserFromClass(userId: string, className: string): Promise<boolean> {
  try {
    await retryWithBackoff(async () => {
      const accessToken = await getValidOneRosterToken();
      
      // First, get all enrollments for the user to find the correct enrollment ID
      const enrollmentsResponse = await axios.get(
        `${ONE_ROSTER_API_BASE}/enrollments`,
        {
          params: {
            filter: `user.sourcedId='${userId}'`
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      // Find the enrollment for the specific class
      const enrollments = (enrollmentsResponse.data as any).enrollments || [];
      const targetEnrollment = enrollments.find((enrollment: any) => 
        enrollment.class?.sourcedId === className && enrollment.status === 'active'
      );
      
      if (!targetEnrollment) {
        return; // Consider it a success if already not enrolled
      }
      
      const enrollmentId = targetEnrollment.sourcedId;
      
      // Now delete using the actual enrollment ID
      await axios.delete(
        `${ONE_ROSTER_API_BASE}/enrollments/${enrollmentId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
    }, 3, `Remove user ${userId} from class ${className}`);
    
    return true;
  } catch (error: any) {
    console.error(`[OneRoster] DELETE failed for user ${userId} in class ${className}:`, error.response?.status, error.response?.data || error.message);
    return false;
  }
}

/**
 * Add user enrollment to a specific class
 * @param userId The user's sourcedId in OneRoster
 * @param className The class sourcedId to add enrollment to
 * @returns Success boolean
 */
export async function addUserToClass(userId: string, className: string): Promise<boolean> {
  try {
    await retryWithBackoff(async () => {
      const accessToken = await getValidOneRosterToken();
      
      const enrollmentData = {
        enrollment: {
          sourcedId: `fastmath-enrollment-${userId}-${className}`,
          user: {
            sourcedId: userId
          }
        }
      };
      
      await axios.post(
        `${ONE_ROSTER_API_BASE}/classes/${className}/students`,
        enrollmentData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
    }, 3, `Add user ${userId} to class ${className}`);
    
    return true;
  } catch (error: any) {
    console.error(`[OneRoster] Failed to add user ${userId} to class ${className}:`, error.response?.status || error.message);
    return false;
  }
}

/**
 * Transfer user from one class to another
 * @param userId The user's sourcedId in OneRoster  
 * @param fromClassName The class to remove enrollment from
 * @param toClassName The class to add enrollment to
 * @returns Success boolean
 */
export async function transferUserClass(
  userId: string, 
  fromClassName: string, 
  toClassName: string
): Promise<boolean> {
  try {
    // First, try to add to new class before removing from old class
    // This ensures user is never without a class enrollment
    const addSuccess = await addUserToClass(userId, toClassName);
    if (!addSuccess) {
      console.error(`Failed to add user ${userId} to class ${toClassName}`);
      return false;
    }
    
    // Now remove from old class
    const removeSuccess = await removeUserFromClass(userId, fromClassName);
    if (!removeSuccess) {
      console.warn(`User ${userId} successfully added to ${toClassName} but failed to remove from ${fromClassName}. User may be in multiple classes.`);
      // Still return true since the critical operation (adding to new class) succeeded
    }
    
    return true;
  } catch (error) {
    console.error(`Error transferring user ${userId} from ${fromClassName} to ${toClassName}:`, error);
    return false;
  }
}

/**
 * Update user's OneRoster class enrollment based on their current focus track
 * @param userId User's ID in the system
 * @param email User's email address
 * @param newFocusTrack The new focus track to determine class enrollment
 * @returns Success boolean and details
 */
export async function updateUserClassEnrollment(
  userId: string,
  email: string, 
  newFocusTrack: string
): Promise<{ success: boolean; message: string; transferredFrom?: string; transferredTo?: string }> {
  try {
    // Get OneRoster user info using the email with retry logic
    const oneRosterUser = await retryWithBackoff(
      () => getUserByEmail(email),
      3,
      `Get OneRoster user by email ${email}`
    );
    
    if (!oneRosterUser) {
      return {
        success: false,
        message: `User with email ${email} not found in OneRoster`
      };
    }
    
    const oneRosterUserId = oneRosterUser.sourcedId;
    
    // Determine target class for new focus track
    const targetClass = getTargetClassForTrack(newFocusTrack);
    
    // Get current enrollments with retry logic
    const currentEnrollments = await retryWithBackoff(
      () => getUserEnrollments(oneRosterUserId),
      3,
      `Get enrollments for user ${oneRosterUserId}`
    );
    
    // Check if user is already in the target class
    if (currentEnrollments.includes(targetClass)) {
      return {
        success: true,
        message: `User ${email} is already enrolled in the correct class: ${targetClass}`
      };
    }
    
    // Find which FastMath class they're currently enrolled in (if any)
    const currentFastMathClass = currentEnrollments.find(className => 
      Object.values(GRADE_CLASS_NAMES).includes(className as any) || className === FASTMATH_CLASS_NAME
    );
    
    if (!currentFastMathClass) {
      // User not enrolled in any FastMath class, just add them to target class
      const addSuccess = await addUserToClass(oneRosterUserId, targetClass);
      return {
        success: addSuccess,
        message: addSuccess 
          ? `Successfully enrolled user ${email} in class ${targetClass}`
          : `Failed to enroll user ${email} in class ${targetClass}`,
        transferredTo: targetClass
      };
    }
    
    // Transfer from current class to target class
    const transferSuccess = await transferUserClass(oneRosterUserId, currentFastMathClass, targetClass);
    
    return {
      success: transferSuccess,
      message: transferSuccess
        ? `Successfully transferred user ${email} from ${currentFastMathClass} to ${targetClass}`
        : `Failed to transfer user ${email} from ${currentFastMathClass} to ${targetClass}`,
      transferredFrom: currentFastMathClass,
      transferredTo: targetClass
    };
    
  } catch (error) {
    console.error(`Error updating class enrollment for ${email}:`, error);
    return {
      success: false,
      message: `Internal error updating class enrollment: ${error instanceof Error ? error.message : String(error)}`
    };
  }
} 