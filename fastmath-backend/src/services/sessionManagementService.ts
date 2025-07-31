import { Fact } from '../types';
import { FactStatus, UserProgress } from '../types/progress';
import { 
    GetSessionRequest, 
    GetSessionResponse, 
    FactWithProgress,
    FluencyLevel
} from '../types/sessionManagement';
import { getUserProgressService } from './userProgressService';
import { getTrackFacts } from './getTrackFactsService';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { TRACK_RANGES } from '../types/constants';
import { isSameDay, isDueToday, getTodayNormalized, normalizeDateToDay } from '../utils/dateUtils';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});
const TABLE_NAME = 'FastMath2';

// Minimum number of facts to include in practice sessions
const MIN_PRACTICE_FACTS = 10;
// Maximum number of facts to include in practice sessions
const MAX_PRACTICE_FACTS = 40;
// Maximum number of days between progress assessments
const MAX_DAYS_BETWEEN_ASSESSMENTS = 30;

// Mapping of fluency levels to their numeric values for comparison
const FLUENCY_LEVEL_VALUES: Record<FluencyLevel, number> = {
    '6s': 6,
    '3s': 3,
    '2s': 2,
    '1.5s': 1.5,
    '1s': 1
};

// Mapping of fact status to fluency level
const FACT_STATUS_TO_FLUENCY_LEVEL: Record<FactStatus, FluencyLevel | null> = {
    'notStarted': null,
    'learning': null,
    'accuracyPractice': null,
    'fluency6Practice': '6s',
    'fluency3Practice': '3s',
    'fluency2Practice': '2s',
    'fluency1_5Practice': '1.5s',
    'fluency1Practice': '1s',
    'mastered': null, // This depends on the user's target fluency
    'automatic': null
};

/**
 * Gets the count of progress assessments completed today for a user and track
 * @param userId The user ID
 * @param trackId The track ID
 * @returns The count of assessments completed today
 */
const getTodayProgressAssessmentCount = async (userId: string, trackId: string): Promise<number> => {
    const today = getTodayNormalized();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: '#status = :status AND trackId = :trackId AND lastUpdated BETWEEN :startOfDay AND :endOfDay',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': 'PROGRESSASSESSMENT#',
            ':status': 'completed',
            ':trackId': trackId,
            ':startOfDay': startOfDay.toISOString(),
            ':endOfDay': endOfDay.toISOString()
        }
    };

    const result = await dynamoDB.send(new QueryCommand(params));
    return result.Items ? result.Items.length : 0;
};

/**
 * Gets the most recent completed progress assessment for a user and a specific track
 * @param userId The user ID
 * @param trackId The track ID
 * @returns The date of the most recent completed progress assessment, or null if none found
 */
const getLastCompletedProgressAssessment = async (userId: string, trackId: string): Promise<Date | null> => {
    const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: '#status = :status AND trackId = :trackId',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': 'PROGRESSASSESSMENT#',
            ':status': 'completed',
            ':trackId': trackId
        }
    };

    const result = await dynamoDB.send(new QueryCommand(params));
    
    if (!result.Items || result.Items.length === 0) {
        return null;
    }
    
    // Find the most recent completed assessment by lastUpdated date
    const sortedAssessments = result.Items.sort((a, b) => {
        const dateA = new Date(a.lastUpdated);
        const dateB = new Date(b.lastUpdated);
        return dateB.getTime() - dateA.getTime(); // Sort in descending order (most recent first)
    });
    
    // Return the lastUpdated date of the most recent assessment
    return new Date(sortedAssessments[0].lastUpdated);
};

/**
 * Determines if a progress assessment is needed based on the last assessment date
 * @param userId The user ID
 * @param trackId The track ID
 * @returns True if no previous assessment found or last assessment was more than 5 days ago
 */
const isProgressAssessmentNeeded = async (userId: string, trackId: string): Promise<boolean> => {
    // Always allow progress assessments - no time restrictions
    return true;
};

/**
 * Gets facts with a specific status from user progress
 * @param progress The user's progress
 * @param status The fact status to filter by
 * @param allFacts All facts in the track
 * @returns An array of facts with the specified status
 */
