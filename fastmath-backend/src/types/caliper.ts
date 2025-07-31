export interface CaliperActor {
    id: string;
    type: 'Person';
  }
  
  export interface CaliperObject {
    id: string;
    type: string;
    name?: string;
    description?: string;
  }
  
  export enum CaliperAction {
    // Session-related actions
    LOGGED_IN = 'LoggedIn',
    LOGGED_OUT = 'LoggedOut',
    SESSION_TIMEOUT = 'SessionTimeout',
  
    // Activity-related actions
    STARTED = 'Started',
    ENDED = 'Ended',
    SUBMITTED = 'Submitted',
    VIEWED = 'Viewed'
  }
  
  export enum CaliperEventProfile {
    SESSION_PROFILE = 'SessionProfile',
    ACTIVITY_PROFILE = 'ActivityProfile'
  }
  
  export interface CaliperEvent {
    '@context': string;
    type: string;
    profile: CaliperEventProfile;
    actor: CaliperActor;
    action: CaliperAction;
    object: CaliperObject;
    eventTime: string;
    edApp: {
      id: string;
      type: 'SoftwareApplication';
    };
    session?: {
      id: string;
      type: 'Session';
    };
    generated?: {
      id: string;
      type: 'Attempt';
      count?: number;
      startedAtTime?: string;
      endedAtTime?: string;
    };
    extensions?: Record<string, any>;
  } 