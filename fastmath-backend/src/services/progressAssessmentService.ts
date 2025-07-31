import { getTrackFacts } from './getTrackFactsService';
import { Question, Fact } from '../types';
import { ProgressAssessment, ProgressAssessmentUpdate, FactScore, ProgressAssessmentResponse } from '../types/progressAssessment';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createAndSubmitAssessmentResult } from './oneRosterService';
import { sendAssessmentCompletion } from './webhookService';
import { updateDailyGoalProgressService } from './dailyGoalsService';
import activityMetricsService from './activityMetricsService';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});
const TABLE_NAME = 'FastMath2';

const getAssessment = async (userId: string, assessmentId: string): Promise<ProgressAssessment | null> => {
    const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': `PROGRESSASSESSMENT#${assessmentId}`
        }
    };

    const result = await dynamoDB.send(new QueryCommand(params));
    if (!result.Items || result.Items.length === 0) {
        return null;
    }

    return result.Items[0] as ProgressAssessment;
};

const saveAssessment = async (assessment: ProgressAssessment, retryCount = 0): Promise<void> => {
    try {
        await dynamoDB.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: assessment
        }));
        
        // Only verify completed assessments
        if (assessment.status === 'completed' && retryCount === 0) {
            try {
                const verifyParams = {
                    TableName: TABLE_NAME,
                    KeyConditionExpression: 'PK = :pk AND SK = :sk',
                    ExpressionAttributeValues: {
                        ':pk': assessment.PK,
                        ':sk': assessment.SK
                    }
                };
                
                const verifyResult = await dynamoDB.send(new QueryCommand(verifyParams));
                const verifiedItem = verifyResult.Items?.[0] as ProgressAssessment;
                
                if (!verifiedItem || verifiedItem.status !== 'completed') {
                    // Retry the save if verification failed
                    if (retryCount < 2) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        return saveAssessment(assessment, retryCount + 1);
                    }
                }
            } catch (verifyError) {
                console.error('Error verifying assessment save:', verifyError);
            }
        }
    } catch (error) {
        if (retryCount < 2) {
            await new Promise(resolve => setTimeout(resolve, 500));
            return saveAssessment(assessment, retryCount + 1);
        }
        throw error;
    }
};

export const createProgressAssessment = async (
  userId: string,
  trackId: string,
  duration: number
): Promise<string> => {
  const assessmentId = uuidv4();
  
  // Create initial assessment object
  const assessment = {
    PK: `USER#${userId}`,
    SK: `PROGRESSASSESSMENT#${assessmentId}`,
    assessmentId,
    startDate: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    status: 'assigned' as const,
    overallCQPM: 0,
    accuracyRate: 0,
    facts: {} as Record<string, FactScore>,
    trackId,
    duration
  } satisfies ProgressAssessment;

  await saveAssessment(assessment);
  return assessmentId;
};

export const startProgressAssessment = async (userId: string, trackId: string): Promise<ProgressAssessmentResponse> => {
  // Find the newest assigned assessment for the specific track
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    FilterExpression: '#status = :status AND trackId = :trackId',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'PROGRESSASSESSMENT#',
      ':status': 'assigned',
      ':trackId': trackId
    },
    ExpressionAttributeNames: {
      '#status': 'status'
    }
  };

  const result = await dynamoDB.send(new QueryCommand(params));
  
  let assessment: ProgressAssessment;
  
  if (!result.Items || result.Items.length === 0) {
    // No assigned assessment found, create a new one
    const assessmentId = await createProgressAssessment(userId, trackId, 2); // Default 2 minutes duration
    const newAssessment = await getAssessment(userId, assessmentId);
    if (!newAssessment) {
      throw new Error('Failed to create new assessment');
    }
    assessment = newAssessment;
  } else {
    // Get the newest assessment based on startDate
    assessment = result.Items.reduce<ProgressAssessment>((newest, current) => {
      return !newest || current.startDate > newest.startDate ? current as ProgressAssessment : newest;
    }, result.Items[0] as ProgressAssessment);
  }

  const { questions } = await getProgressAssessmentQuestions(assessment.trackId, userId);

  // Initialize facts with question data
  questions.forEach(question => {
    // Extract factId from the question id (remove -reversed if present)
    const factId = question.id.split('-')[0].replace('FACT#', '');
    assessment.facts[question.id] = {
      attempts: 0,
      correct: 0,
      timeSpent: 0,
      cqpm: 0,
      accuracyRate: 0,
      num1: question.num1,
      num2: question.num2,
      operator: question.operator,
      answer: question.answer
    };
  });

  // Update lastUpdated timestamp only
  assessment.lastUpdated = new Date().toISOString();
  await saveAssessment(assessment);

  return {
    assessmentId: assessment.assessmentId,
    questions
  };
};

