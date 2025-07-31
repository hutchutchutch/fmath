import { Request, Response } from 'express';
import sessionAnalyticsService from '../services/sessionAnalyticsService';
import { PageTransitionRequest, SessionAnalyticsQueryParams, PageType, FactsByStage } from '../types/sessionAnalytics';

/**
 * Controller for session analytics API endpoints
 */
class SessionAnalyticsController {
  /**
   * Record a page transition event
   */
  async recordPageTransition(req: Request, res: Response): Promise<void> {
    try {
      const eventData: PageTransitionRequest = req.body;
      
      // Validate required fields
      if (!eventData.userId || !eventData.trackId || !eventData.page) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: userId, trackId, and page are required'
        });
        return;
      }
      
      // Validate page type
      const validPageTypes: PageType[] = ['dashboard', 'learn', 'accuracy-practice', 'fluency-practice', 'assessment', 'onboarding', 'other'];
      if (!validPageTypes.includes(eventData.page)) {
        res.status(400).json({
          success: false,
          message: `Invalid page type. Must be one of: ${validPageTypes.join(', ')}`
        });
        return;
      }
      
      // Validate factsByStage if provided
      if (eventData.factsByStage) {
        // Validate that each stage contains an array of strings
        const stages = [
          'learning', 'accuracyPractice', 'fluency6Practice', 'fluency3Practice', 
          'fluency2Practice', 'fluency1_5Practice', 'fluency1Practice'
        ];
        
        for (const stage of stages) {
          const facts = eventData.factsByStage[stage as keyof FactsByStage];
          if (facts && (!Array.isArray(facts) || facts.some(fact => typeof fact !== 'string'))) {
            res.status(400).json({
              success: false,
              message: `Invalid factsByStage.${stage}: must be an array of strings`
            });
            return;
          }
        }
      }
      
      // Record the page transition
      const result = await sessionAnalyticsService.recordPageTransition(eventData);
      
      if (result.success) {
        res.status(200).json({
          success: true,
          sessionId: result.sessionId
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message || 'Failed to record page transition'
        });
      }
    } catch (error) {
      console.error('Error in recordPageTransition controller:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get session analytics for a user
   */
  async getSessionAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { userId, trackId, fromDate, toDate } = req.query;
      
      // Validate required fields
      if (!userId) {
        res.status(400).json({
          success: false,
          message: 'Missing required field: userId'
        });
        return;
      }
      
      // Build query parameters with default date range if not provided
      let queryFromDate = fromDate as string;
      let queryToDate = toDate as string;
      
      // Create today's date range on server if not provided by client
      if (!fromDate || !toDate) {
        const serverToday = new Date();
        serverToday.setHours(0, 0, 0, 0);
        queryFromDate = serverToday.toISOString();
        
        const serverEndOfDay = new Date();
        serverEndOfDay.setHours(23, 59, 59, 999);
        queryToDate = serverEndOfDay.toISOString();
      }
      
      const queryParams: SessionAnalyticsQueryParams = {
        userId: userId as string,
        fromDate: queryFromDate,
        toDate: queryToDate,
        ...(trackId && { trackId: trackId as string })
      };
      
      // Get session analytics
      const analytics = await sessionAnalyticsService.getSessionAnalytics(queryParams);
      
      if (analytics) {
        res.status(200).json({
          success: true,
          data: analytics
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to get session analytics'
        });
      }
    } catch (error) {
      console.error('Error in getSessionAnalytics controller:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get a user's most recent activity timestamp
   */
  async getLastActivity(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.query;
      
      // Validate required fields
      if (!userId) {
        res.status(400).json({
          success: false,
          message: 'Missing required field: userId'
        });
        return;
      }
      
      // Get the user's last activity
      const lastActivity = await sessionAnalyticsService.getLastActivity(userId as string);
      
      res.status(200).json({
        success: true,
        lastActivity
      });
    } catch (error) {
      console.error('Error in getLastActivity controller:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get all sessions for a user from the last 7 days
   */
  async getUserSessionsLastWeek(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.query;
      
      // Validate required fields
      if (!userId) {
        res.status(400).json({
          success: false,
          message: 'Missing required field: userId'
        });
        return;
      }
      
      // Get the user's sessions from the last 7 days
      const sessions = await sessionAnalyticsService.getUserSessionsLastWeek(userId as string);
      
      if (sessions === null) {
        res.status(500).json({
          success: false,
          message: 'Failed to get user sessions'
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        data: sessions
      });
    } catch (error) {
      console.error('Error in getUserSessionsLastWeek controller:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

export default new SessionAnalyticsController(); 