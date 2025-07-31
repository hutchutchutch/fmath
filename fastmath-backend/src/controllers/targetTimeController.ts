import { Request, Response } from 'express';
import { getTargetTimeService } from '../services/targetTimeService';

export const getTargetTime = async (req: Request, res: Response) => {
    try {
        const userId = req.params.userId;
        const trackId = req.params.trackId;
        
        if (!userId || !trackId) {
            return res.status(400).json({ error: 'Missing user ID or track ID' });
        }

        const targetTimeResponse = await getTargetTimeService(userId, trackId);
        res.json(targetTimeResponse);
    } catch (error) {
        console.error('Error in target time controller:', error);
        res.status(500).json({ error: 'Failed to get target time' });
    }
}; 