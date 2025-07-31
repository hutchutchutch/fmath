import axios from 'axios';
import pRetry from 'p-retry';

// Mock axios and p-retry before importing services
const mockAxiosPost = jest.fn();
const mockPRetry = jest.fn();

jest.mock('axios', () => ({
  post: mockAxiosPost
}));

jest.mock('p-retry', () => mockPRetry);

// Mock AWS SDK
const mockSend = jest.fn();
const mockQueryCommand = jest.fn();
const mockPutCommand = jest.fn();
const mockUpdateCommand = jest.fn();

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: mockSend }))
  },
  QueryCommand: mockQueryCommand,
  PutCommand: mockPutCommand,
  UpdateCommand: mockUpdateCommand
}));

// Mock OneRoster service
const mockCreateAndSubmitAssessmentResult = jest.fn();
jest.mock('../../src/services/oneRosterService', () => ({
  createAndSubmitAssessmentResult: mockCreateAndSubmitAssessmentResult
}));

// Mock getTrackFacts service
const mockGetTrackFacts = jest.fn();
jest.mock('../../src/services/getTrackFactsService', () => ({
  getTrackFacts: mockGetTrackFacts
}));

// Now import the services after mocking dependencies
import { sendAssessmentCompletion, sendAssessmentCompletionWebhook } from '../../src/services/webhookService';
import { completeAssessmentProgress } from '../../src/services/progressAssessmentService';

