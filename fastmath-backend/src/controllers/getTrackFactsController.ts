import { Request, Response } from 'express';
import { getTrackFacts } from '../services/getTrackFactsService';

export const getTrackFactsController = async (req: Request, res: Response): Promise<void> => {
    try {
        const { trackId } = req.params;
        
        if (!trackId) {
            res.status(400).json({ 
                error: 'Missing required parameter: trackId' 
            });
            return;
        }

        const facts = await getTrackFacts(trackId);
        res.json({ success: true, facts });
    } catch (error) {
        console.error('Error fetching track facts:', error);
        res.status(500).json({ 
            error: error instanceof Error ? error.message : 'Failed to fetch facts',
            details: `Attempted to fetch facts for trackId: ${req.params.trackId}`
        });
    }
}; 