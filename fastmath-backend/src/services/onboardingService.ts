import { dynamoDB } from '../config/aws';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { setInitialFocusTrack } from './updateFocusTrackService';
import { updateUserClassEnrollment } from './oneRosterService';
import { CQPM_TARGETS, ONBOARDING_ASSESSMENT_SEQUENCE } from '../types/constants';
import { ProgressAssessment } from '../types/progressAssessment';
import activityMetricsService from './activityMetricsService';

export interface OnboardingStatusResponse {
  action: 'complete' | 'start' | 'continue' | 'setFocus';
  trackId?: string;
  currentStep?: number;
}

type Assessment = ProgressAssessment;

interface User {
  ageGrade?: number;
  focusTrack?: string;
}

/**
 * Get onboarding status for a user based on their recent assessments (last 7 days)
 */
export const getOnboardingStatus = async (userId: string): Promise<OnboardingStatusResponse> => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  // First check if user exists and has a focus track
  const userResult = await dynamoDB.send(new GetCommand({
    TableName: 'FastMath2',
    Key: {
      PK: `USER#${userId}`,
      SK: 'PROFILE'
    }
  }));

  if (!userResult.Item) {
    throw new Error('User not found');
  }

  const user = userResult.Item as User;

  // Warn and default if ageGrade is missing
  if (user.ageGrade === undefined) {
    console.warn(`User ${userId} missing ageGrade; defaulting to 0`);
  }

  // If user already has a focus track, they've completed onboarding
  if (user.focusTrack) {
    return { action: 'complete' };
  }

  // Get user's progress assessments
  const assessmentResults = await dynamoDB.send(new QueryCommand({
    TableName: 'FastMath2',
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      // Prefix must match the exact SK used by progressAssessmentService (no underscore)
      ':sk': 'PROGRESSASSESSMENT#'
    }
  }));

  if (!assessmentResults.Items || assessmentResults.Items.length === 0) {
    // No assessments found, start with first track
    return {
      action: 'start',
      trackId: ONBOARDING_ASSESSMENT_SEQUENCE[0],
      currentStep: 1
    };
  }

  // Filter assessments to only those from the last week (7 days)
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  const recentAssessments = assessmentResults.Items.filter(assessment => {
    const assessmentDate = new Date((assessment as any).startDate);
    return assessmentDate >= oneWeekAgo;
  }) as Assessment[];

  // Filter to onboarding sequence tracks only
  const recentOnboardingAssessments = recentAssessments.filter(assessment => 
    ONBOARDING_ASSESSMENT_SEQUENCE.includes(assessment.trackId as any)
  );

  if (recentOnboardingAssessments.length === 0) {
    // No recent onboarding assessments found, start from beginning
    return {
      action: 'start',
      trackId: ONBOARDING_ASSESSMENT_SEQUENCE[0],
      currentStep: 1
    };
  }

  // Sort recent assessments by creation date to get the most recent
  const sortedRecentAssessments = recentOnboardingAssessments.sort((a, b) => {
    const dateA = new Date((a as any).startDate).getTime();
    const dateB = new Date((b as any).startDate).getTime();
    return dateB - dateA;
  });

  // Analyze progress through the assessment sequence based on recent assessments
  const assessmentProgress = analyzeAssessmentProgress(sortedRecentAssessments, user);

  // Complete onboarding (set initial focus track) when required
  if (assessmentProgress.action === 'setFocus' && assessmentProgress.trackId) {
    await completeOnboarding(userId, assessmentProgress.trackId);
  }

  return assessmentProgress;
};

/**
 * Analyze assessment progress and determine next action
 */