const getFactsWithStatus = (
    progress: UserProgress, 
    status: FactStatus, 
    allFacts: Fact[]
): FactWithProgress[] => {
    // Get all fact IDs with the specified status
    const factIds = Object.entries(progress.facts)
        .filter(([_, factProgress]) => factProgress.status === status)
        .map(([factId]) => factId);

    // Match with actual facts and add progress status
    return allFacts
        .filter(fact => factIds.includes(fact.factId))
        .map(fact => {
            const factProgress = progress.facts[fact.factId];
            return {
                ...fact,
                progressStatus: status,
                lastAttemptDate: factProgress.lastAttemptDate,
                accuracyStreak: factProgress.accuracyProgress?.streak,
                // Add retention information for mastered facts
                retentionDay: factProgress.retentionDay,
                nextRetentionDate: factProgress.nextRetentionDate
            };
        })
        .sort((a, b) => {
            // Sort by factId number (strip 'FACT' prefix and convert to number)
            const aNum = parseInt(a.factId.substring(4));
            const bNum = parseInt(b.factId.substring(4));
            return aNum - bNum;
        });
};

/**
 * Gets facts that don't have a status yet (notStarted)
 * @param progress The user's progress
 * @param allFacts All facts in the track
 * @returns An array of facts without a status
 */
const getFactsWithNoStatus = (
    progress: UserProgress,
    allFacts: Fact[]
): FactWithProgress[] => {
    // Find all factIds in the track's progress
    const progressedFactIds = new Set(Object.keys(progress.facts));
    
    // Get facts that aren't in the progress yet (no status)
    return allFacts
        .filter(fact => !progressedFactIds.has(fact.factId))
        .map(fact => ({
            ...fact,
            progressStatus: 'notStarted' as FactStatus,
            lastAttemptDate: undefined,
            accuracyStreak: 0
        }))
        .sort((a, b) => {
            // Sort by factId number (strip 'FACT' prefix and convert to number)
            const aNum = parseInt(a.factId.substring(4));
            const bNum = parseInt(b.factId.substring(4));
            return aNum - bNum;
        });
};

/**
 * Filters accuracy practice facts to exclude those already attempted today
 * @param facts Array of facts to filter
 * @param progress The user's progress
 * @returns Filtered array of facts that haven't been attempted today
 */
const filterAccuracyFactsByDate = (facts: FactWithProgress[], progress: UserProgress): FactWithProgress[] => {
    // Return all facts without filtering - always include all accuracy facts regardless of attempts
    return facts;
};

/**
 * Sorts facts by their last attempt date (oldest first)
 * @param facts Array of facts to sort
 * @returns Sorted array of facts
 */
const sortFactsByLastAttemptDate = (facts: FactWithProgress[]): FactWithProgress[] => {
    return [...facts].sort((a, b) => {
        // If either fact doesn't have a lastAttemptDate, prioritize it
        if (!a.lastAttemptDate) return -1;
        if (!b.lastAttemptDate) return 1;
        
        // Sort by lastAttemptDate (oldest first)
        return new Date(a.lastAttemptDate).getTime() - new Date(b.lastAttemptDate).getTime();
    });
};

/**
 * Checks if this is a repetition case (all facts in the track have been attempted at least once)
 * @param userId The user ID
 * @param trackId The track ID
 * @returns True if all facts in the track have been attempted at least once
 */
const isRepetitionCase = async (userId: string, trackId: string): Promise<boolean> => {
    const userProgress = await getUserProgressService(userId);
    const currentTrackProgress = userProgress?.find(p => p.trackId === trackId);
    
    if (!currentTrackProgress) {
        return false;
    }

    const trackRange = TRACK_RANGES[trackId as keyof typeof TRACK_RANGES];
    if (!trackRange) {
        return false;
    }

    // Check if all facts in track have been attempted - indicating this is a repetition case
    const [startFact, endFact] = trackRange;
    
    // Iterate through all possible facts in the range
    for (let factNum = startFact; factNum <= endFact; factNum++) {
        const factId = `FACT${factNum}`;
        if ((currentTrackProgress.facts[factId]?.attempts || 0) === 0) {
            return false;
        }
    }
    
    // If we've checked all facts and none returned false, all facts have been attempted
    return true;
};

/**
 * Filters fluency practice facts to exclude those that have already completed 3 correct attempts today
 * @param facts Array of facts to filter
 * @param progress The user's progress
 * @returns Filtered array of facts that haven't completed 3 correct attempts today
 */