const getProgressAssessmentQuestions = async (trackId: string, userId?: string): Promise<{ questions: Question[] }> => {
  // Get facts from specified learning track
  const rawFacts = await getTrackFacts(trackId);
  if (!rawFacts || rawFacts.length === 0) {
    throw new Error(`No facts received from track ${trackId}`);
  }

  // Convert raw facts to Fact type and validate
  const facts = rawFacts
    .filter((item): item is Fact => 
      item !== undefined && 
      typeof item.PK === 'string' &&
      typeof item.SK === 'string' &&
      typeof item.factId === 'string' &&
      typeof item.operand1 === 'number' &&
      typeof item.operand2 === 'number' &&
      typeof item.result === 'number' &&
      ['addition', 'subtraction', 'multiplication', 'division'].includes(item.operation)
    );

  // Sort facts by their numeric ID to ensure consistent ordering
  const sortedFacts = facts.sort((a, b) => {
    const aNum = parseInt(a.factId.substring(4)); // Remove 'FACT' prefix
    const bNum = parseInt(b.factId.substring(4));
    return aNum - bNum;
  });

  let questionsToUse = sortedFacts;

  // If userId is provided, prioritize unattempted facts
  if (userId) {
    try {
      // Get user progress for this track
      const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': `PROGRESS#${trackId}`
        }
      };

      const result = await dynamoDB.send(new QueryCommand(params));
      const userProgress = result.Items?.[0];

      if (userProgress && userProgress.facts) {
        // Get list of attempted fact IDs (extract factId from FACT# prefix)
        const attemptedFactIds = Object.keys(userProgress.facts).map(factKey => 
          factKey.replace('FACT#', '')
        );

        // Identify unattempted facts
        const unattemptedFacts = sortedFacts.filter(fact => {
          const factId = fact.factId.replace('FACT', '');
          return !attemptedFactIds.includes(factId);
        });

        if (unattemptedFacts.length > 0) {
          // Use unattempted facts
          questionsToUse = unattemptedFacts;
          console.log(`Using ${unattemptedFacts.length} unattempted facts for track ${trackId}`);
        } else {
          // All facts have been attempted, use all facts
          questionsToUse = sortedFacts;
          console.log(`All facts attempted for track ${trackId}, using all ${sortedFacts.length} facts`);
        }
      } else {
        // No user progress found, all facts are unattempted
        questionsToUse = sortedFacts;
        console.log(`No user progress found for track ${trackId}, using all ${sortedFacts.length} facts`);
      }
    } catch (error) {
      console.error('Error fetching user progress, using all facts:', error);
      questionsToUse = sortedFacts;
    }
  }

  // Shuffle and limit to 120 facts (or all if less than 120)
  const shuffledFacts = shuffleArray(questionsToUse);
  const limitedFacts = shuffledFacts.slice(0, Math.min(120, shuffledFacts.length));
  
  // Generate questions from the selected facts
  const questions = limitedFacts.map(fact => createQuestion(fact));
  
  return { questions };
};

const createQuestion = (fact: Fact): Question => ({
  id: fact.PK,
  num1: fact.operand1,
  num2: fact.operand2,
  operator: getOperatorSymbol(fact.operation),
  answer: fact.result,
});

