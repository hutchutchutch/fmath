// Mock AWS SDK before importing services
const mockSend = jest.fn();

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: mockSend }))
  },
  UpdateCommand: jest.fn(),
  GetCommand: jest.fn()
}));

// Mock caliper event service
const mockSendMetrics = jest.fn();
const mockSendActivityEvents = jest.fn();

jest.mock('../../src/services/caliperEventService', () => ({
  __esModule: true,
  default: {
    sendMetrics: mockSendMetrics,
    sendActivityEvents: mockSendActivityEvents
  },
  ActivityType: {
    LEARNING: 'Learning',
    ACCURACY_PRACTICE: 'Accuracy Practice',
    FLUENCY_PRACTICE: 'Fluency Practice',
    ASSESSMENT: 'Assessment',
    ONBOARDING: 'Onboarding',
    DAILY_GOALS: 'Daily Goals'
  }
}));

// Import services after mocking
import activityMetricsService from '../../src/services/activityMetricsService';
import { ActivityType } from '../../src/services/caliperEventService';

describe('XP Calculation - Core Tests', () => {
  const TEST_USER_ID = 'test-user-123';
  const TEST_SESSION_ID = 'test-session-456';

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockClear();
    mockSendMetrics.mockClear();
    mockSendActivityEvents.mockClear();
  });

  describe('Basic XP Calculation', () => {
    test('calculates base XP from active time', async () => {
      // Mock GetCommand - item exists with deltas
      mockSend.mockResolvedValueOnce({
        Item: {
          activeTimeDelta: 120,
          timeSpentDelta: 120,
          totalQuestionsDelta: 5,
          correctQuestionsDelta: 4
        }
      });

      // Mock UpdateCommand - returns the deltas that were flushed
      mockSend.mockResolvedValueOnce({
        Attributes: {
          activeTimeDelta: 120, // 2 minutes of active time
          timeSpentDelta: 120,
          totalQuestionsDelta: 5,
          correctQuestionsDelta: 4 // 80% accuracy
        }
      });

      await activityMetricsService.flush(TEST_USER_ID, TEST_SESSION_ID, ActivityType.LEARNING);

      // Verify XP calculation: 120 seconds / 60 = 2 XP (no bonus for 80% accuracy)
      expect(mockSendMetrics).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        items: {
          xpEarned: 2, // 120 seconds / 60 = 2 XP
          totalQuestions: 5,
          correctQuestions: 4
        },
        eventTime: expect.any(String)
      });
    });

    test('applies 20% bonus for 100% accuracy', async () => {
      // Mock GetCommand
      mockSend.mockResolvedValueOnce({
        Item: {
          activeTimeDelta: 120,
          timeSpentDelta: 120,
          totalQuestionsDelta: 5,
          correctQuestionsDelta: 5
        }
      });

      // Mock UpdateCommand
      mockSend.mockResolvedValueOnce({
        Attributes: {
          activeTimeDelta: 120, // 2 minutes of active time
          timeSpentDelta: 120,
          totalQuestionsDelta: 5,
          correctQuestionsDelta: 5 // Perfect accuracy
        }
      });

      await activityMetricsService.flush(TEST_USER_ID, TEST_SESSION_ID, ActivityType.ACCURACY_PRACTICE);

      // Verify XP calculation with 20% bonus: (120 / 60) * 1.2 = 2.4 XP
      expect(mockSendMetrics).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        items: {
          xpEarned: 2.4, // 2 XP * 1.2 bonus = 2.4 XP
          totalQuestions: 5,
          correctQuestions: 5
        },
        eventTime: expect.any(String)
      });
    });

    test('no bonus for partial accuracy', async () => {
      // Mock GetCommand
      mockSend.mockResolvedValueOnce({
        Item: {
          activeTimeDelta: 300,
          timeSpentDelta: 300,
          totalQuestionsDelta: 10,
          correctQuestionsDelta: 9
        }
      });

      // Mock UpdateCommand
      mockSend.mockResolvedValueOnce({
        Attributes: {
          activeTimeDelta: 300, // 5 minutes of active time
          timeSpentDelta: 300,
          totalQuestionsDelta: 10,
          correctQuestionsDelta: 9 // 90% accuracy
        }
      });

      await activityMetricsService.flush(TEST_USER_ID, TEST_SESSION_ID, ActivityType.FLUENCY_PRACTICE);

      // Verify no bonus applied: 300 / 60 = 5 XP
      expect(mockSendMetrics).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        items: {
          xpEarned: 5, // No bonus for 90% accuracy
          totalQuestions: 10,
          correctQuestions: 9
        },
        eventTime: expect.any(String)
      });
    });

    test('handles zero questions correctly', async () => {
      // Mock GetCommand
      mockSend.mockResolvedValueOnce({
        Item: {
          activeTimeDelta: 60,
          timeSpentDelta: 60,
          totalQuestionsDelta: 0,
          correctQuestionsDelta: 0
        }
      });

      // Mock UpdateCommand
      mockSend.mockResolvedValueOnce({
        Attributes: {
          activeTimeDelta: 60, // 1 minute of active time
          timeSpentDelta: 60,
          totalQuestionsDelta: 0,
          correctQuestionsDelta: 0
        }
      });

      await activityMetricsService.flush(TEST_USER_ID, TEST_SESSION_ID, ActivityType.ASSESSMENT);

      // Verify XP calculation: 60 / 60 = 1 XP (no bonus when no questions)
      expect(mockSendMetrics).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        items: {
          xpEarned: 1, // No bonus when no questions answered
          totalQuestions: 0,
          correctQuestions: 0
        },
        eventTime: expect.any(String)
      });
    });

    test('handles empty flush (no deltas)', async () => {
      // Mock GetCommand to return no item
      mockSend.mockResolvedValueOnce({
        // No Item property - nothing to flush
      });

      await activityMetricsService.flush(TEST_USER_ID, TEST_SESSION_ID, ActivityType.LEARNING);

      // Verify no events sent
      expect(mockSendMetrics).not.toHaveBeenCalled();
      expect(mockSendActivityEvents).not.toHaveBeenCalled();
    });
  });

  describe('TimeSpent Events', () => {
    test('sends TimeSpentEvent alongside XP metrics', async () => {
      // Mock GetCommand
      mockSend.mockResolvedValueOnce({
        Item: {
          activeTimeDelta: 120,
          timeSpentDelta: 150,
          totalQuestionsDelta: 5,
          correctQuestionsDelta: 4
        }
      });

      // Mock UpdateCommand
      mockSend.mockResolvedValueOnce({
        Attributes: {
          activeTimeDelta: 120, // Active time
          timeSpentDelta: 150,  // Raw time is higher
          totalQuestionsDelta: 5,
          correctQuestionsDelta: 4
        }
      });

      await activityMetricsService.flush(TEST_USER_ID, TEST_SESSION_ID, ActivityType.LEARNING);

      // Verify metrics event sent
      expect(mockSendMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.objectContaining({
            xpEarned: 2 // 120/60 = 2 XP
          })
        })
      );

      // Verify time event sent
      expect(mockSendActivityEvents).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        activityType: ActivityType.LEARNING,
        timeSpent: 120, // Active time
        wasteTime: 30,  // Raw - active = 150 - 120 = 30
        eventTime: expect.any(String)
      });
    });
  });

  describe('Edge Cases', () => {
    test('perfect accuracy with single question gets bonus', async () => {
      // Mock GetCommand
      mockSend.mockResolvedValueOnce({
        Item: {
          activeTimeDelta: 30,
          timeSpentDelta: 30,
          totalQuestionsDelta: 1,
          correctQuestionsDelta: 1
        }
      });

      // Mock UpdateCommand
      mockSend.mockResolvedValueOnce({
        Attributes: {
          activeTimeDelta: 30, // 30 seconds
          timeSpentDelta: 30,
          totalQuestionsDelta: 1,
          correctQuestionsDelta: 1 // Perfect accuracy
        }
      });

      await activityMetricsService.flush(TEST_USER_ID, TEST_SESSION_ID, ActivityType.ACCURACY_PRACTICE);

      // Verify XP: (30 / 60) * 1.2 = 0.6 XP
      expect(mockSendMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.objectContaining({
            xpEarned: 0.6 // 0.5 XP * 1.2 bonus = 0.6 XP
          })
        })
      );
    });

    test('large amounts work correctly', async () => {
      // Mock GetCommand
      mockSend.mockResolvedValueOnce({
        Item: {
          activeTimeDelta: 3600, // 1 hour
          timeSpentDelta: 3600,
          totalQuestionsDelta: 100,
          correctQuestionsDelta: 100
        }
      });

      // Mock UpdateCommand
      mockSend.mockResolvedValueOnce({
        Attributes: {
          activeTimeDelta: 3600, // 1 hour
          timeSpentDelta: 3600,
          totalQuestionsDelta: 100,
          correctQuestionsDelta: 100 // Perfect accuracy
        }
      });

      await activityMetricsService.flush(TEST_USER_ID, TEST_SESSION_ID, ActivityType.FLUENCY_PRACTICE);

      // Verify XP: (3600 / 60) * 1.2 = 72 XP
      expect(mockSendMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.objectContaining({
            xpEarned: 72 // 60 XP * 1.2 bonus = 72 XP
          })
        })
      );
    });
  });
});