const filterFluencyFactsByCompletion = (facts: FactWithProgress[], progress: UserProgress): FactWithProgress[] => {
    // Return all facts without filtering - always include facts regardless of attempts
    return facts;
    
    // Previous implementation:
    // return facts.filter(fact => {
    //     const factProgress = progress.facts[fact.factId];
    //     if (!factProgress.todayStats) return true;
    //     
    //     // If all attempts were correct today and attempts >= 3, don't include it again
    //     return !(factProgress.todayStats.attempts >= 3 && 
    //            factProgress.todayStats.attempts === factProgress.todayStats.correct);
    // });
};

/**
 * Prepares fluency practice facts for a specific fluency level
 * @param fluencyFacts Facts at the specified fluency level
 * @param progress User progress
 * @param supplementaryFacts1 First choice for supplementary facts
 * @param supplementaryFacts2 Second choice for supplementary facts
 * @param fluencyLevel The fluency level
 * @param masteredFacts Optional mastered facts to use as last resort
 * @param additionalSupplementaryFacts Optional additional supplementary facts to use
 * @param automaticFacts Optional automatic facts to use as last resort
 * @param accuracyFacts Optional accuracy facts to use as primary source if fluencyFacts are empty
 * @returns Facts for the fluency practice or null if no facts are available
 */
const prepareFluencyPractice = (
    fluencyFacts: FactWithProgress[],
    progress: UserProgress,
    supplementaryFacts1: FactWithProgress[],
    supplementaryFacts2: FactWithProgress[],
    fluencyLevel: FluencyLevel,
    masteredFacts?: FactWithProgress[],
    additionalSupplementaryFacts?: {
        fluency2Facts?: FactWithProgress[],
        fluency1_5Facts?: FactWithProgress[],
        fluency1Facts?: FactWithProgress[]
    },
    automaticFacts?: FactWithProgress[],
    accuracyFacts?: FactWithProgress[]
): FactWithProgress[] | null => {
    // Special condition for fluency6Practice - if no fluency6Facts available, use accuracyFacts instead
    if (fluencyFacts.length === 0 && fluencyLevel === '6s' && accuracyFacts && accuracyFacts.length > 0) {
        fluencyFacts = accuracyFacts;
    }
    
    if (fluencyFacts.length === 0) {
        return null;
    }
    
    // Filter facts that have already completed their 3 correct attempts today
    const availableFluencyFacts = filterFluencyFactsByCompletion(fluencyFacts, progress);
    
    // *** FIX: Only return null if no primary facts AND no supplementary facts are available ***
    // Don't immediately return null if there are no available facts after filtering
    // Instead, continue to use supplementary sources if available
    const noAvailablePrimaryFacts = availableFluencyFacts.length === 0;
    
    // Filter mastered facts if provided
    let filteredMasteredFacts: FactWithProgress[] = [];
    if (masteredFacts && masteredFacts.length > 0) {
        // Remove condition that limited mastered facts to only fluency levels 2s and lower
        // Temporarily include all mastered facts without filtering
        filteredMasteredFacts = masteredFacts;
    }
    
    // Create a list of supplementary fact sources in priority order
    const supplementarySources: FactWithProgress[][] = [];
    
    // Only add available fluency facts if there are any
    if (!noAvailablePrimaryFacts) {
        supplementarySources.push(availableFluencyFacts);
    }
    
    // Add other supplementary facts
    if (supplementaryFacts1.length > 0) {
        supplementarySources.push(supplementaryFacts1);
    }
    
    if (supplementaryFacts2.length > 0) {
        supplementarySources.push(supplementaryFacts2);
    }
    
    // Add additional supplementary sources if provided
    if (additionalSupplementaryFacts) {
        if (additionalSupplementaryFacts.fluency2Facts && additionalSupplementaryFacts.fluency2Facts.length > 0) {
            supplementarySources.push(additionalSupplementaryFacts.fluency2Facts);
        }
        if (additionalSupplementaryFacts.fluency1_5Facts && additionalSupplementaryFacts.fluency1_5Facts.length > 0) {
            supplementarySources.push(additionalSupplementaryFacts.fluency1_5Facts);
        }
        if (additionalSupplementaryFacts.fluency1Facts && additionalSupplementaryFacts.fluency1Facts.length > 0) {
            supplementarySources.push(additionalSupplementaryFacts.fluency1Facts);
        }
    }
    
    // Add mastered facts as supplementary for all fluency levels now
    if (filteredMasteredFacts.length > 0) {
        supplementarySources.push(filteredMasteredFacts);
    }
    
    // Add automatic facts as the absolute last resort if provided
    if (automaticFacts && automaticFacts.length > 0) {
        supplementarySources.push(automaticFacts);
    }
    
    // If we have no sources at all, return null
    if (supplementarySources.length === 0) {
        return null;
    }
    
    // Build the final facts list using the prioritized sources
    const factsForPractice: FactWithProgress[] = [];
    const selectedFactIds = new Set<string>();
    
    // Add facts from each source until we reach the minimum count
    for (const source of supplementarySources) {
        if (factsForPractice.length >= MIN_PRACTICE_FACTS) {
            break;
        }
        
        // Add unique facts from this source
        for (const fact of sortFactsByLastAttemptDate(source)) {
            if (!selectedFactIds.has(fact.factId)) {
                factsForPractice.push(fact);
                selectedFactIds.add(fact.factId);
                
                if (factsForPractice.length >= MIN_PRACTICE_FACTS) {
                    break;
                }
            }
        }
    }
    
    // Return facts if we have any, otherwise null
    return factsForPractice.length > 0 ? factsForPractice : null;
};