function analyzeAssessmentProgress(recentAssessments: Assessment[], user: User): OnboardingStatusResponse {
  // 1. Determine the highest track index the user has attempted in the last 7 days
  const highestAttemptedIndex = recentAssessments.reduce((idx, a) => {
    const trackIdx = ONBOARDING_ASSESSMENT_SEQUENCE.indexOf(a.trackId as any);
    return trackIdx > idx ? trackIdx : idx;
  }, -1);

  if (highestAttemptedIndex === -1) {
    return { action: 'start', trackId: ONBOARDING_ASSESSMENT_SEQUENCE[0], currentStep: 1 };
  }

  const currentTrackId = ONBOARDING_ASSESSMENT_SEQUENCE[highestAttemptedIndex];

  // 2. Gather all attempts (any status) for that track
  const attemptsForTrack = recentAssessments.filter(a => a.trackId === currentTrackId);

  // 3. Check if ANY completed attempt meets the CQPM target
  const userGrade = user.ageGrade || 0;
  const targetCQPM = CQPM_TARGETS[userGrade];

  const passed = attemptsForTrack.some(a => {
    if (a.status !== 'completed') return false;
    const cqpm = (a as any).overallCQPM ?? (a as any).cqpm ?? 0;
    return cqpm >= targetCQPM;
  });

  if (passed) {
    const nextIndex = highestAttemptedIndex + 1;
    if (nextIndex >= ONBOARDING_ASSESSMENT_SEQUENCE.length) {
      // All tracks done → give user access to every track
      return { action: 'setFocus', trackId: 'ALL' };
    }
    return { action: 'continue', trackId: ONBOARDING_ASSESSMENT_SEQUENCE[nextIndex], currentStep: nextIndex + 1 };
  }

  // 4. If there is a completed attempt but it’s below target → set focus to current track
  const hasCompletedAttempt = attemptsForTrack.some(a => a.status === 'completed');
  if (hasCompletedAttempt) {
    return { action: 'setFocus', trackId: currentTrackId };
  }

  // 5. Otherwise still working on this track → continue
  return { action: 'continue', trackId: currentTrackId, currentStep: highestAttemptedIndex + 1 };
}

/**
 * Set the user's focus track and complete onboarding
 * Also updates OneRoster class enrollment to match the assigned track
 */
export const completeOnboarding = async (userId: string, trackId: string): Promise<void> => {
  // First get the user's email to update OneRoster enrollment
  let userEmail: string | null = null;
  try {
    const userResult = await dynamoDB.send(new GetCommand({
      TableName: 'FastMath2',
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE'
      }
    }));
    
    if (userResult.Item?.email) {
      userEmail = userResult.Item.email as string;
    }
  } catch (error) {
    console.error(`Error getting user email for OneRoster enrollment update:`, error);
  }
  
  // Retry with exponential back-off to ensure the focus track is actually written.
  const MAX_ATTEMPTS = 5;
  let delayMs = 200; // Initial back-off delay

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await setInitialFocusTrack(userId, trackId);

      if (result.success) {
        // XP is now awarded based on active time, not onboarding events
        
        // Successfully set focus track, now update OneRoster enrollment
        if (userEmail) {
          try {
            const enrollmentResult = await updateUserClassEnrollment(userId, userEmail, trackId);
            
            if (enrollmentResult.success) {
              console.log(`Successfully updated OneRoster enrollment: ${enrollmentResult.message}`);
            } else {
              console.error(`Failed to update OneRoster enrollment: ${enrollmentResult.message}`);
              // Don't fail the entire onboarding process if OneRoster update fails
            }
          } catch (enrollmentError) {
            console.error(`Error updating OneRoster enrollment for ${userEmail}:`, enrollmentError);
            // Don't fail the entire onboarding process if OneRoster update fails
          }
        } else {
          console.warn(`Could not update OneRoster enrollment - user email not found for userId ${userId}`);
        }
        
        return; // Success – exit early
      }

      // If the error is not transient (e.g. user not found or invalid track) don't keep retrying
      const permanentFailure = result.message?.includes('Invalid track') || result.message?.includes('User not found');
      if (permanentFailure) {
        throw new Error(result.message);
      }
    } catch (error) {
      // For AWS SDK errors or other unknown errors we'll retry unless we're out of attempts.
      if (attempt === MAX_ATTEMPTS) {
        throw error instanceof Error ? error : new Error('Failed to set focus track');
      }
    }

    // Wait before next attempt (simple exponential back-off)
    await new Promise(resolve => setTimeout(resolve, delayMs));
    delayMs *= 2;
  }
}; 