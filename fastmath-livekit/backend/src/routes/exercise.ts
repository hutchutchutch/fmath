import { Router } from 'express';
import { generateSingleDigitAdditionProblems } from '../services/exerciseService';

export const exerciseRouter = Router();

// Generate a new session with single-digit addition problems
exerciseRouter.get('/session/new', (req, res) => {
  const sessionId = `session_${Date.now()}`;
  const problems = generateSingleDigitAdditionProblems(10);
  
  res.json({
    sessionId,
    problems,
    createdAt: new Date().toISOString()
  });
});

// Store session results
exerciseRouter.post('/session/:sessionId/result', (req, res) => {
  const { sessionId } = req.params;
  const { problemId, userAnswer, voiceMetrics } = req.body;
  
  // In a real app, store this in a database
  console.log('Session result:', {
    sessionId,
    problemId,
    userAnswer,
    voiceMetrics
  });
  
  res.json({ success: true });
});

// Get session results
exerciseRouter.get('/session/:sessionId/results', (req, res) => {
  const { sessionId } = req.params;
  
  // In a real app, fetch from database
  res.json({
    sessionId,
    results: [],
    message: 'Results would be fetched from database'
  });
});