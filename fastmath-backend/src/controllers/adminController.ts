import { Request, Response } from 'express';
import { searchUsers, getUserCQPM, getActiveStudents } from '../services/adminService';

/**
 * Search users by email
 */
export const searchUsersController = async (req: Request, res: Response) => {
    try {
        const { email } = req.query;

        if (!email || typeof email !== 'string') {
            return res.status(400).json({ message: 'Email query parameter is required' });
        }

        const result = await searchUsers(email);
        res.json(result);
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ 
            message: 'Failed to search users',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

/**
 * Get CQPM data for all users
 */
export const getUserCQPMController = async (req: Request, res: Response) => {
    try {
        const result = await getUserCQPM();
        res.json(result);
    } catch (error) {
        console.error('Get user CQPM error:', error);
        res.status(500).json({ 
            message: 'Failed to get user CQPM data',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};

/**
 * Get active students (those with activity in the last 7 days)
 */
export const getActiveStudentsController = async (req: Request, res: Response) => {
    try {
        // Get active students (those with activity in the last 7 days)
        const result = await getActiveStudents();
        res.json(result);
    } catch (error) {
        console.error('Get active students error:', error);
        res.status(500).json({ 
            message: 'Failed to get active students data',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}; 