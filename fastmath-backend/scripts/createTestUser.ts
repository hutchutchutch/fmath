import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';

const client = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(client);

async function createTestUser() {
    const email = 'hutch.herchenbach@gauntletai.com';
    const password = 'testpassword123';
    const name = 'Hutch Herchenbach';
    const ageGrade = 12;
    
    try {
        // First check if user exists using scan
        console.log('Checking if user exists...');
        const existingUser = await dynamoDB.send(new ScanCommand({
            TableName: 'FastMath2',
            FilterExpression: 'email = :email AND SK = :sk',
            ExpressionAttributeValues: {
                ':email': email.toLowerCase(),
                ':sk': 'PROFILE'
            },
            Limit: 1
        }));
        
        if (existingUser.Items && existingUser.Items.length > 0) {
            console.log('User already exists:', existingUser.Items[0]);
            return;
        }
        
        // Create new user
        console.log('Creating new user...');
        const userId = uuidv4();
        const hashedPassword = await bcrypt.hash(password, 10);
        const timestamp = new Date().toISOString();
        
        const userProfile = {
            PK: `USER#${userId}`,
            SK: 'PROFILE',
            userId,
            name,
            email: email.toLowerCase(),
            ageGrade,
            createdAt: timestamp,
            updatedAt: timestamp,
            password: hashedPassword,
            currentTrack: 'TRACK1',
            focusTrack: 'TRACK1'
        };
        
        await dynamoDB.send(new PutCommand({
            TableName: 'FastMath2',
            Item: userProfile
        }));
        
        console.log('User created successfully!');
        console.log('Email:', email);
        console.log('Password:', password);
        console.log('User ID:', userId);
        
    } catch (error) {
        console.error('Error creating user:', error);
    }
}

createTestUser();