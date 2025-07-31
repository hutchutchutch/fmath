import { Response, Request } from 'express';
import { getSession } from '../services/sessionManagementService';
import { GetSessionRequest, SessionActivity } from '../types/sessionManagement';

interface RequestWithUser extends Request {
  user?: {
    userId: string;
  };
}

/**
 * Controller to get the session activities for a user
 * @param req Express request
 * @param res Express response
 */
export const getSessionController = async (req: RequestWithUser, res: Response) => {
    try {
        // Get userId from URL parameters instead of auth
        const { userId, trackId } = req.params;
        const { activityType } = req.query;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        if (!trackId) {
            return res.status(400).json({ error: 'Track ID is required' });
        }
        
        const request: GetSessionRequest = {
            userId,
            trackId,
            activityType: activityType as SessionActivity | 'all'
        };
        
        const sessionData = await getSession(request);
        
        return res.status(200).json(sessionData);
    } catch (error) {
        console.error('Error getting session data:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}; 