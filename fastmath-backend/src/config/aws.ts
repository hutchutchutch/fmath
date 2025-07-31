import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Add debug logs
console.log('Starting AWS configuration...');
console.log('AWS Region:', process.env.AWS_REGION);

const client = new DynamoDBClient({ 
    region: process.env.AWS_REGION || 'us-east-1'
    // Remove credentials - let it use the EC2 instance role
});

export const dynamoDB = DynamoDBDocumentClient.from(client);
export const QUESTIONS_TABLE = process.env.QUESTIONS_TABLE || 'MathFactsQuestions';