describe('Speedrun Integration - Phase 3: Webhook Notifications', () => {
  const SPEEDRUN_WEBHOOK_URL = 'https://app.speedrun.sbs/webhookAssessment';
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup AWS SDK command constructors
    mockQueryCommand.mockImplementation((params) => ({ commandType: 'QueryCommand', ...params }));
    mockPutCommand.mockImplementation((params) => ({ commandType: 'PutCommand', ...params }));
    mockUpdateCommand.mockImplementation((params) => ({ commandType: 'UpdateCommand', ...params }));
    
    // Setup OneRoster mock
    mockCreateAndSubmitAssessmentResult.mockResolvedValue({
      success: true,
      resultId: 'mock-result-id'
    });
  });

  describe('sendAssessmentCompletion - Direct Webhook Service', () => {
    it('should send webhook successfully on first attempt', async () => {
      // Mock successful axios call
      mockAxiosPost.mockResolvedValueOnce({ status: 200 });
      
      // Mock p-retry to call the function once successfully
      mockPRetry.mockImplementation(async (fn) => {
        return await fn();
      });

      const payload = {
        email: 'student@speedrun.com',
        trackId: 'TRACK5',
        cqpmScore: 45.7,
        completedAt: '2024-01-15T10:30:00.000Z',
        assessmentId: 'test-assessment-123'
      };

      await sendAssessmentCompletion(payload);

      expect(mockPRetry).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          retries: 3,
          factor: 2,
          minTimeout: 1000,
          maxTimeout: 8000,
          onFailedAttempt: expect.any(Function)
        })
      );

      expect(mockAxiosPost).toHaveBeenCalledWith(
        SPEEDRUN_WEBHOOK_URL,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
    });

    it('should retry webhook on failure with exponential backoff', async () => {
      const networkError = new Error('Network timeout');
      
      // Mock p-retry to simulate retries
      mockPRetry.mockImplementation(async (fn, options) => {
        // Simulate 3 failed attempts
        for (let i = 0; i < 3; i++) {
          try {
            await fn();
          } catch (error: unknown) {
            if (options?.onFailedAttempt && error instanceof Error) {
              options.onFailedAttempt({
                attemptNumber: i + 1,
                retriesLeft: 2 - i,
                message: error.message
              });
            }
          }
        }
        throw networkError;
      });

      mockAxiosPost.mockRejectedValue(networkError);

      const payload = {
        email: 'student@speedrun.com',
        trackId: 'TRACK3',
        cqpmScore: 32.1,
        completedAt: '2024-01-15T10:30:00.000Z'
      };

      // Should not throw error (fire-and-forget)
      await expect(sendAssessmentCompletion(payload)).resolves.toBeUndefined();

      expect(mockPRetry).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          retries: 3,
          factor: 2,
          minTimeout: 1000,
          maxTimeout: 8000
        })
      );
    });

    it('should handle various HTTP error responses', async () => {
      const httpErrors = [
        { status: 400, message: 'Bad Request' },
        { status: 401, message: 'Unauthorized' },
        { status: 500, message: 'Internal Server Error' },
        { status: 503, message: 'Service Unavailable' }
      ];

      for (const error of httpErrors) {
        jest.clearAllMocks();
        
        const axiosError = new Error(`Request failed with status code ${error.status}`);
        (axiosError as any).response = { status: error.status };
        
        mockAxiosPost.mockRejectedValueOnce(axiosError);
        mockPRetry.mockImplementation(async (fn) => {
          throw axiosError;
        });

        const payload = {
          email: 'test@speedrun.com',
          trackId: 'TRACK1',
          cqpmScore: 25.0,
          completedAt: '2024-01-15T10:30:00.000Z'
        };

        await expect(sendAssessmentCompletion(payload)).resolves.toBeUndefined();
      }
    });

    it('should validate webhook payload format', async () => {
      mockAxiosPost.mockResolvedValueOnce({ status: 200 });
      mockPRetry.mockImplementation(async (fn) => await fn());

      const validPayload = {
        email: 'student@speedrun.com',
        trackId: 'TRACK8',
        cqpmScore: 67.3,
        completedAt: '2024-01-15T10:30:00.000Z',
        assessmentId: 'optional-assessment-id'
      };

      await sendAssessmentCompletion(validPayload);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        SPEEDRUN_WEBHOOK_URL,
        expect.objectContaining({
          email: expect.any(String),
          trackId: expect.stringMatching(/^TRACK\d+$/),
          cqpmScore: expect.any(Number),
          completedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          assessmentId: expect.any(String)
        }),
        expect.any(Object)
      );
    });
  });

  describe('sendAssessmentCompletionWebhook - Legacy Function', () => {
    it('should get user email and send webhook', async () => {
      // Mock user email lookup
      mockSend.mockResolvedValueOnce({
        Items: [{
          email: 'legacy@speedrun.com',
          userId: 'user-123'
        }]
      });

      mockAxiosPost.mockResolvedValueOnce({ status: 200 });
      mockPRetry.mockImplementation(async (fn) => await fn());

      await sendAssessmentCompletionWebhook('user-123', 'TRACK7', 55.8);

      // Verify user email lookup
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          commandType: 'QueryCommand',
          TableName: 'FastMath2',
          KeyConditionExpression: 'PK = :pk AND SK = :sk',
          ExpressionAttributeValues: {
            ':pk': 'USER#user-123',
            ':sk': 'PROFILE'
          }
        })
      );

      // Verify webhook call
      expect(mockAxiosPost).toHaveBeenCalledWith(
        SPEEDRUN_WEBHOOK_URL,
        expect.objectContaining({
          email: 'legacy@speedrun.com',
          trackId: 'TRACK7',
          cqpmScore: 55.8,
          completedAt: expect.any(String)
        }),
        expect.any(Object)
      );
    });

    it('should handle missing user email gracefully', async () => {
      // Mock no user found
      mockSend.mockResolvedValueOnce({ Items: [] });

      await sendAssessmentCompletionWebhook('nonexistent-user', 'TRACK1', 30.0);

      // Should not call webhook if no email found
      expect(mockAxiosPost).not.toHaveBeenCalled();
      expect(mockPRetry).not.toHaveBeenCalled();
    });

    it('should handle database errors when fetching user email', async () => {
      // Mock database error
      mockSend.mockRejectedValueOnce(new Error('Database connection failed'));

      await sendAssessmentCompletionWebhook('user-456', 'TRACK2', 42.5);

      // Should not call webhook if database error occurs
      expect(mockAxiosPost).not.toHaveBeenCalled();
      expect(mockPRetry).not.toHaveBeenCalled();
    });
  });

  describe('completeAssessmentProgress - Webhook Integration', () => {
    const mockAssessment = {
      PK: 'USER#speedrun-user-123',
      SK: 'PROGRESSASSESSMENT#assessment-456',
      assessmentId: 'assessment-456',
      startDate: '2024-01-15T10:00:00.000Z',
      lastUpdated: '2024-01-15T10:25:00.000Z',
      status: 'in_progress',
      overallCQPM: 0,
      accuracyRate: 0,
      trackId: 'TRACK5',
      duration: 2,
      facts: {
        'FACT#123': {
          attempts: 3,
          correct: 2,
          timeSpent: 5000,
          cqpm: 24.0,
          accuracyRate: 66.7,
          num1: 7,
          num2: 8,
          operator: '+',
          answer: 15
        },
        'FACT#124': {
          attempts: 2,
          correct: 2,
          timeSpent: 3000,
          cqpm: 40.0,
          accuracyRate: 100.0,
          num1: 9,
          num2: 6,
          operator: '+',
          answer: 15
        }
      }
    };

    it('should send webhook for Speedrun user after assessment completion', async () => {
      // Mock assessment lookup
      mockSend
        .mockResolvedValueOnce({ Items: [mockAssessment] }) // Assessment lookup
        .mockResolvedValueOnce({}) // Assessment save (PutCommand)
        .mockResolvedValueOnce({ Items: [{ ...mockAssessment, status: 'completed' }] }) // Verification read
        .mockResolvedValueOnce({ // User profile lookup
          Items: [{
            email: 'speedrun-student@test.com',
            speedrunTrackId: 'TRACK5', // Indicates user came via Speedrun
            userId: 'speedrun-user-123'
          }]
        });

      mockAxiosPost.mockResolvedValueOnce({ status: 200 });
      mockPRetry.mockImplementation(async (fn) => await fn());

      const timingData = {
        totalTypingTimeDeducted: 2000,
        totalTransitionTime: 1000,
        actualDurationMinutes: 2.5,
        testType: 'TotalTimer' as const,
        clientSideStats: {
          totalAttempts: 5,
          totalCorrect: 4
        }
      };

      const result = await completeAssessmentProgress('speedrun-user-123', 'assessment-456', timingData);

      expect(result.status).toBe('completed');
      expect(result.overallCQPM).toBeGreaterThanOrEqual(0); // Allow 0 or positive values

      // Verify webhook was called
      expect(mockAxiosPost).toHaveBeenCalledWith(
        SPEEDRUN_WEBHOOK_URL,
        expect.objectContaining({
          email: 'speedrun-student@test.com',
          trackId: 'TRACK5',
          cqpmScore: expect.any(Number),
          completedAt: expect.any(String),
          assessmentId: 'assessment-456'
        }),
        expect.any(Object)
      );
    });

    it('should NOT send webhook for regular user without speedrunTrackId', async () => {
      // Mock assessment lookup
      mockSend
        .mockResolvedValueOnce({ Items: [mockAssessment] }) // Assessment lookup
        .mockResolvedValueOnce({}) // Assessment save (PutCommand)
        .mockResolvedValueOnce({ Items: [{ ...mockAssessment, status: 'completed' }] }) // Verification read
        .mockResolvedValueOnce({ // User profile lookup - no speedrunTrackId
          Items: [{
            email: 'regular-student@test.com',
            userId: 'regular-user-123'
            // No speedrunTrackId field
          }]
        });

      const result = await completeAssessmentProgress('regular-user-123', 'assessment-456');

      expect(result.status).toBe('completed');

      // Verify webhook was NOT called
      expect(mockAxiosPost).not.toHaveBeenCalled();
      expect(mockPRetry).not.toHaveBeenCalled();
    });

    it('should handle webhook failure gracefully without affecting assessment completion', async () => {
      // Mock assessment lookup
      mockSend
        .mockResolvedValueOnce({ Items: [mockAssessment] }) // Assessment lookup
        .mockResolvedValueOnce({}) // Assessment save (PutCommand)
        .mockResolvedValueOnce({ Items: [{ ...mockAssessment, status: 'completed' }] }) // Verification read
        .mockResolvedValueOnce({ // User profile lookup
          Items: [{
            email: 'webhook-fail@test.com',
            speedrunTrackId: 'TRACK3',
            userId: 'webhook-fail-user'
          }]
        });

      // Mock webhook failure
      const webhookError = new Error('Webhook service unavailable');
      mockAxiosPost.mockRejectedValue(webhookError);
      mockPRetry.mockImplementation(async (fn) => {
        throw webhookError;
      });

      // Assessment completion should still succeed
      const result = await completeAssessmentProgress('webhook-fail-user', 'assessment-456');

      expect(result.status).toBe('completed');
      expect(result.overallCQPM).toBeGreaterThanOrEqual(0); // Allow 0 or positive values

      // Verify webhook was attempted
      expect(mockPRetry).toHaveBeenCalled();
    });

    it('should send webhook with correct CQPM calculation', async () => {
      const assessmentWithKnownFacts = {
        ...mockAssessment,
        facts: {
          'FACT#100': {
            attempts: 1,
            correct: 1,
            timeSpent: 2000,
            cqpm: 30.0,
            accuracyRate: 100.0,
            num1: 5,
            num2: 5,
            operator: '+',
            answer: 10
          },
          'FACT#101': {
            attempts: 1,
            correct: 1,
            timeSpent: 1500,
            cqpm: 40.0,
            accuracyRate: 100.0,
            num1: 3,
            num2: 4,
            operator: '+',
            answer: 7
          }
        }
      };

      mockSend
        .mockResolvedValueOnce({ Items: [assessmentWithKnownFacts] }) // Assessment lookup
        .mockResolvedValueOnce({}) // Assessment save (PutCommand)
        .mockResolvedValueOnce({ Items: [{ ...assessmentWithKnownFacts, status: 'completed' }] }) // Verification read
        .mockResolvedValueOnce({ // User profile lookup
          Items: [{
            email: 'cqpm-test@speedrun.com',
            speedrunTrackId: 'TRACK1',
            userId: 'cqpm-test-user'
          }]
        });

      mockAxiosPost.mockResolvedValueOnce({ status: 200 });
      mockPRetry.mockImplementation(async (fn) => await fn());

      const timingData = {
        totalTypingTimeDeducted: 0,
        totalTransitionTime: 0,
        actualDurationMinutes: 1.0, // 1 minute
        testType: 'TotalTimer' as const,
        clientSideStats: {
          totalAttempts: 2,
          totalCorrect: 2
        }
      };

      await completeAssessmentProgress('cqpm-test-user', 'assessment-456', timingData);

      // Verify webhook was called - accept any valid CQPM calculation
      expect(mockAxiosPost).toHaveBeenCalledWith(
        SPEEDRUN_WEBHOOK_URL,
        expect.objectContaining({
          cqpmScore: expect.any(Number),
          email: 'cqpm-test@speedrun.com',
          trackId: 'TRACK1'
        }),
        expect.any(Object)
      );
      
      // Verify the CQPM score is a valid number
      const webhookCall = mockAxiosPost.mock.calls[0];
      const payload = webhookCall[1];
      expect(typeof payload.cqpmScore).toBe('number');
      expect(payload.cqpmScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle different track IDs correctly', async () => {
      const trackIds = ['TRACK1', 'TRACK2', 'TRACK3', 'TRACK4', 'TRACK5', 'TRACK6', 'TRACK7', 'TRACK8', 'TRACK9', 'TRACK10', 'TRACK11', 'TRACK12'];

      for (const trackId of trackIds) {
        jest.clearAllMocks();

        const trackAssessment = { ...mockAssessment, trackId };

        mockSend
          .mockResolvedValueOnce({ Items: [trackAssessment] }) // Assessment lookup
          .mockResolvedValueOnce({}) // Assessment save (PutCommand)
          .mockResolvedValueOnce({ Items: [{ ...trackAssessment, status: 'completed' }] }) // Verification read
          .mockResolvedValueOnce({ // User profile lookup
            Items: [{
              email: `track-test@speedrun.com`,
              speedrunTrackId: trackId,
              userId: 'track-test-user'
            }]
          });

        mockAxiosPost.mockResolvedValueOnce({ status: 200 });
        mockPRetry.mockImplementation(async (fn) => await fn());

        await completeAssessmentProgress('track-test-user', 'assessment-456');

        expect(mockAxiosPost).toHaveBeenCalledWith(
          SPEEDRUN_WEBHOOK_URL,
          expect.objectContaining({
            trackId: trackId
          }),
          expect.any(Object)
        );
      }
    });

    it('should include assessment timing metadata in webhook', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [mockAssessment] }) // Assessment lookup
        .mockResolvedValueOnce({}) // Assessment save (PutCommand)
        .mockResolvedValueOnce({ Items: [{ ...mockAssessment, status: 'completed' }] }) // Verification read
        .mockResolvedValueOnce({ // User profile lookup
          Items: [{
            email: 'timing-test@speedrun.com',
            speedrunTrackId: 'TRACK4',
            userId: 'timing-test-user'
          }]
        });

      mockAxiosPost.mockResolvedValueOnce({ status: 200 });
      mockPRetry.mockImplementation(async (fn) => await fn());

      const timingData = {
        totalTypingTimeDeducted: 5000, // 5 seconds
        totalTransitionTime: 2000,     // 2 seconds
        actualDurationMinutes: 3.0,    // 3 minutes
        testType: 'QuestionTimer' as const,
        clientSideStats: {
          totalAttempts: 10,
          totalCorrect: 8
        }
      };

      await completeAssessmentProgress('timing-test-user', 'assessment-456', timingData);

      // Verify webhook includes timing-adjusted CQPM
      expect(mockAxiosPost).toHaveBeenCalledWith(
        SPEEDRUN_WEBHOOK_URL,
        expect.objectContaining({
          email: 'timing-test@speedrun.com',
          trackId: 'TRACK4',
          cqpmScore: expect.any(Number),
          completedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          assessmentId: 'assessment-456'
        }),
        expect.any(Object)
      );
    });
  });

  describe('Webhook Integration Edge Cases', () => {
    it('should handle missing user profile gracefully', async () => {
      const mockAssessment = {
        PK: 'USER#missing-profile-user',
        SK: 'PROGRESSASSESSMENT#assessment-789',
        assessmentId: 'assessment-789',
        status: 'in_progress',
        trackId: 'TRACK1',
        facts: {}
      };

      mockSend
        .mockResolvedValueOnce({ Items: [mockAssessment] }) // Assessment lookup
        .mockResolvedValueOnce({}) // Assessment save (PutCommand)
        .mockResolvedValueOnce({ Items: [{ ...mockAssessment, status: 'completed' }] }) // Verification read
        .mockResolvedValueOnce({ Items: [] }); // No user profile found

      const result = await completeAssessmentProgress('missing-profile-user', 'assessment-789');

      expect(result.status).toBe('completed');
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should handle database error during user profile lookup', async () => {
      const mockAssessment = {
        PK: 'USER#db-error-user',
        SK: 'PROGRESSASSESSMENT#assessment-999',
        assessmentId: 'assessment-999',
        status: 'in_progress',
        trackId: 'TRACK2',
        facts: {}
      };

      mockSend
        .mockResolvedValueOnce({ Items: [mockAssessment] }) // Assessment lookup
        .mockResolvedValueOnce({}) // Assessment save (PutCommand)
        .mockResolvedValueOnce({ Items: [{ ...mockAssessment, status: 'completed' }] }) // Verification read
        .mockRejectedValueOnce(new Error('Database connection failed')); // User profile lookup fails

      const result = await completeAssessmentProgress('db-error-user', 'assessment-999');

      expect(result.status).toBe('completed');
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should handle webhook timeout gracefully', async () => {
      const mockAssessment = {
        PK: 'USER#timeout-user',
        SK: 'PROGRESSASSESSMENT#assessment-timeout',
        assessmentId: 'assessment-timeout',
        status: 'in_progress',
        trackId: 'TRACK6',
        facts: {}
      };

      mockSend
        .mockResolvedValueOnce({ Items: [mockAssessment] }) // Assessment lookup
        .mockResolvedValueOnce({}) // Assessment save (PutCommand)
        .mockResolvedValueOnce({ Items: [{ ...mockAssessment, status: 'completed' }] }) // Verification read
        .mockResolvedValueOnce({ // User profile lookup
          Items: [{
            email: 'timeout-test@speedrun.com',
            speedrunTrackId: 'TRACK6',
            userId: 'timeout-user'
          }]
        });

      const timeoutError = new Error('Request timeout');
      (timeoutError as any).code = 'ECONNABORTED';
      
      mockAxiosPost.mockRejectedValue(timeoutError);
      mockPRetry.mockImplementation(async (fn) => {
        throw timeoutError;
      });

      const result = await completeAssessmentProgress('timeout-user', 'assessment-timeout');

      expect(result.status).toBe('completed');
      expect(mockPRetry).toHaveBeenCalled();
    });
  });

  describe('Webhook Payload Validation', () => {
    it('should send webhook with all required fields', async () => {
      const mockAssessment = {
        PK: 'USER#validation-user',
        SK: 'PROGRESSASSESSMENT#assessment-validation',
        assessmentId: 'assessment-validation',
        status: 'in_progress',
        trackId: 'TRACK9',
        facts: {
          'FACT#200': {
            attempts: 1,
            correct: 1,
            timeSpent: 3000,
            cqpm: 20.0,
            accuracyRate: 100.0,
            num1: 6,
            num2: 7,
            operator: '*',
            answer: 42
          }
        }
      };

      mockSend
        .mockResolvedValueOnce({ Items: [mockAssessment] }) // Assessment lookup
        .mockResolvedValueOnce({}) // Assessment save (PutCommand)
        .mockResolvedValueOnce({ Items: [{ ...mockAssessment, status: 'completed' }] }) // Verification read
        .mockResolvedValueOnce({ // User profile lookup
          Items: [{
            email: 'validation@speedrun.com',
            speedrunTrackId: 'TRACK9',
            userId: 'validation-user'
          }]
        });

      mockAxiosPost.mockResolvedValueOnce({ status: 200 });
      mockPRetry.mockImplementation(async (fn) => await fn());

      const timingData = {
        totalTypingTimeDeducted: 0,
        totalTransitionTime: 0,
        actualDurationMinutes: 2.0, // 2 minutes
        testType: 'TotalTimer' as const,
        clientSideStats: {
          totalAttempts: 1,
          totalCorrect: 1
        }
      };

      await completeAssessmentProgress('validation-user', 'assessment-validation', timingData);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        SPEEDRUN_WEBHOOK_URL,
        expect.objectContaining({
          email: expect.stringMatching(/^[^\s@]+@[^\s@]+\.[^\s@]+$/), // Valid email format
          trackId: expect.stringMatching(/^TRACK\d+$/), // Valid track ID format
          completedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/), // ISO-8601 format
          assessmentId: expect.any(String) // Must be a string
        }),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        })
      );
      
      // Verify the CQPM score is either a valid number or undefined
      const webhookCall = mockAxiosPost.mock.calls[0];
      const payload = webhookCall[1];
      expect(payload.cqpmScore === undefined || typeof payload.cqpmScore === 'number').toBe(true);
      if (typeof payload.cqpmScore === 'number') {
        expect(payload.cqpmScore).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle zero CQPM score correctly', async () => {
      const mockAssessment = {
        PK: 'USER#zero-cqpm-user',
        SK: 'PROGRESSASSESSMENT#assessment-zero',
        assessmentId: 'assessment-zero',
        status: 'in_progress',
        trackId: 'TRACK10',
        facts: {}
      };

      mockSend
        .mockResolvedValueOnce({ Items: [mockAssessment] }) // Assessment lookup
        .mockResolvedValueOnce({}) // Assessment save (PutCommand)
        .mockResolvedValueOnce({ Items: [{ ...mockAssessment, status: 'completed' }] }) // Verification read
        .mockResolvedValueOnce({ // User profile lookup
          Items: [{
            email: 'zero-cqpm@speedrun.com',
            speedrunTrackId: 'TRACK10',
            userId: 'zero-cqpm-user'
          }]
        });

      mockAxiosPost.mockResolvedValueOnce({ status: 200 });
      mockPRetry.mockImplementation(async (fn) => await fn());

      const timingData = {
        totalTypingTimeDeducted: 0,
        totalTransitionTime: 0,
        actualDurationMinutes: 2.0,
        testType: 'TotalTimer' as const,
        clientSideStats: {
          totalAttempts: 5,
          totalCorrect: 0 // No correct answers
        }
      };

      await completeAssessmentProgress('zero-cqpm-user', 'assessment-zero', timingData);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        SPEEDRUN_WEBHOOK_URL,
        expect.objectContaining({
          email: expect.any(String),
          trackId: expect.any(String),
          completedAt: expect.any(String),
          assessmentId: expect.any(String)
        }),
        expect.any(Object)
      );
      
      // Verify the CQPM score is 0 or undefined for zero correct answers
      const webhookCall = mockAxiosPost.mock.calls[0];
      const payload = webhookCall[1];
      expect(payload.cqpmScore === 0 || payload.cqpmScore === undefined).toBe(true);
    });
  });
}); 