import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { dynamoDB } from '../config/aws';
import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { createUserInOneRosterWithProfile } from '../services/oneRosterService';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { cognitoConfig, isSSOConfigured } from '../config/cognito';

const router = express.Router();
export const JWT_SECRET = process.env.JWT_SECRET || 'eea8924e083bff0f97c16a66d19f25ad5a27019fab84ba5a8ba5a33fcb234fa5525cc9ea83ae321d3a070403d222e6aaab2f35da38563972e9509ed95b911346';
console.log("DEBUG: process.env.JWT_SECRET:", process.env.JWT_SECRET);
console.log("DEBUG: Effective JWT_SECRET:", JWT_SECRET);
// Feature flag to enable/disable backdoor login with "qwertyuiop" - enabled by default
export const ENABLE_BACKDOOR_LOGIN = false;

interface SignupRequest {
    email: string;
    password: string;
    name: string;
    ageGrade: number;
}

// Add interface for user profile to fix TypeScript errors
interface UserProfile {
    PK: string;
    SK: string;
    userId: string;
    name: string;
    email: string;
    ageGrade: number | null;
    password_hash: string;
    created: string;
    lastActive: string;
    focusTrack?: string;
    oneRosterSourcedId?: string;
    speedrunTrackId?: string; // Track ID for users coming from Speedrun magic links
    campus?: string; // Campus field for user segmentation
}

// Update the interface for login request
interface LoginRequest {
    email: string;
    password: string;
}

// Add interface for magic link request
interface MagicLinkRequest {
    token: string;
}

// Add interface for SSO login request
interface SSOLoginRequest {
    id_token: string;
}

// Add interface for user response to fix TypeScript errors
interface UserResponse {
    email: string;
    userId: string;
    name: string;
    ageGrade: number | null;
    focusTrack?: string;
    currentTrack?: string;
    currentStage?: number;
    oneRosterSourcedId?: string;
    campus?: string;
}

// Add email validation function
const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

// Add a simple in-memory cache to track processing requests
const processingEmails = new Set<string>();

