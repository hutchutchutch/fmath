export type GoalType = 'learning' | 'accuracy' | 'fluency' | 'assessment';

export interface GoalProgress {
  total: number;      // Total number of facts required for this goal
  completed: number;  // Number of facts completed so far
}

export interface DailyGoals {
  PK: string;         // USER#{userId}
  SK: string;         // GOALS#{trackId}#{date}  (YYYY-MM-DD format)
  date: string;       // ISO date string for the day
  trackId: string;    // The track ID these goals are for
  userId: string;     // User ID
  goals: Record<GoalType, GoalProgress>;
  completedFacts: Record<GoalType, string[]>;
  allCompleted: boolean;  // Whether all goals were completed for the day
  createdAt: string;      // ISO timestamp when these goals were created
  updatedAt: string;      // ISO timestamp when these goals were last updated
}

// Response type for frontend
export interface DailyGoalsResponse {
  date: string;
  trackId: string;
  goals: {
    [goalType in GoalType]?: GoalProgress;
  };
  allCompleted: boolean;
} 