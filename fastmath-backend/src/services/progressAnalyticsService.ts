import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ProgressAssessment } from '../types/progressAssessment';
import { addDays } from '../utils/dateUtils';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});
const TABLE_NAME = 'FastMath2';

interface CQPMMetrics {
    currentCQPM: number | null;
    changeCQPM: number | null;
}

export const getProgressMetrics = async (userId: string, trackId: string): Promise<CQPMMetrics> => {
    // Query for completed assessments, sorted by lastUpdated in descending order
    const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: '#status = :status AND trackId = :trackId',
        ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':sk': 'PROGRESSASSESSMENT#',
            ':status': 'completed',
            ':trackId': trackId
        },
        ExpressionAttributeNames: {
            '#status': 'status'
        }
    };

    const result = await dynamoDB.send(new QueryCommand(params));
    
    if (!result.Items || result.Items.length === 0) {
        return {
            currentCQPM: null,
            changeCQPM: null
        };
    }

    // Filter assessments to only include those from the last 30 days
    const thirtyDaysAgo = addDays(new Date(), -30);
    const recentAssessments = (result.Items as ProgressAssessment[])
        .filter(assessment => new Date(assessment.lastUpdated) >= thirtyDaysAgo);

    if (recentAssessments.length === 0) {
        return {
            currentCQPM: null,
            changeCQPM: null
        };
    }

    // Sort by lastUpdated in descending order to get most recent first
    const sortedAssessments = recentAssessments
        .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());

    // Get the latest CQPM
    const currentCQPM = sortedAssessments[0].overallCQPM;

    // Calculate change in CQPM if we have a previous assessment
    const changeCQPM = sortedAssessments.length > 1 
        ? currentCQPM - sortedAssessments[1].overallCQPM
        : null;

    return {
        currentCQPM,
        changeCQPM
    };
}; 