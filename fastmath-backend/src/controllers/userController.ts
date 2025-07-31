import { Request, Response } from 'express';
import { getUserProgressService, setUserProgressService } from '../services/userProgressService';
import { UserProgress, TrackStatus, FactStatus } from '../types/progress';
import { userTypingAnalytics, TypingInput } from '../services/userTypingAnalytics';
import { updateUserFocusTrack } from '../services/updateFocusTrackService';

export const getUserProgress = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const progressItems = await getUserProgressService(userId);
        
        if (!progressItems) {
            return res.status(404).json({ error: 'No progress found for user' });
        }
        
        res.json({
            userId,
            tracks: progressItems
        });
    } catch (error) {
        console.error('Error fetching user progress:', error);
        res.status(500).json({ error: 'Failed to fetch user progress' });
    }
};

export const setUserProgress = async (req: Request, res: Response) => {
    try {
        const { userId, trackId } = req.params;
        const progress = req.body as UserProgress;
        const userDate = req.userDate; // From timezoneMiddleware

        // Validate status if provided
        if (progress.status) {
            // Validate status enum
            const validTrackStatuses: TrackStatus[] = ['not_started', 'in_progress', 'completed'];
            if (!validTrackStatuses.includes(progress.status as TrackStatus)) {
                return res.status(400).json({ 
                    error: 'Invalid status value' 
                });
            }
        }

        // If facts exist, validate their required fields
        if (progress.facts) {
            for (const [factId, fact] of Object.entries(progress.facts)) {
                const validFactStatuses: FactStatus[] = [
                    'notStarted', 'learning', 'accuracyPractice', 'fluency6Practice', 
                    'fluency3Practice', 'fluency2Practice', 'fluency1_5Practice', 'fluency1Practice', 'mastered'
                ];
                if (fact.status && !validFactStatuses.includes(fact.status)) {
                    return res.status(400).json({ 
                        error: 'Invalid fact status value' 
                    });
                }
            }
        }

        // Update the specific track
        const updatedTrack = await setUserProgressService(userId, trackId, progress, userDate);
        
        // Fetch all tracks to maintain consistent response format
        const allTracks = await getUserProgressService(userId);
        
        res.json({
            userId,
            tracks: allTracks || [updatedTrack] // Fallback to just the updated track if no other tracks exist
        });
    } catch (error) {
        console.error('Error setting user progress:', error);
        res.status(500).json({ error: 'Failed to set user progress' });
    }
};

export const updateUserTypingSpeed = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { count, time } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        if (typeof count !== 'number' || count <= 0) {
            return res.status(400).json({ error: 'count must be a positive number' });
        }

        if (typeof time !== 'number' || time <= 0) {
            return res.status(400).json({ error: 'time must be a positive number' });
        }

        const input: TypingInput = { count, time };
        const updatedSpeed = await userTypingAnalytics.updateTypingSpeed(userId, input);
        res.json(updatedSpeed);
    } catch (error) {
        console.error('Error updating user typing speed:', error);
        res.status(500).json({ 
            error: 'Failed to update user typing speed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

export const updateFocusTrack = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const result = await updateUserFocusTrack(userId);
        
        if (!result.success) {
            return res.status(404).json({ error: result.message || 'Failed to update focusTrack' });
        }
        
        res.json({ 
            success: true, 
            userId,
            message: result.message
        });
    } catch (error) {
        console.error('Error updating focusTrack:', error);
        res.status(500).json({ 
            error: 'Failed to update focusTrack',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