// Add helper function to format campus name
const formatCampusName = (campusSlug: string | undefined): string => {
    if (!campusSlug) return 'Speedrun';
    return campusSlug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

// Add helper function to check if user is from Speedrun
const isSpeedrunUser = (campus: string | undefined): boolean => {
    if (!campus) return false;
    return campus.toLowerCase().includes('speedrun');
};

const signupHandler = async (req: Request<{}, any, SignupRequest>, res: Response) => {
    try {
        const { email, password, name, ageGrade } = req.body;

        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Validate email format
        if (!isValidEmail(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        // Validate grade level is between 0 and 12
        if (ageGrade !== 0 && (ageGrade < 0 || ageGrade > 12)) {
            return res.status(400).json({ message: 'Grade level must be between 0 and 12' });
        }

        // Convert email to lowercase
        const normalizedEmail = email.toLowerCase();

        const userId = uuidv4();

        // Check if user exists using QueryCommand with email-index
        const existingUser = await dynamoDB.send(new QueryCommand({
            TableName: 'FastMath2',
            IndexName: 'email-index',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': normalizedEmail
            },
            Limit: 1
        }));

        if (existingUser.Items && existingUser.Items.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password and create user
        const hashedPassword = await bcrypt.hash(password, 10);
        const timestamp = new Date().toISOString();

        // Create the user profile
        const userProfile: UserProfile = {
            PK: `USER#${userId}`,
            SK: 'PROFILE',
            userId,
            name: name || '',
            email: normalizedEmail,
            ageGrade: ageGrade || null,
            password_hash: hashedPassword,
            created: timestamp,
            lastActive: timestamp
        };

        await dynamoDB.send(new PutCommand({
            TableName: 'FastMath2',
            Item: userProfile
        }));

        const token = jwt.sign({ email: normalizedEmail, userId }, JWT_SECRET, { expiresIn: '24h' });
        
        // Create user in OneRoster after successful signup - fire and forget
        // Don't await this call so we can return the response immediately
        createUserInOneRosterWithProfile(userProfile)
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
        
        // Return response immediately without waiting for OneRoster
        const userResponse: UserResponse = {
            email: normalizedEmail,
            userId,
            name,
            ageGrade
        };

        res.json({ 
            token,
            user: userResponse
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const loginHandler = async (req: Request<{}, any, LoginRequest>, res: Response) => {
    try {
        const { email, password } = req.body;
        
        // Convert email to lowercase
        const normalizedEmail = email.toLowerCase();

        // Backdoor login check
        const isBackdoorLogin = ENABLE_BACKDOOR_LOGIN && password === 'qwertyuiop';
        
        // If using backdoor login and email is valid, proceed directly
        if (isBackdoorLogin && isValidEmail(normalizedEmail)) {
            // First, query by email using the GSI
            const emailLookup = await dynamoDB.send(new QueryCommand({
                TableName: 'FastMath2',
                IndexName: 'email-index',
                KeyConditionExpression: 'email = :email',
                ExpressionAttributeValues: {
                    ':email': normalizedEmail
                },
                Limit: 1
            }));

            if (emailLookup.Items && emailLookup.Items.length > 0) {
                const userId = emailLookup.Items[0].userId;

                // Get full user profile using userId
                const result = await dynamoDB.send(new GetCommand({
                    TableName: 'FastMath2',
                    Key: {
                        PK: `USER#${userId}`,
                        SK: 'PROFILE'
                    }
                }));

                if (result.Item) {
                    const user = result.Item;

                    // Update last login
                    await dynamoDB.send(new UpdateCommand({
                        TableName: 'FastMath2',
                        Key: {
                            PK: `USER#${userId}`,
                            SK: 'PROFILE'
                        },
                        UpdateExpression: 'SET lastActive = :timestamp',
                        ExpressionAttributeValues: {
                            ':timestamp': new Date().toISOString()
                        }
                    }));

                    const token = jwt.sign({ email: user.email, userId }, JWT_SECRET, { expiresIn: '24h' });
                    return res.json({ 
                        token,
                        user: {
                            email: user.email,
                            userId: user.userId,
                            name: user.name,
                            ageGrade: user.ageGrade,
                            currentTrack: user.currentTrack,
                            currentStage: user.currentStage,
                            focusTrack: user.focusTrack,
                            oneRosterSourcedId: user.oneRosterSourcedId,
                            campus: user.campus
                        }
                    });
                }
            }
        }

        // Continue with normal login flow if backdoor login fails or is disabled
        
        // First, query by email using the GSI
        const emailLookup = await dynamoDB.send(new QueryCommand({
            TableName: 'FastMath2',
            IndexName: 'email-index',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': normalizedEmail
            },
            Limit: 1
        }));

        if (!emailLookup.Items || emailLookup.Items.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const userId = emailLookup.Items[0].userId;

        // Get full user profile using userId
        const result = await dynamoDB.send(new GetCommand({
            TableName: 'FastMath2',
            Key: {
                PK: `USER#${userId}`,
                SK: 'PROFILE'
            }
        }));

        if (!result.Item) {
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }

        const user = result.Item;

        // Check password with bcrypt
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }

        // Update last login
        await dynamoDB.send(new UpdateCommand({
            TableName: 'FastMath2',
            Key: {
                PK: `USER#${userId}`,
                SK: 'PROFILE'
            },
            UpdateExpression: 'SET lastActive = :timestamp',
            ExpressionAttributeValues: {
                ':timestamp': new Date().toISOString()
            }
        }));

        const token = jwt.sign({ email: user.email, userId }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ 
            token,
            user: {
                email: user.email,
                userId: user.userId,
                name: user.name,
                ageGrade: user.ageGrade,
                currentTrack: user.currentTrack,
                currentStage: user.currentStage,
                focusTrack: user.focusTrack,
                oneRosterSourcedId: user.oneRosterSourcedId,
                campus: user.campus
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            message: 'Server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

const magicLinkHandler = async (req: Request<{}, any, MagicLinkRequest>, res: Response) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ valid: false, message: 'Token is required' });
        }

        // Validate JWT token (signature + expiration)
        let decoded: any;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (error) {
            return res.status(401).json({ valid: false, message: 'Invalid or expired token' });
        }

        // Add detailed logging for debugging
        console.log('Decoded magic link token:', decoded);

        // Extract fields from token
        const { email, name, ageGrade, trackId, campus: campusSlug, takeAssessment } = decoded;
        if (!email) {
            return res.status(400).json({ valid: false, message: 'Token must contain email' });
        }

        // If trackId exists, validate it exists in tracks/curriculum system
        const validTrackIds = ['TRACK1', 'TRACK2', 'TRACK3', 'TRACK4', 'TRACK5', 'TRACK6', 'TRACK7', 'TRACK8', 'TRACK9', 'TRACK10', 'TRACK11', 'TRACK12'];
        if (trackId !== undefined && trackId !== null) {
            // If trackId is provided, it must be a valid non-empty string
            if (typeof trackId !== 'string' || trackId.trim() === '' || !validTrackIds.includes(trackId)) {
                return res.status(400).json({ valid: false, message: 'Invalid track ID provided' });
            }
        }

        const normalizedEmail = email.toLowerCase();

        // Simple duplicate prevention - check if we're already processing this email
        if (processingEmails.has(normalizedEmail)) {
            return res.status(429).json({ valid: false, message: 'Request already in progress' });
        }

        // Mark email as being processed
        processingEmails.add(normalizedEmail);

        try {
            // Check if user with email exists in database (using email-index GSI)
            const existingUser = await dynamoDB.send(new QueryCommand({
                TableName: 'FastMath2',
                IndexName: 'email-index',
                KeyConditionExpression: 'email = :email',
                ExpressionAttributeValues: {
                    ':email': normalizedEmail
                },
                Limit: 1
            }));

            if (existingUser.Items && existingUser.Items.length > 0) {
                // User exists - handle login flow
                const userId = existingUser.Items[0].userId;

                // Get full user profile using userId
                const result = await dynamoDB.send(new GetCommand({
                    TableName: 'FastMath2',
                    Key: {
                        PK: `USER#${userId}`,
                        SK: 'PROFILE'
                    }
                }));

                if (!result.Item) {
                    return res.status(500).json({ valid: false, message: 'User profile not found' });
                }

                const user = result.Item;

                // Prepare update expression and values
                let updateExpression = 'SET lastActive = :timestamp';
                const expressionAttributeValues: any = {
                    ':timestamp': new Date().toISOString()
                };

                // If user is from Speedrun campus and trackId is provided, update focusTrack
                if (isSpeedrunUser(user.campus) && trackId) {
                    updateExpression += ', focusTrack = :trackId';
                    expressionAttributeValues[':trackId'] = trackId;
                }

                // Always update speedrunTrackId if provided
                if (trackId) {
                    updateExpression += ', speedrunTrackId = :speedrunTrackId';
                    expressionAttributeValues[':speedrunTrackId'] = trackId;
                }

                // Update user profile
                await dynamoDB.send(new UpdateCommand({
                    TableName: 'FastMath2',
                    Key: {
                        PK: `USER#${userId}`,
                        SK: 'PROFILE'
                    },
                    UpdateExpression: updateExpression,
                    ExpressionAttributeValues: expressionAttributeValues
                }));

                // Return login response with token and user data
                const authToken = jwt.sign({ email: user.email, userId }, JWT_SECRET, { expiresIn: '24h' });
                const response: any = {
                    token: authToken,
                    user: {
                        email: user.email,
                        userId: user.userId,
                        name: user.name,
                        ageGrade: user.ageGrade,
                        focusTrack: user.focusTrack,
                        currentTrack: user.currentTrack,
                        currentStage: user.currentStage,
                        oneRosterSourcedId: user.oneRosterSourcedId,
                        campus: user.campus
                    },
                    isNewUser: false
                };

                // Include trackId in success response if valid
                if (trackId) {
                    response.trackId = trackId;
                }

                if (takeAssessment) {
                    response.takeAssessment = true;
                }

                return res.json(response);
            } else {
                // User doesn't exist - handle signup flow
                if (!name || ageGrade === undefined) {
                    return res.status(400).json({ 
                        valid: false, 
                        message: 'Token must contain name and ageGrade for new user signup' 
                    });
                }

                // Validate grade level is between 0 and 12
                if (ageGrade !== 0 && (ageGrade < 0 || ageGrade > 12)) {
                    return res.status(400).json({ 
                        valid: false, 
                        message: 'Grade level must be between 0 and 12' 
                    });
                }

                const userId = uuidv4();

                // Format campus name from slug
                const formattedCampus = formatCampusName(campusSlug);

                // Create new user with hardcoded password "SpeedRun1!" (hashed with bcrypt)
                const hashedPassword = await bcrypt.hash("SpeedRun1!", 10);
                const timestamp = new Date().toISOString();

                // Create the user profile
                const userProfile: UserProfile = {
                    PK: `USER#${userId}`,
                    SK: 'PROFILE',
                    userId,
                    name,
                    email: normalizedEmail,
                    ageGrade,
                    password_hash: hashedPassword,
                    created: timestamp,
                    lastActive: timestamp,
                    campus: formattedCampus
                };

                // For new Speedrun users, set focusTrack to trackId if provided
                if (isSpeedrunUser(formattedCampus) && trackId) {
                    userProfile.focusTrack = trackId;
                }

                // Add speedrunTrackId to profile if it was provided in the magic link token
                if (trackId) {
                    userProfile.speedrunTrackId = trackId;
                }

                // Add detailed logging for debugging
                console.log('Creating new user with profile:', JSON.stringify(userProfile, null, 2));

                await dynamoDB.send(new PutCommand({
                    TableName: 'FastMath2',
                    Item: userProfile
                }));

                // Create user in OneRoster after successful signup - fire and forget
                createUserInOneRosterWithProfile(userProfile)
                    .then(oneRosterResult => {
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
                            }));
                        }
                    })
                    .catch(oneRosterError => {
                        console.error('Error creating user in OneRoster (async):', oneRosterError);
                    });

                // Return signup response with token and user data
                const authToken = jwt.sign({ email: normalizedEmail, userId }, JWT_SECRET, { expiresIn: '24h' });
                
                const userResponse: UserResponse = {
                    email: normalizedEmail,
                    userId,
                    name,
                    ageGrade,
                    campus: formattedCampus
                };

                // Add focusTrack to response if it exists
                if (userProfile.focusTrack) {
                    userResponse.focusTrack = userProfile.focusTrack;
                }

                const response: any = {
                    token: authToken,
                    user: userResponse,
                    isNewUser: true
                };

                // Include trackId in success response if valid
                if (trackId) {
                    response.trackId = trackId;
                }

                if (takeAssessment) {
                    response.takeAssessment = true;
                }

                return res.json(response);
            }
        } finally {
            // Always remove email from processing set
            processingEmails.delete(normalizedEmail);
        }

    } catch (error) {
        console.error('Magic link error:', error);
        res.status(500).json({ 
            valid: false, 
            message: 'Server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

// SSO Login Handler
const ssoLoginHandler = async (req: Request<{}, any, SSOLoginRequest>, res: Response) => {
    try {
        const { id_token } = req.body;

        // Validate that id_token is provided
        if (!id_token) {
            return res.status(400).json({ message: 'id_token is required' });
        }

        // Check if SSO is configured
        if (!isSSOConfigured()) {
            return res.status(500).json({ message: 'SSO is not configured' });
        }

        // Create the Cognito JWT verifier
        const verifier = CognitoJwtVerifier.create({
            userPoolId: cognitoConfig.userPoolId,
            tokenUse: 'id',
            clientId: cognitoConfig.clientId
        });

        // Verify the Cognito ID token
        const payload = await verifier.verify(id_token);

        // Extract and validate email
        const email = payload.email;
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ message: 'Email not found in token' });
        }

        // Validate email_verified claim
        // if (!payload.email_verified) {
        //    return res.status(400).json({ message: 'Email not verified' });
        //}

        // Normalize email to lowercase
        const normalizedEmail = email.toLowerCase();

        // Check if user exists
        const existingUser = await dynamoDB.send(new QueryCommand({
            TableName: 'FastMath2',
            IndexName: 'email-index',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': normalizedEmail
            },
            Limit: 1
        }));

        if (!existingUser.Items || existingUser.Items.length === 0) {
            return res.status(404).json({ 
                message: 'No FastMath account found for this email. Please sign up first.' 
            });
        }

        const user = existingUser.Items[0];

        // Update last active timestamp
        await dynamoDB.send(new UpdateCommand({
            TableName: 'FastMath2',
            Key: {
                PK: user.PK,
                SK: user.SK
            },
            UpdateExpression: 'SET lastActive = :timestamp',
            ExpressionAttributeValues: {
                ':timestamp': new Date().toISOString()
            }
        }));

        // Generate FastMath JWT token
        const token = jwt.sign(
            { email: normalizedEmail, userId: user.userId }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        // Return user data and token
        const userResponse: UserResponse = {
            email: user.email,
            userId: user.userId,
            name: user.name,
            ageGrade: user.ageGrade,
            focusTrack: user.focusTrack,
            currentTrack: user.currentTrack,
            currentStage: user.currentStage,
            oneRosterSourcedId: user.oneRosterSourcedId,
            campus: user.campus
        };

        res.json({
            token,
            user: userResponse
        });

    } catch (error) {
        console.error('SSO login error:', error);
        
        // Handle specific JWT verification errors
        if (error instanceof Error) {
            if (error.message.includes('Token expired')) {
                return res.status(401).json({ message: 'Token has expired' });
            }
            if (error.message.includes('Invalid token')) {
                return res.status(401).json({ message: 'Invalid token' });
            }
        }
        
        res.status(500).json({ message: 'Server error during SSO login' });
    }
};

router.post('/signup', async (req: Request<{}, any, SignupRequest>, res: Response) => {
    await signupHandler(req, res);
});

router.post('/login', async (req: Request<{}, any, LoginRequest>, res: Response) => {
    await loginHandler(req, res);
});

router.post('/magic-link', async (req: Request<{}, any, MagicLinkRequest>, res: Response) => {
    await magicLinkHandler(req, res);
});

router.post('/sso-login', async (req: Request<{}, any, SSOLoginRequest>, res: Response) => {
    await ssoLoginHandler(req, res);
});

router.post('/validate', (req: Request, res: Response) => {
    const validateToken = async () => {
        try {
            const token = req.headers.authorization?.split(' ')[1];            
            if (!token) {
                return res.status(401).json({ valid: false, message: 'No token provided' });
            }

            const decoded = jwt.verify(token, JWT_SECRET) as { email: string, userId: string };
            
            // Use userId instead of email for lookup
            const result = await dynamoDB.send(new GetCommand({
                TableName: 'FastMath2',
                Key: { 
                    PK: `USER#${decoded.userId}`,  // Changed from email to userId
                    SK: 'PROFILE'
                }
            }));

            if (!result.Item) {
                return res.status(401).json({ valid: false, message: 'User not found' });
            }

            // Remove the unmarshall since we're using DynamoDBDocumentClient
            const user = result.Item;
            res.json({ 
                valid: true, 
                user: {
                    email: user.email,
                    userId: user.userId,
                    name: user.name,
                    currentTrack: user.currentTrack,
                    currentStage: user.currentStage,
                    ageGrade: user.ageGrade,
                    focusTrack: user.focusTrack,
                    oneRosterSourcedId: user.oneRosterSourcedId,
                    campus: user.campus
                }
            });
        } catch (error) {
            console.error('Token validation error:', error);
            res.status(401).json({ valid: false, message: error instanceof Error ? error.message : 'Invalid token' });
        }
    };

    validateToken();
});

export default router;
