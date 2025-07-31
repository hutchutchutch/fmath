import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

// Mock AWS SDK before importing auth router
const mockSend = jest.fn();
const mockGetCommand = jest.fn();
const mockPutCommand = jest.fn();
const mockQueryCommand = jest.fn();
const mockUpdateCommand = jest.fn();

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: mockSend }))
  },
  GetCommand: mockGetCommand,
  PutCommand: mockPutCommand,
  QueryCommand: mockQueryCommand,
  UpdateCommand: mockUpdateCommand
}));

// Mock OneRoster service with proper Promise
const mockCreateUserInOneRosterWithProfile = jest.fn();
jest.mock('../../src/services/oneRosterService', () => ({
  createUserInOneRosterWithProfile: mockCreateUserInOneRosterWithProfile
}));

// Now import the auth router after mocking dependencies
import authRouter from '../../src/routes/auth';

// Create test app
const app = express();
app.use(express.json());
app.use('/auth', authRouter);

describe('Magic Link Authentication', () => {
  const TEST_JWT_SECRET = 'test-jwt-secret';
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Set the JWT secret for tests
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    
    // Setup OneRoster mock to return resolved promise
    mockCreateUserInOneRosterWithProfile.mockResolvedValue({
      success: true,
      oneRosterSourcedId: 'mock-roster-id'
    });

    // Setup AWS SDK command constructors to return trackable objects
    mockGetCommand.mockImplementation((params) => ({ commandType: 'GetCommand', ...params }));
    mockPutCommand.mockImplementation((params) => ({ commandType: 'PutCommand', ...params }));
    mockQueryCommand.mockImplementation((params) => ({ commandType: 'QueryCommand', ...params }));
    mockUpdateCommand.mockImplementation((params) => ({ commandType: 'UpdateCommand', ...params }));
  });

  describe('POST /auth/magic-link - Existing User Login', () => {
    it('should successfully login existing user', async () => {
      // Mock existing user lookup
      mockSend
        .mockResolvedValueOnce({
          // Email lookup returns user
          Items: [{ userId: 'existing-user-123', email: 'test204@test.com' }]
        })
        .mockResolvedValueOnce({
          // User profile lookup
          Item: {
            userId: 'existing-user-123',
            email: 'test204@test.com',
            name: 'test204',
            ageGrade: 4,
            focusTrack: 'TRACK1',
            currentTrack: 'TRACK1',
            currentStage: 3
          }
        })
        .mockResolvedValueOnce({}); // Update lastActive

      // Create login token (only email needed)
      const loginToken = jwt.sign({
        email: 'test204@test.com'
      }, TEST_JWT_SECRET, { expiresIn: '1h' });

      const response = await request(app)
        .post('/auth/magic-link')
        .send({ token: loginToken });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        token: expect.any(String),
        user: {
          email: 'test204@test.com',
          userId: 'existing-user-123',
          name: 'test204',
          ageGrade: 4,
          focusTrack: 'TRACK1',
          currentTrack: 'TRACK1',
          currentStage: 3
        },
        isNewUser: false
      });

      // Verify DynamoDB calls
      expect(mockSend).toHaveBeenCalledTimes(3);
      // Email lookup, profile lookup, lastActive update
      
      // Verify that the UpdateCommand only updates lastActive for existing users
      const updateCommandCallIndex = mockSend.mock.calls.findIndex(call => 
        call[0].commandType === 'UpdateCommand'
      );
      expect(updateCommandCallIndex).toBeGreaterThanOrEqual(0);
      
      const updateCommandCall = mockSend.mock.calls[updateCommandCallIndex][0];
      expect(updateCommandCall).toMatchObject({
        TableName: 'FastMath2',
        Key: {
          PK: 'USER#existing-user-123',
          SK: 'PROFILE'
        },
        UpdateExpression: 'SET lastActive = :timestamp',
        ExpressionAttributeValues: {
          ':timestamp': expect.any(String)
        }
      });
      
      // Ensure no other fields are in the UpdateExpression
      expect(updateCommandCall.UpdateExpression).toBe('SET lastActive = :timestamp');
      expect(Object.keys(updateCommandCall.ExpressionAttributeValues)).toEqual([':timestamp']);
    });

    it('should handle existing user without optional fields', async () => {
      mockSend
        .mockResolvedValueOnce({
          Items: [{ userId: 'simple-user-456', email: 'simple@test.com' }]
        })
        .mockResolvedValueOnce({
          Item: {
            userId: 'simple-user-456',
            email: 'simple@test.com',
            name: 'Simple User',
            ageGrade: 2
            // No focusTrack, currentTrack, currentStage
          }
        })
        .mockResolvedValueOnce({});

      const loginToken = jwt.sign({
        email: 'simple@test.com'
      }, TEST_JWT_SECRET, { expiresIn: '1h' });

      const response = await request(app)
        .post('/auth/magic-link')
        .send({ token: loginToken });

      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({
        email: 'simple@test.com',
        userId: 'simple-user-456',
        name: 'Simple User',
        ageGrade: 2
      });
      expect(response.body.isNewUser).toBe(false);
    });
  });

  describe('POST /auth/magic-link - New User Signup', () => {
    it('should successfully create new user', async () => {
      // Mock no existing user found
      mockSend
        .mockResolvedValueOnce({ Items: [] }) // QueryCommand - No existing user
        .mockResolvedValueOnce({ Item: null }) // GetCommand - No focus mapping
        .mockResolvedValueOnce({}) // PutCommand - User creation
        .mockResolvedValueOnce({}); // UpdateCommand - OneRoster sourcedId update (async)

      const signupToken = jwt.sign({
        email: 'newuser123@test.com',
        name: 'New User 123',
        ageGrade: 5
      }, TEST_JWT_SECRET, { expiresIn: '1h' });

      const response = await request(app)
        .post('/auth/magic-link')
        .send({ token: signupToken });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        token: expect.any(String),
        user: {
          email: 'newuser123@test.com',
          userId: expect.any(String),
          name: 'New User 123',
          ageGrade: 5
        },
        isNewUser: true
      });

      // Allow for async OneRoster call (3 or 4 calls depending on timing)
      expect(mockSend.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(mockSend.mock.calls.length).toBeLessThanOrEqual(4);
      
      // Find the PutCommand call (should contain user creation data)
      const putCommandCallIndex = mockSend.mock.calls.findIndex(call => 
        call[0].commandType === 'PutCommand'
      );
      expect(putCommandCallIndex).toBeGreaterThanOrEqual(0);
      
      const putCommandCall = mockSend.mock.calls[putCommandCallIndex][0];
      expect(putCommandCall).toMatchObject({
        TableName: 'FastMath2',
        Item: expect.objectContaining({
          email: 'newuser123@test.com',
          name: 'New User 123',
          ageGrade: 5,
          password_hash: expect.any(String) // bcrypt hash of "SpeedRun1!"
        })
      });
    });

    it('should create user with focus track mapping', async () => {
      // Mock focus track mapping exists
      mockSend
        .mockResolvedValueOnce({ Items: [] }) // QueryCommand - No existing user
        .mockResolvedValueOnce({
          Item: {
            mappings: {
              'mapped@test.com': 'TRACK5'
            }
          }
        }) // GetCommand - Focus mapping exists
        .mockResolvedValueOnce({}); // PutCommand - User creation

      const signupToken = jwt.sign({
        email: 'mapped@test.com',
        name: 'Mapped User',
        ageGrade: 3
      }, TEST_JWT_SECRET, { expiresIn: '1h' });

      const response = await request(app)
        .post('/auth/magic-link')
        .send({ token: signupToken });

      expect(response.status).toBe(200);
      expect(response.body.user.focusTrack).toBe('TRACK5');

      // Find the PutCommand call (should contain user creation data with focus track)
      const putCommandCallIndex = mockSend.mock.calls.findIndex(call => 
        call[0].commandType === 'PutCommand'
      );
      expect(putCommandCallIndex).toBeGreaterThanOrEqual(0);
      
      const putCommandCall = mockSend.mock.calls[putCommandCallIndex][0];
      expect(putCommandCall).toMatchObject({
        Item: expect.objectContaining({
          focusTrack: 'TRACK5'
        })
      });
    });

    it('should handle grade 0 (kindergarten)', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Item: null })
        .mockResolvedValueOnce({});

      const signupToken = jwt.sign({
        email: 'kindergarten@test.com',
        name: 'Kindergarten Kid',
        ageGrade: 0
      }, TEST_JWT_SECRET, { expiresIn: '1h' });

      const response = await request(app)
        .post('/auth/magic-link')
        .send({ token: signupToken });

      expect(response.status).toBe(200);
      expect(response.body.user.ageGrade).toBe(0);
    });
  });

  describe('POST /auth/magic-link - Error Cases', () => {
    it('should reject missing token', async () => {
      const response = await request(app)
        .post('/auth/magic-link')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        valid: false,
        message: 'Token is required'
      });
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .post('/auth/magic-link')
        .send({ token: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        valid: false,
        message: 'Invalid or expired token'
      });
    });

    it('should reject token without email', async () => {
      const tokenWithoutEmail = jwt.sign({
        name: 'No Email User',
        ageGrade: 5
      }, TEST_JWT_SECRET, { expiresIn: '1h' });

      const response = await request(app)
        .post('/auth/magic-link')
        .send({ token: tokenWithoutEmail });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        valid: false,
        message: 'Token must contain email'
      });
    });

    it('should reject signup token missing name', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] }); // No existing user

      const tokenMissingName = jwt.sign({
        email: 'noname@test.com',
        ageGrade: 3
      }, TEST_JWT_SECRET, { expiresIn: '1h' });

      const response = await request(app)
        .post('/auth/magic-link')
        .send({ token: tokenMissingName });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        valid: false,
        message: 'Token must contain name and ageGrade for new user signup'
      });
    });

    it('should reject signup token missing ageGrade', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] }); // No existing user

      const tokenMissingGrade = jwt.sign({
        email: 'nograde@test.com',
        name: 'No Grade User'
      }, TEST_JWT_SECRET, { expiresIn: '1h' });

      const response = await request(app)
        .post('/auth/magic-link')
        .send({ token: tokenMissingGrade });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        valid: false,
        message: 'Token must contain name and ageGrade for new user signup'
      });
    });

    it('should reject invalid grade levels', async () => {
      // Test grade too high
      mockSend.mockResolvedValueOnce({ Items: [] }); // QueryCommand - No existing user
      
      const highGradeToken = jwt.sign({
        email: 'highgrade@test.com',
        name: 'High Grade User',
        ageGrade: 15
      }, TEST_JWT_SECRET, { expiresIn: '1h' });

      const response1 = await request(app)
        .post('/auth/magic-link')
        .send({ token: highGradeToken });

      expect(response1.status).toBe(400);
      expect(response1.body.message).toContain('Grade level must be between 0 and 12');

      // Test negative grade
      mockSend.mockResolvedValueOnce({ Items: [] }); // QueryCommand - No existing user
      
      const negativeGradeToken = jwt.sign({
        email: 'neggrade@test.com',
        name: 'Negative Grade User',
        ageGrade: -1
      }, TEST_JWT_SECRET, { expiresIn: '1h' });

      const response2 = await request(app)
        .post('/auth/magic-link')
        .send({ token: negativeGradeToken });

      expect(response2.status).toBe(400);
      expect(response2.body.message).toContain('Grade level must be between 0 and 12');
    });

    it('should handle database errors gracefully', async () => {
      mockSend.mockRejectedValueOnce(new Error('Database connection failed'));

      const validToken = jwt.sign({
        email: 'test@test.com'
      }, TEST_JWT_SECRET, { expiresIn: '1h' });

      const response = await request(app)
        .post('/auth/magic-link')
        .send({ token: validToken });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        valid: false,
        message: 'Server error',
        details: expect.any(String)
      });
    });

    it('should handle expired tokens', async () => {
      const expiredToken = jwt.sign({
        email: 'expired@test.com'
      }, TEST_JWT_SECRET, { expiresIn: '-1h' }); // Expired 1 hour ago

      const response = await request(app)
        .post('/auth/magic-link')
        .send({ token: expiredToken });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        valid: false,
        message: 'Invalid or expired token'
      });
    });
  });

  describe('Email Normalization', () => {
    it('should normalize email to lowercase for login', async () => {
      mockSend
        .mockResolvedValueOnce({
          Items: [{ userId: 'test-user', email: 'test@example.com' }]
        }) // QueryCommand - Email lookup
        .mockResolvedValueOnce({
          Item: {
            userId: 'test-user',
            email: 'test@example.com',
            name: 'Test User',
            ageGrade: 5
          }
        }) // GetCommand - User profile lookup
        .mockResolvedValueOnce({}); // UpdateCommand - lastActive update

      const tokenWithUppercaseEmail = jwt.sign({
        email: 'TEST@EXAMPLE.COM'
      }, TEST_JWT_SECRET, { expiresIn: '1h' });

      const response = await request(app)
        .post('/auth/magic-link')
        .send({ token: tokenWithUppercaseEmail });

      expect(response.status).toBe(200);

      // Find the QueryCommand call (should have lowercase email)
      const queryCommandCallIndex = mockSend.mock.calls.findIndex(call => 
        call[0].commandType === 'QueryCommand'
      );
      expect(queryCommandCallIndex).toBeGreaterThanOrEqual(0);
      
      const queryCommandCall = mockSend.mock.calls[queryCommandCallIndex][0];
      expect(queryCommandCall).toMatchObject({
        ExpressionAttributeValues: {
          ':email': 'test@example.com'
        }
      });
    });

    it('should normalize email to lowercase for signup', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [] }) // QueryCommand - No existing user
        .mockResolvedValueOnce({ Item: null }) // GetCommand - No focus mapping
        .mockResolvedValueOnce({}); // PutCommand - User creation

      const tokenWithUppercaseEmail = jwt.sign({
        email: 'NEWUSER@EXAMPLE.COM',
        name: 'New User',
        ageGrade: 3
      }, TEST_JWT_SECRET, { expiresIn: '1h' });

      const response = await request(app)
        .post('/auth/magic-link')
        .send({ token: tokenWithUppercaseEmail });

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('newuser@example.com');

      // Find the PutCommand call (should have lowercase email)
      const putCommandCallIndex = mockSend.mock.calls.findIndex(call => 
        call[0].commandType === 'PutCommand'
      );
      expect(putCommandCallIndex).toBeGreaterThanOrEqual(0);
      
      const putCommandCall = mockSend.mock.calls[putCommandCallIndex][0];
      expect(putCommandCall).toMatchObject({
        Item: expect.objectContaining({
          email: 'newuser@example.com'
        })
      });
    });
  });

  describe('POST /auth/magic-link - Phase 2: TrackId Handling', () => {
    describe('Valid TrackId - Existing User Login', () => {
      it('should include trackId in response for existing user with valid trackId', async () => {
        mockSend
          .mockResolvedValueOnce({
            Items: [{ userId: 'existing-user-123', email: 'test@speedrun.com' }]
          }) // QueryCommand - Email lookup
          .mockResolvedValueOnce({
            Item: {
              userId: 'existing-user-123',
              email: 'test@speedrun.com',
              name: 'Speedrun User',
              ageGrade: 5,
              focusTrack: 'TRACK1'
            }
          }) // GetCommand - User profile lookup
          .mockResolvedValueOnce({}); // UpdateCommand - lastActive update

        const loginTokenWithTrackId = jwt.sign({
          email: 'test@speedrun.com',
          trackId: 'TRACK5'
        }, TEST_JWT_SECRET, { expiresIn: '1h' });

        const response = await request(app)
          .post('/auth/magic-link')
          .send({ token: loginTokenWithTrackId });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          token: expect.any(String),
          user: {
            email: 'test@speedrun.com',
            userId: 'existing-user-123',
            name: 'Speedrun User',
            ageGrade: 5,
            focusTrack: 'TRACK1'
          },
          isNewUser: false,
          trackId: 'TRACK5'
        });
      });

      it('should work with all valid track IDs for existing users', async () => {
        const validTrackIds = ['TRACK1', 'TRACK2', 'TRACK3', 'TRACK4', 'TRACK5', 'TRACK6', 'TRACK7', 'TRACK8', 'TRACK9', 'TRACK10', 'TRACK11', 'TRACK12'];
        
        for (const trackId of validTrackIds) {
          jest.clearAllMocks();
          
          mockSend
            .mockResolvedValueOnce({
              Items: [{ userId: 'track-user-123', email: 'tracktest@speedrun.com' }]
            })
            .mockResolvedValueOnce({
              Item: {
                userId: 'track-user-123',
                email: 'tracktest@speedrun.com',
                name: 'Track Test User',
                ageGrade: 4
              }
            })
            .mockResolvedValueOnce({});

          const tokenWithTrackId = jwt.sign({
            email: 'tracktest@speedrun.com',
            trackId: trackId
          }, TEST_JWT_SECRET, { expiresIn: '1h' });

          const response = await request(app)
            .post('/auth/magic-link')
            .send({ token: tokenWithTrackId });

          expect(response.status).toBe(200);
          expect(response.body.trackId).toBe(trackId);
        }
      });
    });

    describe('Valid TrackId - New User Signup', () => {
      it('should include trackId in response for new user with valid trackId', async () => {
        mockSend
          .mockResolvedValueOnce({ Items: [] }) // QueryCommand - No existing user
          .mockResolvedValueOnce({ Item: null }) // GetCommand - No focus mapping
          .mockResolvedValueOnce({}); // PutCommand - User creation

        const signupTokenWithTrackId = jwt.sign({
          email: 'newspeedrun@test.com',
          name: 'New Speedrun User',
          ageGrade: 6,
          trackId: 'TRACK8'
        }, TEST_JWT_SECRET, { expiresIn: '1h' });

        const response = await request(app)
          .post('/auth/magic-link')
          .send({ token: signupTokenWithTrackId });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          token: expect.any(String),
          user: {
            email: 'newspeedrun@test.com',
            userId: expect.any(String),
            name: 'New Speedrun User',
            ageGrade: 6
          },
          isNewUser: true,
          trackId: 'TRACK8'
        });
      });

      it('should create user successfully when trackId is provided with signup data', async () => {
        mockSend
          .mockResolvedValueOnce({ Items: [] }) // QueryCommand - No existing user
          .mockResolvedValueOnce({ Item: null }) // GetCommand - No focus mapping
          .mockResolvedValueOnce({}); // PutCommand - User creation

        const signupTokenWithTrackId = jwt.sign({
          email: 'speedrunuser@test.com',
          name: 'Speedrun Test User',
          ageGrade: 3,
          trackId: 'TRACK12'
        }, TEST_JWT_SECRET, { expiresIn: '1h' });

        const response = await request(app)
          .post('/auth/magic-link')
          .send({ token: signupTokenWithTrackId });

        expect(response.status).toBe(200);
        expect(response.body.trackId).toBe('TRACK12');

        // Verify user was created properly (trackId doesn't affect user creation, just response)
        const putCommandCallIndex = mockSend.mock.calls.findIndex(call => 
          call[0].commandType === 'PutCommand'
        );
        expect(putCommandCallIndex).toBeGreaterThanOrEqual(0);
        
        const putCommandCall = mockSend.mock.calls[putCommandCallIndex][0];
        expect(putCommandCall).toMatchObject({
          Item: expect.objectContaining({
            email: 'speedrunuser@test.com',
            name: 'Speedrun Test User',
            ageGrade: 3
          })
        });
      });
    });

    describe('Invalid TrackId - Error Cases', () => {
      it('should reject invalid trackId for existing user', async () => {
        const invalidTrackToken = jwt.sign({
          email: 'test@speedrun.com',
          trackId: 'INVALID_TRACK'
        }, TEST_JWT_SECRET, { expiresIn: '1h' });

        const response = await request(app)
          .post('/auth/magic-link')
          .send({ token: invalidTrackToken });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          valid: false,
          message: 'Invalid track ID provided'
        });

        // Should not call any database operations
        expect(mockSend).not.toHaveBeenCalled();
      });

      it('should reject invalid trackId for new user signup', async () => {
        const invalidTrackToken = jwt.sign({
          email: 'newuser@speedrun.com',
          name: 'New User',
          ageGrade: 4,
          trackId: 'TRACK99'
        }, TEST_JWT_SECRET, { expiresIn: '1h' });

        const response = await request(app)
          .post('/auth/magic-link')
          .send({ token: invalidTrackToken });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          valid: false,
          message: 'Invalid track ID provided'
        });

        // Should not call any database operations
        expect(mockSend).not.toHaveBeenCalled();
      });

      it('should reject various invalid track formats', async () => {
        const invalidTrackIds = [
          'track5',           // lowercase
          'Track5',           // mixed case
          'TRACK_5',          // underscore
          'TRACK05',          // leading zero
          'TRACK13',          // out of range
          'TRACK0',           // zero track
          'MYTRICK',          // completely wrong
          'TRACK',            // missing number
          '5',                // just number
          'TRACK 5',          // space
          'TRACK-5'           // hyphen
        ];

        for (const invalidTrackId of invalidTrackIds) {
          jest.clearAllMocks();
          
          const invalidToken = jwt.sign({
            email: 'test@invalid.com',
            trackId: invalidTrackId
          }, TEST_JWT_SECRET, { expiresIn: '1h' });

          const response = await request(app)
            .post('/auth/magic-link')
            .send({ token: invalidToken });

          expect(response.status).toBe(400);
          expect(response.body.message).toBe('Invalid track ID provided');
        }
        
        // Test empty string separately as it might be handled differently
        jest.clearAllMocks();
        const emptyTrackToken = jwt.sign({
          email: 'test@invalid.com',
          trackId: ''
        }, TEST_JWT_SECRET, { expiresIn: '1h' });

        const emptyResponse = await request(app)
          .post('/auth/magic-link')
          .send({ token: emptyTrackToken });

        expect(emptyResponse.status).toBe(400);
        expect(emptyResponse.body.message).toBe('Invalid track ID provided');
      });
    });

    describe('No TrackId - Default Behavior', () => {
      it('should work normally for existing user without trackId', async () => {
        mockSend
          .mockResolvedValueOnce({
            Items: [{ userId: 'normal-user-123', email: 'normal@test.com' }]
          })
          .mockResolvedValueOnce({
            Item: {
              userId: 'normal-user-123',
              email: 'normal@test.com',
              name: 'Normal User',
              ageGrade: 3
            }
          })
          .mockResolvedValueOnce({});

        const normalLoginToken = jwt.sign({
          email: 'normal@test.com'
        }, TEST_JWT_SECRET, { expiresIn: '1h' });

        const response = await request(app)
          .post('/auth/magic-link')
          .send({ token: normalLoginToken });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          token: expect.any(String),
          user: {
            email: 'normal@test.com',
            userId: 'normal-user-123',
            name: 'Normal User',
            ageGrade: 3
          },
          isNewUser: false
        });

        // Should not include trackId in response
        expect(response.body.trackId).toBeUndefined();
      });

      it('should work normally for new user without trackId', async () => {
        mockSend
          .mockResolvedValueOnce({ Items: [] })
          .mockResolvedValueOnce({ Item: null })
          .mockResolvedValueOnce({});

        const normalSignupToken = jwt.sign({
          email: 'normalnew@test.com',
          name: 'Normal New User',
          ageGrade: 7
        }, TEST_JWT_SECRET, { expiresIn: '1h' });

        const response = await request(app)
          .post('/auth/magic-link')
          .send({ token: normalSignupToken });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          token: expect.any(String),
          user: {
            email: 'normalnew@test.com',
            userId: expect.any(String),
            name: 'Normal New User',
            ageGrade: 7
          },
          isNewUser: true
        });

        // Should not include trackId in response
        expect(response.body.trackId).toBeUndefined();
      });
    });

    describe('TrackId Edge Cases', () => {
      it('should handle null trackId gracefully', async () => {
        mockSend
          .mockResolvedValueOnce({
            Items: [{ userId: 'user-123', email: 'test@null.com' }]
          })
          .mockResolvedValueOnce({
            Item: {
              userId: 'user-123',
              email: 'test@null.com',
              name: 'Test User',
              ageGrade: 2
            }
          })
          .mockResolvedValueOnce({});

        const tokenWithNullTrackId = jwt.sign({
          email: 'test@null.com',
          trackId: null
        }, TEST_JWT_SECRET, { expiresIn: '1h' });

        const response = await request(app)
          .post('/auth/magic-link')
          .send({ token: tokenWithNullTrackId });

        expect(response.status).toBe(200);
        expect(response.body.trackId).toBeUndefined();
      });

      it('should handle undefined trackId gracefully', async () => {
        mockSend
          .mockResolvedValueOnce({
            Items: [{ userId: 'user-456', email: 'test@undefined.com' }]
          })
          .mockResolvedValueOnce({
            Item: {
              userId: 'user-456',
              email: 'test@undefined.com',
              name: 'Test User',
              ageGrade: 1
            }
          })
          .mockResolvedValueOnce({});

        const tokenWithUndefinedTrackId = jwt.sign({
          email: 'test@undefined.com',
          trackId: undefined
        }, TEST_JWT_SECRET, { expiresIn: '1h' });

        const response = await request(app)
          .post('/auth/magic-link')
          .send({ token: tokenWithUndefinedTrackId });

        expect(response.status).toBe(200);
        expect(response.body.trackId).toBeUndefined();
      });
    });

    describe('Speedrun Integration Scenarios', () => {
      it('should handle full Speedrun token payload for existing user', async () => {
        mockSend
          .mockResolvedValueOnce({
            Items: [{ userId: 'speedrun-existing', email: 'student@speedrun.com' }]
          })
          .mockResolvedValueOnce({
            Item: {
              userId: 'speedrun-existing',
              email: 'student@speedrun.com',
              name: 'Existing Student',
              ageGrade: 8,
              focusTrack: 'TRACK2'
            }
          })
          .mockResolvedValueOnce({});

        // Simulate Speedrun generating a token for existing user (they assume new but we detect existing)
        const speedrunToken = jwt.sign({
          email: 'student@speedrun.com',
          name: 'Speedrun Student',  // This will be ignored since user exists
          ageGrade: 9,               // This will be ignored since user exists
          trackId: 'TRACK6'
        }, TEST_JWT_SECRET, { expiresIn: '1h' });

        const response = await request(app)
          .post('/auth/magic-link')
          .send({ token: speedrunToken });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          token: expect.any(String),
          user: {
            email: 'student@speedrun.com',
            userId: 'speedrun-existing',
            name: 'Existing Student',    // Original name preserved
            ageGrade: 8,                 // Original grade preserved
            focusTrack: 'TRACK2'         // Original track preserved
          },
          isNewUser: false,
          trackId: 'TRACK6'              // Assessment track for redirection
        });
      });

      it('should handle full Speedrun token payload for new user', async () => {
        mockSend
          .mockResolvedValueOnce({ Items: [] }) // No existing user
          .mockResolvedValueOnce({ Item: null }) // No focus mapping
          .mockResolvedValueOnce({}); // User creation

        // Simulate Speedrun generating a token for new user
        const speedrunToken = jwt.sign({
          email: 'newstudent@speedrun.com',
          name: 'New Speedrun Student',
          ageGrade: 10,
          trackId: 'TRACK11'
        }, TEST_JWT_SECRET, { expiresIn: '1h' });

        const response = await request(app)
          .post('/auth/magic-link')
          .send({ token: speedrunToken });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          token: expect.any(String),
          user: {
            email: 'newstudent@speedrun.com',
            userId: expect.any(String),
            name: 'New Speedrun Student',
            ageGrade: 10
          },
          isNewUser: true,
          trackId: 'TRACK11'
        });

        // Verify user creation with correct password
        const putCommandCallIndex = mockSend.mock.calls.findIndex(call => 
          call[0].commandType === 'PutCommand'
        );
        const putCommandCall = mockSend.mock.calls[putCommandCallIndex][0];
        expect(putCommandCall.Item.password_hash).toBeDefined();
        expect(putCommandCall.Item.password_hash).not.toBe('SpeedRun1!'); // Should be hashed
      });
    });
  });
}); 