const getOperatorSymbol = (operation: string): string => {
  switch (operation) {
    case 'addition': return '+';
    case 'subtraction': return '-';
    case 'multiplication': return '×';
    case 'division': return '÷';
    default: throw new Error(`Unknown operation: ${operation}`);
  }
};

const shuffleArray = <T>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export const updateAssessmentProgress = async (userId: string, update: ProgressAssessmentUpdate): Promise<ProgressAssessment> => {
  // First, verify the assessment exists
  const existingAssessment = await getAssessment(userId, update.assessmentId);
  if (!existingAssessment) {
    throw new Error(`Assessment not found for user ${userId} and assessment ${update.assessmentId}`);
  }

  const currentTimestamp = new Date().toISOString();

  // Process each fact in the update using atomic updates
  const updatePromises = Object.entries(update.facts).map(async ([factId, newFact]) => {
    // Check if this update contains an incorrect answer
    const hasIncorrectAnswer = newFact.attempts > newFact.correct;

    // If there's an incorrect answer, we need to retrieve the user progress for this fact
    if (hasIncorrectAnswer) {
      try {
        // Extract the factId from the question id (remove -reversed if present)
        const baseFactId = factId.split('-')[0].replace('FACT#', '');
        const params = {
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND SK = :sk',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': `PROGRESS#${existingAssessment.trackId}`
          }
        };

        const result = await dynamoDB.send(new QueryCommand(params));
        if (result.Items && result.Items.length > 0) {
          const userProgress = result.Items[0];
          
          // Check if the fact exists in the user progress
          if (userProgress.facts && userProgress.facts[baseFactId]) {
            const factProgress = userProgress.facts[baseFactId];
            const currentStatus = factProgress.status;

            // Update fact status based on the current status if there's an incorrect answer
            let newStatus = currentStatus;
            if (currentStatus === 'fluency1Practice') {
              newStatus = 'fluency1_5Practice';
            } else if (currentStatus === 'fluency1_5Practice') {
              newStatus = 'fluency2Practice';
            } else if (currentStatus === 'fluency2Practice') {
              newStatus = 'fluency3Practice';
            } else if (currentStatus === 'fluency3Practice') {
              newStatus = 'fluency6Practice';
            }

            // If status needs to be changed, update the user progress
            if (newStatus !== currentStatus) {
              userProgress.facts[baseFactId].status = newStatus;
              userProgress.facts[baseFactId].statusUpdatedDate = currentTimestamp;
              
              // Save the updated user progress
              await dynamoDB.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: userProgress
              }));

              console.log(`Downgraded fact ${baseFactId} status from ${currentStatus} to ${newStatus} due to incorrect answer`);
            }
          }
        }
      } catch (error) {
        console.error('Error updating fact status based on incorrect answer:', error);
      }
    }

    // Atomic update for each fact's attempts, correct answers, and timeSpent
    try {
      // Check if fact exists first to determine if we need an UpdateExpression that initializes or updates
      const existingFact = existingAssessment.facts[factId];
      
      if (!existingFact) {
        // Fact doesn't exist yet - use UpdateExpression to create it
        const params = {
          TableName: TABLE_NAME,
          Key: {
            PK: `USER#${userId}`,
            SK: `PROGRESSASSESSMENT#${update.assessmentId}`
          },
          UpdateExpression: `SET #facts.#factId = :factData, lastUpdated = :timestamp, 
                              #statusField = :statusValue`,
          ExpressionAttributeNames: {
            "#facts": "facts",
            "#factId": factId,
            "#statusField": "status"
          },
          ExpressionAttributeValues: {
            ":factData": {
              attempts: newFact.attempts,
              correct: newFact.correct,
              timeSpent: newFact.timeSpent,
              accuracyRate: newFact.attempts > 0 ? (newFact.correct / newFact.attempts) * 100 : 0,
              num1: existingAssessment.facts[factId]?.num1,
              num2: existingAssessment.facts[factId]?.num2,
              operator: existingAssessment.facts[factId]?.operator,
              answer: existingAssessment.facts[factId]?.answer
            },
            ":timestamp": currentTimestamp,
            ":statusValue": existingAssessment.status === 'assigned' ? 'in_progress' : existingAssessment.status
          }
        };

        try {
          await dynamoDB.send(new UpdateCommand(params));
        } catch (updateError) {
          console.error(`Error creating new fact ${factId} for assessment ${update.assessmentId}:`, updateError);
          throw updateError;
        }
      } else {
        // Fact exists - use UpdateExpression with atomic counters
        const params = {
          TableName: TABLE_NAME,
          Key: {
            PK: `USER#${userId}`,
            SK: `PROGRESSASSESSMENT#${update.assessmentId}`
          },
          UpdateExpression: `SET #facts.#factId.attempts = #facts.#factId.attempts + :attemptsIncrement,
                              #facts.#factId.correct = #facts.#factId.correct + :correctIncrement,
                              #facts.#factId.timeSpent = #facts.#factId.timeSpent + :timeSpentIncrement,
                              #facts.#factId.accuracyRate = :newAccuracyRate,
                              lastUpdated = :timestamp,
                              #statusField = :statusValue`,
          ExpressionAttributeNames: {
            "#facts": "facts",
            "#factId": factId,
            "#statusField": "status"
          },
          ExpressionAttributeValues: {
            ":attemptsIncrement": newFact.attempts,
            ":correctIncrement": newFact.correct,
            ":timeSpentIncrement": newFact.timeSpent,
            ":newAccuracyRate": (existingFact.attempts + newFact.attempts) > 0 ? 
              ((existingFact.correct + newFact.correct) / (existingFact.attempts + newFact.attempts)) * 100 : 0,
            ":timestamp": currentTimestamp,
            ":statusValue": existingAssessment.status === 'assigned' ? 'in_progress' : existingAssessment.status
          }
        };

        try {
          await dynamoDB.send(new UpdateCommand(params));
        } catch (updateError) {
          console.error(`Error updating fact ${factId} for assessment ${update.assessmentId}:`, updateError);
          throw updateError;
        }
      }
    } catch (error) {
      console.error(`Error atomically updating fact ${factId}:`, error);
      throw error;
    }
  });

  // Wait for all fact updates to complete
  await Promise.all(updatePromises);

  // Do a final read to get the complete updated assessment
  const finalAssessment = await getAssessment(userId, update.assessmentId);
  if (!finalAssessment) {
    throw new Error(`Failed to retrieve updated assessment for user ${userId} and assessment ${update.assessmentId}`);
  }

  // Calculate overall accuracy rate from updated facts
  const assessmentTotals = Object.values(finalAssessment.facts).reduce((totals, fact) => ({
    attempts: totals.attempts + fact.attempts,
    correctAttempts: totals.correctAttempts + fact.correct
  }), { attempts: 0, correctAttempts: 0 });

  // Update the overall assessment accuracy in a final atomic update
  const finalUpdateParams = {
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: `PROGRESSASSESSMENT#${update.assessmentId}`
    },
    UpdateExpression: "SET accuracyRate = :accuracyRate",
    ExpressionAttributeValues: {
      ":accuracyRate": assessmentTotals.attempts > 0 ? 
        (assessmentTotals.correctAttempts / assessmentTotals.attempts) * 100 : 0
    }
  };

  await dynamoDB.send(new UpdateCommand(finalUpdateParams));

  // Return the fully updated assessment
  return finalAssessment;
};

