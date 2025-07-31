import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import authMockRoutes from './routes/authMock';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
  origin: [
    'https://app.fastmath.pro',
    'http://localhost:3001',
    'http://localhost:3003'
  ],
  credentials: true
}));
app.use(express.json());

console.log('🚀 Running in MOCK MODE - No AWS/DynamoDB required');

// Use mock auth routes
app.use('/auth', authMockRoutes);

// Mock routes that return minimal data for testing
app.use('/users/:userId/progress', (req, res) => {
  res.json({
    userId: req.params.userId,
    tracks: [{
      trackId: 'TRACK1',
      status: 'in_progress',
      facts: {}
    }]
  });
});

app.post('/users/:userId/progress/:trackId', (req, res) => {
  console.log('Mock progress update:', req.body);
  res.json({ success: true });
});

app.post('/users/:userId/typing-speed', (req, res) => {
  console.log('Mock typing speed update:', req.body);
  res.json({ average: 1000, totalCount: 1, weightedTime: 1000 });
});

app.get('/targetTime/:userId/:trackId', (req, res) => {
  res.json({ timePerDigit: 1000, targetTime: 2000 });
});

app.get('/trackFacts/track/:trackId', (req, res) => {
  // Return some mock facts for testing
  res.json({
    facts: [
      { PK: 'FACT#1', SK: 'METADATA', factId: '1', operation: 'addition', operand1: 2, operand2: 3, result: 5 },
      { PK: 'FACT#2', SK: 'METADATA', factId: '2', operation: 'addition', operand1: 4, operand2: 5, result: 9 },
      { PK: 'FACT#3', SK: 'METADATA', factId: '3', operation: 'multiplication', operand1: 3, operand2: 4, result: 12 },
      { PK: 'FACT#4', SK: 'METADATA', factId: '4', operation: 'subtraction', operand1: 10, operand2: 7, result: 3 },
      { PK: 'FACT#5', SK: 'METADATA', factId: '5', operation: 'multiplication', operand1: 6, operand2: 7, result: 42 }
    ]
  });
});

app.get('/session/:userId/:trackId', (req, res) => {
  res.json({
    availableActivities: {
      learn: {
        facts: [
          { PK: 'FACT#1', SK: 'METADATA', factId: '1', operation: 'addition', operand1: 2, operand2: 3, result: 5 }
        ]
      },
      accuracyPractice: {
        facts: [
          { PK: 'FACT#2', SK: 'METADATA', factId: '2', operation: 'addition', operand1: 4, operand2: 5, result: 9 }
        ]
      },
      fluencyPractice: {
        groupedFacts: {
          'fluency6Practice': [
            { PK: 'FACT#3', SK: 'METADATA', factId: '3', operation: 'multiplication', operand1: 3, operand2: 4, result: 12 }
          ]
        }
      }
    },
    suggestedActivity: 'learn'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: 'mock' });
});

// Catch-all for unimplemented routes
app.use('*', (req, res) => {
  console.log(`Mock: Unhandled route ${req.method} ${req.originalUrl}`);
  res.json({ mock: true, message: 'This endpoint is mocked' });
});

app.listen(port, () => {
  console.log(`Mock server running at http://localhost:${port}`);
  console.log('Test credentials:');
  console.log('  Email: hutch.herchenbach@gauntletai.com');
  console.log('  Password: password123');
});

export default app;