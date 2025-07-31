import { Request, Response } from 'express';
import { getCqpmDashboardData } from '../services/cqpmService';
import { CqpmDashboardRequest } from '../types/cqpm';

/**
 * Get CQPM dashboard data for admin users
 */
export const getCqpmDashboardController = async (req: Request, res: Response) => {
  try {
    const { days } = req.query as unknown as CqpmDashboardRequest;
    
    // Validate days parameter
    let daysParam = 30; // default
    if (days) {
      const parsedDays = parseInt(String(days), 10);
      if ([30, 60, 90].includes(parsedDays)) {
        daysParam = parsedDays;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Days parameter must be 30, 60, or 90'
        });
      }
    }

    console.log(`CQPM dashboard request for ${daysParam} days`);

    // Get dashboard data
    const dashboardData = await getCqpmDashboardData(daysParam);

    res.status(200).json({
      success: true,
      data: dashboardData
    });

  } catch (error: any) {
    console.error('Error in CQPM dashboard controller:', error);
    
    // Determine appropriate status code
    let statusCode = 500;
    let message = 'Internal server error';

    if (error.isAxiosError) {
      // OneRoster API error
      statusCode = 502; // Bad Gateway
      message = 'Failed to fetch assessment data from OneRoster API';
    } else if (error.message.includes('token')) {
      // Authentication error
      statusCode = 401;
      message = 'Authentication failed with OneRoster API';
    }

    res.status(statusCode).json({
      success: false,
      message,
      error: error.message
    });
  }
};

/**
 * Get individual user CQPM details
 */
export const getUserCqpmDetailsController = async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const { days } = req.query as unknown as CqpmDashboardRequest;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'User email is required'
      });
    }

    // Validate days parameter
    let daysParam = 30; // default
    if (days) {
      const parsedDays = parseInt(String(days), 10);
      if ([30, 60, 90].includes(parsedDays)) {
        daysParam = parsedDays;
      }
    }

    console.log(`User CQPM details request for ${email}, ${daysParam} days`);

    // Get full dashboard data and filter for specific user
    const dashboardData = await getCqpmDashboardData(daysParam);
    
    const userResults = dashboardData.assessmentResults.filter(
      result => result.userEmail === email
    );

    const userRanking = dashboardData.userRankings.find(
      ranking => ranking.userEmail === email
    );

    if (userResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No assessment data found for this user'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        userEmail: email,
        assessmentResults: userResults,
        ranking: userRanking,
        dateRange: dashboardData.dateRange
      }
    });

  } catch (error: any) {
    console.error('Error in user CQPM details controller:', error);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};