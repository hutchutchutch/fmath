# FastMath System Analysis

## Table of Contents
1. [System Overview](#system-overview)
2. [User Story Flows](#user-story-flows)
3. [API Routes Documentation](#api-routes-documentation)
4. [Frontend-Backend Connections](#frontend-backend-connections)
5. [AWS Services Integration](#aws-services-integration)
6. [Data Models & Schema](#data-models--schema)
7. [Authentication Mechanisms](#authentication-mechanisms)
8. [Learning Progression System](#learning-progression-system)

## System Overview

FastMath is a comprehensive math facts learning platform designed for K-12 students. The system uses adaptive learning algorithms to help students master basic arithmetic facts through progressive fluency stages.

### Technology Stack
- **Frontend**: React 18 with TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Node.js with Express, TypeScript
- **Database**: AWS DynamoDB (single-table design)
- **Authentication**: JWT, AWS Cognito, Magic Links
- **Monitoring**: Sentry for error tracking and session replay
- **Infrastructure**: AWS services (DynamoDB, Cognito)

## User Story Flows

### 1. New Student Onboarding Flow
```
1. Student receives magic link from teacher/admin
2. Clicks link → Auto-authenticated with campus/grade/track
3. Completes onboarding assessment (grade-appropriate)
4. System determines starting point based on assessment
5. Redirected to dashboard with personalized learning path
```

### 2. Daily Practice Flow
```
1. Student logs in → Dashboard shows progress
2. Selects available activity (Learn/Practice/Assessment)
3. Learn Mode (New Facts):
   - Shows 3-4 new facts with visual aids
   - No timer, focus on understanding
   - Auto-advances to Practice mode

4. Practice Mode (Accuracy):
   - Practices facts until 2 correct answers
   - Visual feedback (green=correct, red=incorrect)
   - Shows correct answer on mistakes
   - No time pressure

5. Timed Practice (Fluency):
   - Timer per problem (3-6 seconds based on progress)
   - Green zone → Yellow zone → Timeout
   - Only green zone answers count for advancement
   - Auto-submits when answer length matches
```

### 3. Progress Assessment Flow
```
1. System prompts for assessment (every 30 days or milestone)
2. Student completes timed assessment
3. Results show:
   - Facts mastered
   - Average response time
   - Areas needing work
4. System adjusts learning path based on results
```

### 4. Teacher/Admin Flow
```
1. Admin logs in → Admin dashboard
2. Views student roster with progress metrics
3. Can:
   - Download progress reports (CSV)
   - View class-wide analytics
   - Reset student progress
   - Create new student accounts
   - View CQPM (Correct Questions Per Minute) metrics
```

## API Routes Documentation

### Authentication Routes (`/auth`)

| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| POST | `/auth/signup` | Create new account | `{email, password, name, grade, targetFluency}` | `{token, user}` |
| POST | `/auth/login` | Standard login | `{email, password}` | `{token, user}` |
| POST | `/auth/magic-link` | Campus-based auto-login | `{token}` | `{token, user}` |
| POST | `/auth/sso-login` | Cognito SSO login | `{idToken}` | `{token, user}` |
| POST | `/auth/validate` | Validate JWT token | `{token}` | `{valid, user}` |

### User Management Routes (`/users`)

| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| GET | `/users/:userId/progress` | Get user progress | - | `{tracks: {...}}` |
| POST | `/users/:userId/progress/:trackId` | Update progress | `{facts: {factId: status}}` | `{success}` |
| POST | `/users/:userId/typing-speed` | Update typing metrics | `{count, totalTime}` | `{success}` |
| PUT | `/users/:userId/focus-track` | Change focus track | `{trackId}` | `{success}` |

### Session Management Routes (`/session`)

| Method | Endpoint | Purpose | Query Params | Response |
|--------|----------|---------|--------------|----------|
| GET | `/session/:userId/:trackId` | Get available activities | `activityType` | `{availableActivities, progressAssessment}` |

### Progress Assessment Routes (`/progressAssessment`)

| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| POST | `/progressAssessment/create/:userId` | Create assessment | `{trackId}` | `{assessmentId}` |
| POST | `/progressAssessment/start/:userId/:trackId` | Start assessment | - | `{assessmentId, facts}` |
| POST | `/progressAssessment/:assessmentId/update/:trackId/:userId` | Update progress | `{factId, response, responseTime}` | `{success}` |
| POST | `/progressAssessment/:assessmentId/complete/:userId` | Complete assessment | `{results}` | `{summary}` |
| GET | `/progressAssessment/:userId/assessments` | Get user assessments | - | `{assessments: [...]}` |

### Analytics Routes (`/sessionAnalytics`)

| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| POST | `/sessionAnalytics/pageTransition` | Track page views | `{userId, page, factsByStage}` | `{success}` |
| GET | `/sessionAnalytics/lastActivity` | Get last activity | `userId` | `{timestamp, activity}` |

### Admin Routes (`/admin`)

| Method | Endpoint | Purpose | Query Params | Response |
|--------|----------|---------|--------------|----------|
| GET | `/admin/users/search` | Search users | `email, grade, campus` | `{users: [...]}` |
| GET | `/admin/users/cqpm` | Get CQPM metrics | `startDate, endDate` | `{metrics}` |
| GET | `/admin/downloads/users` | Download user CSV | - | CSV file |
| POST | `/admin/user-rostering/create` | Batch create users | `{users: [...]}` | `{created, errors}` |

## Frontend-Backend Connections

### 1. API Client Configuration
```typescript
// Frontend: src/config/api.ts
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

// Axios interceptors handle:
- Token attachment to requests
- Automatic token refresh on 401
- Error logging to Sentry
- Slow request monitoring (>3s)
```

### 2. Context → API Flow
```
AuthContext → api.login() → POST /auth/login → JWT storage
SessionContext → api.recordPageTransition() → POST /sessionAnalytics/pageTransition
UserProgress → api.setUserProgress() → POST /users/:userId/progress/:trackId
```

### 3. Component → Service Mapping

| Frontend Component | API Calls | Purpose |
|-------------------|-----------|---------|
| LoginPage | `/auth/login`, `/auth/validate` | User authentication |
| Dashboard | `/users/:userId/progress`, `/session/:userId/:trackId` | Show progress & activities |
| PracticePage | `/session/:userId/:trackId`, `/users/:userId/progress/:trackId` | Practice sessions |
| ProgressAssessment | `/progressAssessment/*` endpoints | Formal assessments |
| AdminDashboard | `/admin/*` endpoints | Administrative functions |

## AWS Services Integration

### 1. DynamoDB Configuration
```typescript
// Table: FastMath2
// Partition Key (PK) | Sort Key (SK) patterns:
USER#userId         | PROFILE
USER#userId         | PROGRESS#trackId  
FACT#factId         | METADATA
TRACK#trackId       | METADATA
CAMPUS#campusName   | CONFIG

// Global Secondary Index:
GSI1: email (for user lookups)
```

### 2. Cognito Integration
```typescript
// SSO Configuration
- User Pool: FastMath-Users
- Identity Provider: SAML/OIDC
- JWT Verification: aws-jwt-verify library
- Token Expiration: 24 hours
```

### 3. AWS SDK Usage
```typescript
// DynamoDB operations
- DocumentClient for simplified operations
- Batch operations for efficiency
- Conditional updates for race conditions
- Query with filters for complex retrievals
```

## Data Models & Schema

### User Profile Schema
```typescript
interface UserProfile {
  PK: `USER#${string}`;
  SK: 'PROFILE';
  userId: string;
  email: string;
  name: string;
  grade?: number;
  targetFluency?: '2s' | '1.5s' | '1s';
  campus?: string;
  createdAt: string;
  lastLogin?: string;
}
```

### Progress Tracking Schema
```typescript
interface UserProgress {
  PK: `USER#${string}`;
  SK: `PROGRESS#${string}`;
  trackId: string;
  facts: {
    [factId: string]: {
      status: FactStatus;
      attempts: number;
      correct: number;
      averageResponseTime?: number;
      lastAttemptDate?: string;
      accuracyStreak?: number;
      retentionDay?: number;
      nextRetentionDate?: string;
    }
  };
  lastUpdated: string;
}
```

### Fact Status Progression
```typescript
type FactStatus = 
  | 'notStarted'
  | 'learning'
  | 'accuracyPractice' 
  | 'fluency6Practice'    // 6 second target
  | 'fluency3Practice'    // 3 second target
  | 'fluency2Practice'    // 2 second target
  | 'fluency1_5Practice'  // 1.5 second target
  | 'fluency1Practice'    // 1 second target
  | 'mastered'
  | 'automatic';
```

## Authentication Mechanisms

### 1. Email/Password Authentication
- BCrypt hashing (10 rounds)
- JWT tokens with 24-hour expiration
- Refresh token mechanism
- Session storage for persistence

### 2. Magic Link Authentication
- Pre-generated links for campus users
- Automatic grade/track assignment
- No password required
- JWT-based validation

### 3. SSO (Cognito) Authentication
- SAML/OIDC support
- Institutional login
- Automatic user provisioning
- Role-based access control

### 4. LTI (Learning Tools Interoperability)
- Canvas/Blackboard integration
- Grade passback support
- Deep linking
- Outcome reporting

## Learning Progression System

### 1. Adaptive Fluency Targets
```typescript
// Grade-based targets
K-3: 2 seconds per fact
4-12: 1.5 seconds per fact

// Adjusted based on:
- Individual typing speed
- Device type (touchpad vs keyboard)
- Historical performance
```

### 2. Retention System
```typescript
// Spaced repetition intervals
Day 1: Initial mastery
Day 2: First retention check
Day 4: Second retention check  
Day 7: Third retention check
Day 16: Fourth retention check
Day 35: Fifth retention check
Day 75: Final retention check

// Failure resets to beginning
```

### 3. Session Management Logic
```typescript
// Activity selection algorithm
1. Check for pending assessments
2. Serve learning facts (3-4 new)
3. Serve accuracy practice (min 10)
4. Serve fluency practice by level
5. Include retention checks

// Fact selection prioritizes:
- Oldest attempted first
- Failed retention checks
- Mixed with mastered facts
```

### 4. Progress Metrics
```typescript
// Key metrics tracked:
- CQPM (Correct Questions Per Minute)
- Average response time by fact
- Accuracy percentage
- Time to mastery
- Retention success rate
- Session engagement time
```

## System Architecture Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React SPA     │────▶│  Express API    │────▶│   DynamoDB      │
│                 │     │                 │     │                 │
│ - Router        │     │ - Auth Routes   │     │ - User Data     │
│ - Contexts      │     │ - User Routes   │     │ - Progress      │
│ - Components    │     │ - Admin Routes  │     │ - Facts         │
│ - API Client    │     │ - Analytics     │     │ - Tracks        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                        │
         │                       │                        │
         ▼                       ▼                        │
┌─────────────────┐     ┌─────────────────┐              │
│     Sentry      │     │  AWS Cognito    │              │
│                 │     │                 │              │
│ - Error Track   │     │ - SSO Auth      │              │
│ - Session Rec   │     │ - JWT Verify    │              │
│ - Performance   │     │ - User Pool     │              │
└─────────────────┘     └─────────────────┘              │
                                 │                        │
                                 └────────────────────────┘
```

## Key Insights

1. **Single Table Design**: Efficient DynamoDB usage with composite keys
2. **Progressive Learning**: Systematic advancement through fluency levels
3. **Multi-Authentication**: Supports various institutional needs
4. **Adaptive Algorithms**: Personalized learning based on performance
5. **Comprehensive Analytics**: Detailed tracking for educators
6. **Scalable Architecture**: Serverless-ready with AWS services

This analysis provides a complete overview of the FastMath system architecture, demonstrating a sophisticated educational platform with enterprise-grade features and thoughtful pedagogical design.