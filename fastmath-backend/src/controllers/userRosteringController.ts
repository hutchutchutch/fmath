import { Request, Response } from 'express';
import { processUsers, UserCreationRequest, getUserByEmail } from '../services/userRosteringService';
import { deleteUserTrackProgress } from '../services/userProgressService';

/**
 * Handler function for creating users
 */
export const createUsersController = async (req: Request, res: Response) => {
  try {
    const userRequest = req.body as UserCreationRequest;
    
    // Validate request
    if (!userRequest.users || !Array.isArray(userRequest.users) || userRequest.users.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid request. Please provide an array of users to create.'
      });
      return;
    }
    
    // Validate each user has required fields
    for (const user of userRequest.users) {
      if (!user.email) {
        res.status(400).json({
          success: false,
          message: 'Each user must have an email field.'
        });
        return;
      }
    }
    
    // Process users
    const result = await processUsers(userRequest.users);
    
    // Return results
    res.status(result.success ? 200 : 207).json(result);
    
  } catch (error) {
    console.error('Error in user creation endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

export const resetUserProgress = async (req: Request, res: Response) => {
  const { email, trackId } = req.body;

  if (!email || !trackId) {
    return res.status(400).json({ success: false, message: 'Email and Track ID are required.' });
  }

  try {
    // First, find the user by email to get their userId
    const user = await getUserByEmail(email);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const { userId } = user;

    // Now, delete the user's progress for the specified track
    const result = await deleteUserTrackProgress(userId, trackId);

    if (result.success) {
      return res.status(200).json(result);
    } else {
      // Assuming a service failure should be a 500
      return res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error resetting user progress:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    return res.status(500).json({ success: false, message });
  }
}; 