export const completeAssessmentProgress = async (
  userId: string, 
  assessmentId: string,
  timingMetadata?: {
    totalTypingTimeDeducted: number;
    totalTransitionTime: number;
    actualDurationMinutes: number;
    testType?: 'TotalTimer' | 'QuestionTimer';
    clientSideStats?: {
      totalAttempts: number;
      totalCorrect: number;
    }
  }
): Promise<ProgressAssessment> => {
  // Get existing assessment using PK and SK
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK = :sk',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': `PROGRESSASSESSMENT#${assessmentId}`
    }
  };

  const result = await dynamoDB.send(new QueryCommand(params));
  if (!result.Items || result.Items.length === 0) {
    throw new Error(`Assessment not found for assessment ${assessmentId}`);
  }

  const existingAssessment = result.Items[0] as ProgressAssessment;

  // Idempotent handling: if the assessment is already completed, return it as-is
  if (existingAssessment.status === 'completed') {
    return existingAssessment;
  }

  const currentTimestamp = new Date().toISOString();

  // Always prioritize client-side stats if available, otherwise calculate from facts
  const totalCorrect = timingMetadata?.clientSideStats?.totalCorrect ??
    Object.values(existingAssessment.facts).reduce((sum, fact) => sum + fact.correct, 0);
  
  const totalAttempts = timingMetadata?.clientSideStats?.totalAttempts ??
    Object.values(existingAssessment.facts).reduce((sum, fact) => sum + fact.attempts, 0);

  // Use actual duration if provided, otherwise use the original duration
  const totalDurationMinutes = timingMetadata?.actualDurationMinutes ?? existingAssessment.duration;
  
  // Divide typing time by 3 and transition time by 10 to be conservative with deductions
  const typingTimeMinutes = ((timingMetadata?.totalTypingTimeDeducted || 0) / 60000) / 3; // Convert ms to minutes and divide by 3
  const transitionTimeMinutes = ((timingMetadata?.totalTransitionTime || 0) / 60000) / 10; // Convert ms to minutes and divide by 10
  
  // Calculate effective time (total duration minus typing and transition times)
  const effectiveTimeMinutes = Math.max(0.1, totalDurationMinutes - typingTimeMinutes - transitionTimeMinutes);

  // Calculate final CQPM using effective time
  const overallCQPM = totalCorrect / effectiveTimeMinutes;
  const accuracyRate = totalAttempts > 0 ? (totalCorrect / totalAttempts) * 100 : 0;

  // Create a new assessment object with completed status
  const completedAssessment: ProgressAssessment = {
    ...existingAssessment,
    lastUpdated: currentTimestamp,
    status: 'completed' as const,
    overallCQPM,
    accuracyRate,
    testType: timingMetadata?.testType
  };
  
  let savedAssessment: ProgressAssessment;
  
  try {
    // Try direct DynamoDB update first
    await dynamoDB.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: completedAssessment,
      ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)'
    }));
    
    // Verify the update was successful
    const verifyParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': completedAssessment.PK,
        ':sk': completedAssessment.SK
      }
    };
    
    const verifyResult = await dynamoDB.send(new QueryCommand(verifyParams));
    const verifiedAssessment = verifyResult.Items?.[0] as ProgressAssessment;
    
    if (verifiedAssessment && verifiedAssessment.status === 'completed') {
      savedAssessment = verifiedAssessment;
    } else {
      // Fallback to using our helper function with retries
      await saveAssessment(completedAssessment);
      savedAssessment = completedAssessment;
    }
  } catch (error) {
    // Fallback to using our helper function with retries
    await saveAssessment(completedAssessment);
    savedAssessment = completedAssessment;
  }
  
  // Get user email and check if they came via Speedrun magic link
  // Will capture OneRoster sourcedId if available
  let rosterSourcedId: string | undefined;

  try {
    const userParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'PROFILE'
      }
    };

    const userResult = await dynamoDB.send(new QueryCommand(userParams));
    const userProfile = userResult.Items?.[0];
    
    // Capture OneRoster sourcedId for later use
    rosterSourcedId = userProfile?.oneRosterSourcedId;
    
    // Check if user has speedrunTrackId in their profile (indicating they came via Speedrun magic link)
    if (userProfile?.email && userProfile.speedrunTrackId) {
      // Fire-and-forget webhook call (asynchronous - no await)
      sendAssessmentCompletion({
        email: userProfile.email,
        trackId: userProfile.speedrunTrackId,
        cqpmScore: savedAssessment.overallCQPM,
        completedAt: currentTimestamp,
        assessmentId
      }).catch(error => {
        // Log error but don't throw - this is fire-and-forget
        console.error('Webhook failed:', error);
      });
    }
  } catch (error) {
    console.error('Error processing webhook for Speedrun integration:', error);
  }
  
  // Now submit the assessment results to OneRoster
  try {
    // Get the user's ID without prefix
    const userIdWithoutPrefix = userId.replace('USER#', '');
    
    // Prefer OneRoster sourcedId if available, otherwise fall back to internal userId
    const studentSourcedId = rosterSourcedId || userIdWithoutPrefix;
    
    // Determine which assessment line item to use based on trackId
    const getAssessmentLineItemId = (trackId: string): string => {
      switch (trackId) {
        case 'TRACK1':
        case 'TRACK6':
        case 'TRACK9':   // Addition (Single-Digit)
        case 'TRACK12':  // Addition Within 10
          return 'fastmath-addition-progress-assessment';
        case 'TRACK2':
        case 'TRACK8':
        case 'TRACK10':  // Subtraction (Single-Digit)
          return 'fastmath-subtraction-progress-assessment';
        case 'TRACK3':
        case 'TRACK7':
        case 'TRACK11':  // Multiplication (Single-digit)
          return 'fastmath-multiplication-progress-assessment';
        case 'TRACK4':
        case 'TRACK5':
          return 'fastmath-division-progress-assessment';
        default:
          console.warn(`Unknown track ID: ${trackId}, defaulting to addition assessment`);
          return 'fastmath-addition-progress-assessment';
      }
    };
    
    // Get the appropriate assessmentLineItemId based on the track
    const assessmentLineItemId = getAssessmentLineItemId(savedAssessment.trackId);
    
    // Determine if fluent based on CQPM threshold
    const isFluent = savedAssessment.overallCQPM >= 40;
    
    // Round CQPM to nearest integer for the score
    const score = Math.round(savedAssessment.overallCQPM);
    
    // Build metadata
    const metadata = {
      cqpm: savedAssessment.overallCQPM,
      accuracyRate: savedAssessment.accuracyRate,
      attempts: totalAttempts,
      correct: totalCorrect,
      fluent: isFluent ? "Yes" : "No"
    };
    
    // Submit to OneRoster using the correct sourcedId
    console.log(`Submitting assessment results to OneRoster for user ${studentSourcedId}, assessment ${assessmentLineItemId}`);
    
    const oneRosterResult = await createAndSubmitAssessmentResult(
      assessmentLineItemId,
      score,
      studentSourcedId,
      metadata
    );
    
    console.log('OneRoster assessment result submission:', oneRosterResult);
  } catch (error) {
    // Log the error but don't fail the assessment completion
    console.error('Error submitting assessment result to OneRoster:', error);
  }
  
  // Update assessment daily goal progress
  try {
    console.log(`[ProgressAssessment] Updating assessment goal progress for user ${userId}, track ${savedAssessment.trackId}`);
    await updateDailyGoalProgressService(userId, savedAssessment.trackId, 'assessment', 1);
    console.log(`[ProgressAssessment] Successfully updated assessment goal progress`);
  } catch (error) {
    // Log the error but don't fail the assessment completion
    console.error('[ProgressAssessment] Failed to update assessment goal progress:', error);
  }
  
  // XP is now awarded based on active time, not assessment completion
  
  return savedAssessment;
};

export const getUserAssessments = async (userId: string): Promise<ProgressAssessment[]> => {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'PROGRESSASSESSMENT#'
    }
  };

  const result = await dynamoDB.send(new QueryCommand(params));
  if (!result.Items) {
    return [];
  }

  return result.Items as ProgressAssessment[];
};