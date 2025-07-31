import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);

async function checkUser(email: string) {
    console.log(`Checking for user with email: ${email}`);
    
    // Try using the email-index GSI
    try {
        const emailLookup = await dynamoDB.send(new QueryCommand({
            TableName: 'FastMath2',
            IndexName: 'email-index',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': email.toLowerCase()
            },
            Limit: 5
        }));
        
        console.log('Email index query result:', emailLookup.Items);
        
        if (emailLookup.Items && emailLookup.Items.length > 0) {
            console.log('User found via email index!');
            console.log('User details:', JSON.stringify(emailLookup.Items[0], null, 2));
        } else {
            console.log('User not found via email index');
            
            // Try a scan as fallback
            console.log('Attempting scan...');
            const scanResult = await dynamoDB.send(new ScanCommand({
                TableName: 'FastMath2',
                FilterExpression: 'email = :email AND SK = :sk',
                ExpressionAttributeValues: {
                    ':email': email.toLowerCase(),
                    ':sk': 'PROFILE'
                },
                Limit: 5
            }));
            
            if (scanResult.Items && scanResult.Items.length > 0) {
                console.log('User found via scan!');
                console.log('User details:', JSON.stringify(scanResult.Items[0], null, 2));
            } else {
                console.log('User not found in database');
            }
        }
    } catch (error) {
        console.error('Error querying database:', error);
    }
}

// Run the check
const targetEmail = 'hutch.herchenbach@gauntletai.com';
checkUser(targetEmail).catch(console.error);