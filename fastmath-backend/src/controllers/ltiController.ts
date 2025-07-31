import { Request, Response } from 'express';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDB } from '../config/aws';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../routes/auth';
import { v4 as uuidv4 } from 'uuid';
import { createUserInOneRosterWithProfile } from '../services/oneRosterService';

export const handleLTILaunch = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('Received request body:', req.body);
    const { sub, role, messageType, iss, given_name, family_name } = req.body;

    // Basic validation
    if (
      messageType !== "LtiResourceLinkRequest" ||
      iss !== "https://alphalearn.school"
    ) {
      console.log('Validation failed:', { messageType, iss, role });
      res.status(400).json({ error: "Invalid request parameters" });
      return;
    }

    console.log('Validation passed, checking user:', sub);

    try {
      const grade = parseInt(req.body.age_grade) || 0;
      const now = new Date().toISOString();

      // First check if user exists by email using the GSI
      const existingUserQuery = await dynamoDB.send(new QueryCommand({
        TableName: 'FastMath2',
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': sub
        },
        Limit: 1
      }));

      let userId: string;
      let userType: "existing" | "new";
      let userData: any;

      if (existingUserQuery.Items && existingUserQuery.Items.length > 0) {
        // User exists, use their existing userId and data
        userData = existingUserQuery.Items[0];
        userId = userData.userId;
        userType = "existing";
        console.log('Found existing user:', userId);
      } else {
        // Generate new UUID for new users
        userId = uuidv4();
        userType = "new";
        console.log('Creating new user:', userId);

        userData = {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
          userId,
          email: sub,
          name: `${given_name} ${family_name}`.trim(),
          ageGrade: grade,
          created: now,
          lastActive: now
        };

        await dynamoDB.send(
          new PutCommand({
            TableName: 'FastMath2',
            Item: userData
          })
        );
        
        // Create user in OneRoster after successful creation - fire and forget
        // Don't await this call so we can return the response immediately
        createUserInOneRosterWithProfile(userData)
          .then(oneRosterResult => {
            console.log('OneRoster user creation completed asynchronously:', oneRosterResult);
            
            // If we have a OneRoster sourcedId, save it to the user profile
            if (oneRosterResult.success && oneRosterResult.oneRosterSourcedId) {
              return dynamoDB.send(new UpdateCommand({
                TableName: 'FastMath2',
                Key: {
                  PK: `USER#${userId}`,
                  SK: 'PROFILE'
                },
                UpdateExpression: 'SET oneRosterSourcedId = :sourcedId',
                ExpressionAttributeValues: {
                  ':sourcedId': oneRosterResult.oneRosterSourcedId
                }
              }))
              .then(() => {
                console.log(`Updated user profile with OneRoster sourcedId: ${oneRosterResult.oneRosterSourcedId}`);
              })
              .catch(updateError => {
                console.error('Error updating user profile with OneRoster sourcedId:', updateError);
              });
            }
          })
          .catch(oneRosterError => {
            console.error('Error creating user in OneRoster (async):', oneRosterError);
          });
      }

      const loginToken = jwt.sign(
        { 
          email: sub,
          userId: userId
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      const response = {
        status: "success",
        message: `Student ${userType === "new" ? "signed up" : "logged in"} and login token generated.`,
        userID: userId,
        userType,
        loginLink: `https://app.fastmath.pro?token=${loginToken}`,
        user: {
          email: sub,
          userId: userId,
          name: userData.name || `${given_name} ${family_name}`.trim(),
          ageGrade: grade,
          oneRosterSourcedId: userData.oneRosterSourcedId
        }
      };

      console.log('Sending response:', response);
      res.status(200).json(response);
    } catch (dbError) {
      console.error('Database error:', dbError);
      res.status(500).json({ error: 'Database operation failed' });
    }
  } catch (error) {
    console.error('General error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};