/**
 * Counts the number of unattempted facts in a track (facts with no status or notStarted status)
 * @param progress The user's progress
 * @param allFacts All facts in the track
 * @returns The count of unattempted facts
 */
const countUnattemptedFacts = (progress: UserProgress, allFacts: Fact[]): number => {
    // Get facts with no status (not in progress at all)
    const factsWithNoStatus = getFactsWithNoStatus(progress, allFacts);
    
    // Get facts with notStarted status
    const factsWithNotStartedStatus = getFactsWithStatus(progress, 'notStarted', allFacts);
    
    // Return total count of unattempted facts
    return factsWithNoStatus.length + factsWithNotStartedStatus.length;
};

/**
 * Gets the session activities for a user based on their progress
 * @param request The request containing userId, trackId, and activityType
 * @returns The session response with available activities
 */
export const getSession = async (request: GetSessionRequest): Promise<GetSessionResponse> => {
    const { userId, trackId, activityType = 'all' } = request;
    
    // Check if a progress assessment is needed based on days since last completed assessment
    const needsProgressAssessment = await isProgressAssessmentNeeded(userId, trackId);
    
    // Get daily assessment count for today
    const dailyAssessmentCount = await getTodayProgressAssessmentCount(userId, trackId);
    
    // Get user progress for the track
    const progressItems = await getUserProgressService(userId);
    const progress = progressItems?.find(p => p.trackId === trackId);
    
    // Get all facts for the track
    const allFacts = await getTrackFacts(trackId) as Fact[];
    
    // If no progress exists, return assessment action
    if (!progress) {
        return {
            availableActivities: {},
            progressAssessment: needsProgressAssessment,
            dailyAssessmentCount
        };
    }
    
    // Get facts by status
    const learningFacts = getFactsWithStatus(progress, 'learning', allFacts);
    const accuracyFacts = getFactsWithStatus(progress, 'accuracyPractice', allFacts);
    const fluency6Facts = getFactsWithStatus(progress, 'fluency6Practice', allFacts);
    const fluency3Facts = getFactsWithStatus(progress, 'fluency3Practice', allFacts);
    const fluency2Facts = getFactsWithStatus(progress, 'fluency2Practice', allFacts);
    const fluency1_5Facts = getFactsWithStatus(progress, 'fluency1_5Practice', allFacts);
    const fluency1Facts = getFactsWithStatus(progress, 'fluency1Practice', allFacts);
    const masteredFacts = getFactsWithStatus(progress, 'mastered', allFacts);
    const automaticFacts = getFactsWithStatus(progress, 'automatic', allFacts);
    
    // Get both types of notStarted facts:
    // 1. Facts with explicit notStarted status
    const notStartedFactsWithStatus = getFactsWithStatus(progress, 'notStarted', allFacts);
    // 2. Facts that don't exist in progress at all
    const notStartedFactsWithoutStatus = getFactsWithNoStatus(progress, allFacts);
    // Combine both types of notStarted facts
    const notStartedFacts = [...notStartedFactsWithStatus, ...notStartedFactsWithoutStatus];
    
    // Count unattempted facts
    const unattemptedFactsCount = countUnattemptedFacts(progress, allFacts);
    
    // Build response flags
    const response: GetSessionResponse = {
        availableActivities: {},
        // Always serve progress assessment when needed, regardless of placement phase
        progressAssessment: needsProgressAssessment,
        dailyAssessmentCount
    };
    
    // Add learning activities if available and requested
    if (learningFacts.length > 0 && (activityType === 'all' || activityType === 'learn')) {
        let factsToLearn: Fact[];
        
        if (learningFacts.length >= 7) {
            factsToLearn = learningFacts.slice(0, 4);
        } else if (learningFacts.length >= 5) {
            factsToLearn = learningFacts.slice(0, 3);
        } else {
            factsToLearn = learningFacts;
        }
        
        response.availableActivities.learn = {
            facts: factsToLearn
        };
    }
    
    // Add accuracy practice activities if available and requested
    if (accuracyFacts.length > 0 && (activityType === 'all' || activityType === 'accuracyPractice')) {
        // Filter out facts that have already been attempted today
        const availableAccuracyFacts = filterAccuracyFactsByDate(accuracyFacts, progress);
        
        if (availableAccuracyFacts.length > 0) {
            // Create a combined list of facts for accuracy practice
            const factsForAccuracyPractice: FactWithProgress[] = [];
            const selectedFactIds = new Set<string>();
            
            // Add accuracy facts first (up to max limit)
            for (const fact of availableAccuracyFacts) {
                if (factsForAccuracyPractice.length >= MAX_PRACTICE_FACTS) {
                    break;
                }
                factsForAccuracyPractice.push(fact);
                selectedFactIds.add(fact.factId);
            }
            
            // Only add other fact types if we haven't reached the minimum count and max limit
            if (factsForAccuracyPractice.length < MIN_PRACTICE_FACTS && factsForAccuracyPractice.length < MAX_PRACTICE_FACTS) {
                // Add fluency6Facts as supplementary if still needed
                for (const fact of sortFactsByLastAttemptDate(fluency6Facts)) {
                    if (factsForAccuracyPractice.length >= MAX_PRACTICE_FACTS) {
                        break;
                    }
                    if (!selectedFactIds.has(fact.factId)) {
                        factsForAccuracyPractice.push(fact);
                        selectedFactIds.add(fact.factId);
                        
                        if (factsForAccuracyPractice.length >= MIN_PRACTICE_FACTS) {
                            break;
                        }
                    }
                }
                
                // Add fluency3Facts as supplementary if still needed
                if (factsForAccuracyPractice.length < MIN_PRACTICE_FACTS && factsForAccuracyPractice.length < MAX_PRACTICE_FACTS) {
                    for (const fact of sortFactsByLastAttemptDate(fluency3Facts)) {
                        if (factsForAccuracyPractice.length >= MAX_PRACTICE_FACTS) {
                            break;
                        }
                        if (!selectedFactIds.has(fact.factId)) {
                            factsForAccuracyPractice.push(fact);
                            selectedFactIds.add(fact.factId);
                            
                            if (factsForAccuracyPractice.length >= MIN_PRACTICE_FACTS) {
                                break;
                            }
                        }
                    }
                }
                
                // Add fluency2Facts as supplementary if still needed
                if (factsForAccuracyPractice.length < MIN_PRACTICE_FACTS && factsForAccuracyPractice.length < MAX_PRACTICE_FACTS) {
                    for (const fact of sortFactsByLastAttemptDate(fluency2Facts)) {
                        if (factsForAccuracyPractice.length >= MAX_PRACTICE_FACTS) {
                            break;
                        }
                        if (!selectedFactIds.has(fact.factId)) {
                            factsForAccuracyPractice.push(fact);
                            selectedFactIds.add(fact.factId);
                            
                            if (factsForAccuracyPractice.length >= MIN_PRACTICE_FACTS) {
                                break;
                            }
                        }
                    }
                }
                
                // Add fluency1_5Facts as supplementary if still needed
                if (factsForAccuracyPractice.length < MIN_PRACTICE_FACTS && factsForAccuracyPractice.length < MAX_PRACTICE_FACTS) {
                    for (const fact of sortFactsByLastAttemptDate(fluency1_5Facts)) {
                        if (factsForAccuracyPractice.length >= MAX_PRACTICE_FACTS) {
                            break;
                        }
                        if (!selectedFactIds.has(fact.factId)) {
                            factsForAccuracyPractice.push(fact);
                            selectedFactIds.add(fact.factId);
                            
                            if (factsForAccuracyPractice.length >= MIN_PRACTICE_FACTS) {
                                break;
                            }
                        }
                    }
                }
                
                // Add fluency1Facts as supplementary if still needed
                if (factsForAccuracyPractice.length < MIN_PRACTICE_FACTS && factsForAccuracyPractice.length < MAX_PRACTICE_FACTS) {
                    for (const fact of sortFactsByLastAttemptDate(fluency1Facts)) {
                        if (factsForAccuracyPractice.length >= MAX_PRACTICE_FACTS) {
                            break;
                        }
                        if (!selectedFactIds.has(fact.factId)) {
                            factsForAccuracyPractice.push(fact);
                            selectedFactIds.add(fact.factId);
                            
                            if (factsForAccuracyPractice.length >= MIN_PRACTICE_FACTS) {
                                break;
                            }
                        }
                    }
                }
                
                // Add mastered facts as supplementary if still needed
                if (factsForAccuracyPractice.length < MIN_PRACTICE_FACTS && factsForAccuracyPractice.length < MAX_PRACTICE_FACTS && masteredFacts.length > 0) {
                    // Use all mastered facts as supplementary
                    for (const fact of sortFactsByLastAttemptDate(masteredFacts)) {
                        if (factsForAccuracyPractice.length >= MAX_PRACTICE_FACTS) {
                            break;
                        }
                        if (!selectedFactIds.has(fact.factId)) {
                            factsForAccuracyPractice.push(fact);
                            selectedFactIds.add(fact.factId);
                            
                            if (factsForAccuracyPractice.length >= MIN_PRACTICE_FACTS) {
                                break;
                            }
                        }
                    }
                }
                
                // Add automatic facts as the last resort if still needed
                if (factsForAccuracyPractice.length < MIN_PRACTICE_FACTS && factsForAccuracyPractice.length < MAX_PRACTICE_FACTS) {
                    for (const fact of sortFactsByLastAttemptDate(automaticFacts)) {
                        if (factsForAccuracyPractice.length >= MAX_PRACTICE_FACTS) {
                            break;
                        }
                        if (!selectedFactIds.has(fact.factId)) {
                            factsForAccuracyPractice.push(fact);
                            selectedFactIds.add(fact.factId);
                            
                            if (factsForAccuracyPractice.length >= MIN_PRACTICE_FACTS) {
                                break;
                            }
                        }
                    }
                }
            }
            
            response.availableActivities.accuracyPractice = {
                facts: factsForAccuracyPractice
            };
        }
    }
    
    // Add fluency practice activities if available and requested
    if (activityType === 'all' || activityType === 'fluencyPractice') {
        // For the general fluencyPractice activity, we need to return all available facts grouped by level
        const groupedFacts: { [key in FluencyLevel]?: FactWithProgress[] } = {};
        
        // Process each fluency level with its specific filler rules
        // For fluency6Practice
        const fluency6ForPractice = prepareFluencyPractice(
            fluency6Facts,
            progress,
            fluency3Facts, 
            fluency2Facts, 
            '6s',
            masteredFacts, // Now using mastered facts for all fluency levels
            {
                fluency1_5Facts: fluency1_5Facts,
                fluency1Facts: fluency1Facts
            },
            automaticFacts,
            accuracyFacts // Pass accuracyFacts for fluency6Practice
        );
        if (fluency6ForPractice && fluency6ForPractice.length > 0) {
            groupedFacts['6s'] = fluency6ForPractice;
        }
        
        // For fluency3Practice
        const fluency3ForPractice = prepareFluencyPractice(
            fluency3Facts,
            progress,
            fluency2Facts, 
            fluency1_5Facts, 
            '3s',
            masteredFacts, // Now using mastered facts for all fluency levels
            {
                fluency1Facts: fluency1Facts
            },
            automaticFacts,
            undefined // Not using accuracyFacts for fluency3Practice
        );
        if (fluency3ForPractice && fluency3ForPractice.length > 0) {
            groupedFacts['3s'] = fluency3ForPractice;
        }
        
        // For fluency2Practice
        const fluency2ForPractice = prepareFluencyPractice(
            fluency2Facts,
            progress,
            fluency1_5Facts, 
            fluency1Facts, 
            '2s',
            masteredFacts,
            undefined,
            automaticFacts,
            undefined // Not using accuracyFacts for fluency2Practice
        );
        if (fluency2ForPractice && fluency2ForPractice.length > 0) {
            groupedFacts['2s'] = fluency2ForPractice;
        }
        
        // For fluency1_5Practice
        const fluency1_5ForPractice = prepareFluencyPractice(
            fluency1_5Facts,
            progress,
            fluency1Facts, 
            [] as FactWithProgress[],
            '1.5s',
            masteredFacts,
            undefined,
            automaticFacts,
            undefined // Not using accuracyFacts for fluency1_5Practice
        );
        if (fluency1_5ForPractice && fluency1_5ForPractice.length > 0) {
            groupedFacts['1.5s'] = fluency1_5ForPractice;
        }
        
        // For fluency1Practice
        const fluency1ForPractice = prepareFluencyPractice(
            fluency1Facts,
            progress,
            [] as FactWithProgress[],
            [] as FactWithProgress[], 
            '1s',
            masteredFacts,
            undefined,
            automaticFacts,
            undefined // Not using accuracyFacts for fluency1Practice
        );
        if (fluency1ForPractice && fluency1ForPractice.length > 0) {
            groupedFacts['1s'] = fluency1ForPractice;
        }
        
        // Only add to response if we have at least one group with facts
        if (Object.keys(groupedFacts).length > 0) {
            response.availableActivities.fluencyPractice = {
                groupedFacts
            };
        }
    }
    // Handle specific fluency level requests
    else if (activityType === 'fluency6Practice') {
        const factsForPractice = prepareFluencyPractice(
            fluency6Facts, 
            progress, 
            fluency3Facts, 
            fluency2Facts, 
            '6s',
            masteredFacts, // Now using mastered facts for all fluency levels
            {
                fluency1_5Facts: fluency1_5Facts,
                fluency1Facts: fluency1Facts
            },
            automaticFacts,
            accuracyFacts // Pass accuracyFacts for fluency6Practice
        );
        
        if (factsForPractice && factsForPractice.length > 0) {
            response.availableActivities.fluencyPractice = {
                facts: factsForPractice,
                fluencyLevel: '6s'
            };
        }
    }
    else if (activityType === 'fluency3Practice') {
        const factsForPractice = prepareFluencyPractice(
            fluency3Facts, 
            progress, 
            fluency2Facts, 
            fluency1_5Facts, 
            '3s',
            masteredFacts, // Now using mastered facts for all fluency levels
            {
                fluency1Facts: fluency1Facts
            },
            automaticFacts,
            undefined // Not using accuracyFacts for fluency3Practice
        );
        
        if (factsForPractice && factsForPractice.length > 0) {
            response.availableActivities.fluencyPractice = {
                facts: factsForPractice,
                fluencyLevel: '3s'
            };
        }
    }
    else if (activityType === 'fluency2Practice') {
        const factsForPractice = prepareFluencyPractice(
            fluency2Facts, 
            progress, 
            fluency1_5Facts, 
            fluency1Facts, 
            '2s',
            masteredFacts,
            undefined,
            automaticFacts,
            undefined // Not using accuracyFacts for fluency2Practice
        );
        
        if (factsForPractice && factsForPractice.length > 0) {
            response.availableActivities.fluencyPractice = {
                facts: factsForPractice,
                fluencyLevel: '2s'
            };
        }
    }
    else if (activityType === 'fluency1_5Practice') {
        const factsForPractice = prepareFluencyPractice(
            fluency1_5Facts, 
            progress, 
            fluency1Facts, 
            [] as FactWithProgress[], 
            '1.5s',
            masteredFacts,
            undefined,
            automaticFacts,
            undefined // Not using accuracyFacts for fluency1_5Practice
        );
        
        if (factsForPractice && factsForPractice.length > 0) {
            response.availableActivities.fluencyPractice = {
                facts: factsForPractice,
                fluencyLevel: '1.5s'
            };
        }
    }
    else if (activityType === 'fluency1Practice') {
        const factsForPractice = prepareFluencyPractice(
            fluency1Facts, 
            progress, 
            [] as FactWithProgress[],
            [] as FactWithProgress[], 
            '1s',
            masteredFacts,
            undefined,
            automaticFacts,
            undefined // Not using accuracyFacts for fluency1Practice
        );
        
        if (factsForPractice && factsForPractice.length > 0) {
            response.availableActivities.fluencyPractice = {
                facts: factsForPractice,
                fluencyLevel: '1s'
            };
        }
    }
    
    return response;
}; 