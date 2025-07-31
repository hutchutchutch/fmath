import { Request, Response } from 'express';
import { DownloadService } from '../services/downloadService';

/**
 * Controller for handling CSV downloads
 */

/**
 * Get all users as CSV
 * @param req Express request
 * @param res Express response
 */
export const getAllUsersCSV = async (req: Request, res: Response) => {
  try {
    // Get all users from the service
    const users = await DownloadService.getAllUsersForDownload();

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=all-users.csv');
    
    // Send the CSV data directly (let the client handle the CSV formatting)
    res.status(200).json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Error fetching all users for CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate users CSV',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}; 

/**
 * Get all sessions within a date range as CSV
 * @param req Express request with startDate and endDate query parameters
 * @param res Express response
 */
export const getSessionsInDateRangeCSV = async (req: Request, res: Response) => {
  try {
    // Get required date parameters
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Both startDate and endDate parameters are required'
      });
    }
    
    // Validate date format
    if (isNaN(Date.parse(startDate as string)) || isNaN(Date.parse(endDate as string))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Please use ISO format (YYYY-MM-DD)'
      });
    }
    
    // Get sessions from the service
    const sessions = await DownloadService.getSessionsForDownload(
      startDate as string,
      endDate as string
    );
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=sessions-${startDate}-to-${endDate}.csv`);
    
    // Send the JSON data for client-side CSV conversion
    res.status(200).json({
      success: true,
      sessions
    });
  } catch (error) {
    console.error('Error fetching sessions for CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate sessions CSV',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}; 

/**
 * Get all daily goals within a date range as CSV
 * @param req Express request with startDate and endDate query parameters
 * @param res Express response
 */
export const getDailyGoalsInDateRangeCSV = async (req: Request, res: Response) => {
  try {
    // Get required date parameters
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Both startDate and endDate parameters are required'
      });
    }
    
    // Validate date format
    if (isNaN(Date.parse(startDate as string)) || isNaN(Date.parse(endDate as string))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Please use ISO format (YYYY-MM-DD)'
      });
    }
    
    // Get daily goals from the service
    const goals = await DownloadService.getDailyGoalsForDownload(
      startDate as string,
      endDate as string
    );
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=daily-goals-${startDate}-to-${endDate}.csv`);
    
    // Send the JSON data for client-side CSV conversion
    res.status(200).json({
      success: true,
      goals
    });
  } catch (error) {
    console.error('Error fetching daily goals for CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate daily goals CSV',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}; 

/**
 * Get user progress data across all tracks as CSV
 * @param req Express request with optional userId query parameter
 * @param res Express response
 */
export const getUserProgressCSV = async (req: Request, res: Response) => {
  try {
    // Get optional userId parameter
    const { userId } = req.query;
    
    // Get user progress from the service
    const progressData = await DownloadService.getUserProgressForDownload(
      userId as string | undefined
    );
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=user-progress${userId ? `-${userId}` : ''}.csv`);
    
    // Send the JSON data for client-side CSV conversion
    res.status(200).json({
      success: true,
      progress: progressData
    });
  } catch (error) {
    console.error('Error fetching user progress for CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate user progress CSV',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get all progress assessments within a date range as CSV
 * @param req Express request with startDate and endDate query parameters
 * @param res Express response
 */
export const getProgressAssessmentsInDateRangeCSV = async (req: Request, res: Response) => {
  try {
    // Get required date parameters
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Both startDate and endDate parameters are required'
      });
    }
    
    // Validate date format
    if (isNaN(Date.parse(startDate as string)) || isNaN(Date.parse(endDate as string))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Please use ISO format (YYYY-MM-DD)'
      });
    }
    
    // Get progress assessments from the service
    const assessments = await DownloadService.getProgressAssessmentsForDownload(
      startDate as string,
      endDate as string
    );
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=progress-assessments-${startDate}-to-${endDate}.csv`);
    
    // Send the JSON data for client-side CSV conversion
    res.status(200).json({
      success: true,
      assessments
    });
  } catch (error) {
    console.error('Error fetching progress assessments for CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate progress assessments CSV',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}; 