// Global test setup
import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment variables before any imports
process.env.ENABLE_SPEEDRUN_INTEGRATION = 'true';
process.env.SPEEDRUN_SHARED_SECRET = 'test-shared-secret';
process.env.SPEEDRUN_SSO_SECRET = 'test-sso-secret';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

// Global Jest timeout
jest.setTimeout(10000);

// Mock AWS SDK only (removing JWT mock)
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: jest.fn().mockResolvedValue({}),
    })),
  },
  GetCommand: jest.fn(),
  UpdateCommand: jest.fn(),
  QueryCommand: jest.fn(),
})); 