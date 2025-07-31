import { Request, Response } from 'express';
import { updateUserGradesBatch, updateUserTracksBatch } from '../services/userUpdateService';

/**
 * Update multiple users' grades
 */
export const updateUserGradesBatchController = async (req: Request, res: Response) => {
    try {
        const { updates } = req.body;

        if (!updates || !Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({ message: 'Updates array is required in request body' });
        }

        // Validate each update object
        for (const update of updates) {
            if (!update.email || typeof update.email !== 'string') {
                return res.status(400).json({ message: 'Email is required for each update' });
            }
            if (update.grade === undefined || typeof update.grade !== 'number' || update.grade < 0) {
                return res.status(400).json({ message: 'Valid grade is required for each update' });
            }
        }

        const result = await updateUserGradesBatch(updates);
        res.json(result);
    } catch (error) {
        console.error('Batch update user grades error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Failed to update user grades in batch',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

/**
 * Update multiple users' tracks
 */
export const updateUserTracksBatchController = async (req: Request, res: Response) => {
    try {
        const { updates } = req.body;

        if (!updates || !Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({ message: 'Updates array is required in request body' });
        }

        // Validate each update object
        for (const update of updates) {
            if (!update.email || typeof update.email !== 'string') {
                return res.status(400).json({ message: 'Email is required for each update' });
            }
            if (!update.track || typeof update.track !== 'string' || update.track.trim() === '') {
                return res.status(400).json({ message: 'Valid track is required for each update' });
            }
        }

        const result = await updateUserTracksBatch(updates);
        res.json(result);
    } catch (error) {
        console.error('Batch update user tracks error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Failed to update user tracks in batch',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}; 