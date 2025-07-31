import React, { useState, useEffect } from 'react';

// Hardcoded typography object
const typography = {
  fontFamily: {
    primary: ['Archivo', 'sans-serif'],
  },

  fontSize: {
    'heading-1': '54px',
    'heading-2': '40px',
    'heading-3': '32px',
    'heading-4': '28px',
    'heading-5': '24px',
    'heading-6': '20px',
    'heading-7': '18px',
    'large-text': '20px',
    'medium-text': '16px',
    'small-text': '14px',
    'extra-small-text': '12px',
    'button-small': '14px',
    'countdown-number': '150px',
  },

  lineHeight: {
    'heading-1': '58px',
    'heading-2': '44px',
    'heading-3': '35px',
    'heading-4': '32px',
    'heading-5': '28px',
    'heading-6': '24px',
    'heading-7': '24px',
    'large-text': '24px',
    'medium-text': '18px',
    'small-text': '16px',
    'extra-small-text': '14px',
    'button-small': '16px',
    'countdown-number': '150px',
  },

  fontWeight: {
    medium: '500',
    semibold: '600',
    bold: '700'
  },

  letterSpacing: {
    normal: '0px',
  },

  // Complete typography styles with all properties except color
  styles: {
    'heading-1': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '600',
      fontSize: '54px',
      lineHeight: '58px',
      letterSpacing: '0px',
    },
    'heading-2': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '600',
      fontSize: '40px',
      lineHeight: '44px',
      letterSpacing: '0px',
    },
    'heading-3': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '600',
      fontSize: '32px',
      lineHeight: '35px',
      letterSpacing: '0px',
    },
    'heading-4': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '600',
      fontSize: '28px',
      lineHeight: '32px',
      letterSpacing: '0px',
    },
    'heading-5': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '600',
      fontSize: '24px',
      lineHeight: '28px',
      letterSpacing: '0px',
    },
    'heading-6': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '600',
      fontSize: '20px',
      lineHeight: '24px',
      letterSpacing: '0px',
    },
    'heading-7': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '600',
      fontSize: '18px',
      lineHeight: '24px',
      letterSpacing: '0px',
    },
    'large-text': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '500',
      fontSize: '20px',
      lineHeight: '24px',
      letterSpacing: '0px',
    },
    'medium-text': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '500',
      fontSize: '16px',
      lineHeight: '18px',
      letterSpacing: '0px',
    },
    'small-text': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '500',
      fontSize: '14px',
      lineHeight: '16px',
      letterSpacing: '0px',
    },
    'extra-small-text': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '500',
      fontSize: '12px',
      lineHeight: '14px',
      letterSpacing: '0px',
    },
    'button-small': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '700',
      fontSize: '14px',
      lineHeight: '16px',
      letterSpacing: '0px',
    },
    'button-medium': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '700',
      fontSize: '16px',
      lineHeight: '18px',
      letterSpacing: '0px',
    },
    'extra-small-button': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '700',
      fontSize: '12px',
      lineHeight: '14px',
      letterSpacing: '0px',
    },
    'button-large': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '700',
      fontSize: '20px',
      lineHeight: '24px',
      letterSpacing: '0px',
    },
    'countdown-number': {
      fontFamily: 'Archivo, sans-serif',
      fontWeight: '600',
      fontSize: '150px',
      lineHeight: '150px',
      letterSpacing: '0px',
    },
  },
};

// Hardcoded colors object
const colors = {
  // Primary colors (Purple)
  primary: {
    100: '#E8E5FB',
    200: '#D0CAFC',
    300: '#BBB1FC',
    400: '#7A68E3',
    500: '#6150BF',
    600: '#4C3EA0',
  },

  // Neutral colors (Grays)
  neutral: {
    50: '#FFFFFF',
    100: '#FAFAFA',
    200: '#F5F5F5',
    300: '#EBEBEB',
    400: '#E5E5E5',
    500: '#D9D9D9',
    600: '#B2B2B2',
    700: '#8C8C8C',
    800: '#595959',
    900: '#333333',
    1000: '#1A1A1A',
  },

  // Blue colors
  blue: {
    100: '#ECF6FC',
    200: '#CCEBFF',
    300: '#A6DBFF',
    400: '#58BCFF',
    500: '#3698D9',
    600: '#2171A6',
  },

  // Orange colors
  orange: {
    100: '#FFE8D9',
    200: '#FFC8A6',
    300: '#FF9C5D',
    400: '#F07425',
    500: '#BF5C1D',
    600: '#8C3B07',
  },

  // Green colors
  green: {
    100: '#D4FAE0',
    200: '#BBFACE',
    300: '#9DF2B7',
    400: '#6EE592',
    500: '#43BF69',
    600: '#1C7337',
  },

  // Yellow colors
  yellow: {
    100: '#FFF2D9',
    200: '#FFE9BF',
    300: '#FFCE73',
    400: '#FFC354',
    500: '#BF9643',
    600: '#735011',
  },

  // Bronze colors
  bronze: {
    300: '#D5854F',
    200: '#FBB484',
    100: '#FFD8BD',
  },

  // Silver colors
  silver: {
    300: '#6C7D91',
    200: '#C9D4E5',
    100: '#D5E1F3',
  },

  // Gold colors
  gold: {
    300: '#C87F0A',
    200: '#FEC86C',
    100: '#FFE5B9',
  },

  // Platinum colors
  platinum: {
    300: '#0C9B9C',
    200: '#50DDDD',
    100: '#A5FFFF',
  },

  // Diamond colors
  diamond: {
    300: '#0065B5',
    200: '#3BA7FF',
    100: '#B0DBFF',
  },
};

/**
 * GradeTracks Component Usage:
 * 
 * This component displays a grade with its associated tracks and their statuses.
 * 
 * @example
 * // Grade 2 with first track in progress, second track locked
 * <ExpandableMenuItem 
 *   grade={2} 
 *   trackStatuses={{
 *     'TRACK9': 'inProgress',
 *     'TRACK10': 'locked'
 *   }} 
 * />
 * 
 * @example
 * // Grade 3 with all tracks completed
 * <ExpandableMenuItem 
 *   grade={3} 
 *   trackStatuses={{
 *     'TRACK6': 'completed',
 *     'TRACK8': 'completed', 
 *     'TRACK11': 'completed'
 *   }} 
 * />
 */

// Static mapping of grades to their track IDs
const GRADE_TO_TRACKS: Record<number, string[]> = {
  1: ['TRACK12'],
  2: ['TRACK9', 'TRACK10'],
  3: ['TRACK6', 'TRACK8', 'TRACK11'],
  4: ['TRACK7', 'TRACK5']
};

// Track ID to display name mapping
const TRACK_NAMES: Record<string, string> = {
  'TRACK5': 'Division Facts (Up to 12)',
  'TRACK6': 'Addition Facts (Sums up to 20)',
  'TRACK7': 'Multiplication Facts (Factors up to 12)',
  'TRACK8': 'Subtraction Facts (Up to 20)',
  'TRACK9': 'Addition (Single-Digit)',
  'TRACK10': 'Subtraction (Single-Digit)',
  'TRACK11': 'Multiplication (Single-digit)',
  'TRACK12': 'Addition Within 10 (Sums up to 10)'
};

// Track ID to operation icon mapping
const TRACK_ICONS: Record<string, string> = {
  'TRACK5': '/assets/division.png',
  'TRACK6': '/assets/addition.png',
  'TRACK7': '/assets/multiplication.png',
  'TRACK8': '/assets/subtraction.png',
  'TRACK9': '/assets/addition.png',
  'TRACK10': '/assets/subtraction.png',
  'TRACK11': '/assets/multiplication.png',
  'TRACK12': '/assets/addition.png'
};

type TrackStatus = 'locked' | 'inProgress' | 'completed';
type GradeStatus = 'inProgress' | 'locked' | 'completed';

interface TrackStatuses {
  [trackId: string]: TrackStatus;
}

interface TagProps {
  state: GradeStatus;
}

function Tag({ state }: TagProps) {
  const getTagStyles = () => {
    switch (state) {
      case 'inProgress':
        return {
          backgroundColor: colors.primary[100],
          color: colors.primary[400]
        };
      case 'locked':
        return {
          backgroundColor: colors.neutral[200],
          color: colors.neutral[700]
        };
      case 'completed':
        return {
          backgroundColor: colors.green[200],
          color: colors.green[500]
        };
      default:
        return {
          backgroundColor: colors.primary[100],
          color: colors.primary[400]
        };
    }
  };

  const getTagText = () => {
    switch (state) {
      case 'inProgress':
        return 'In Progress';
      case 'locked':
        return 'Locked';
      case 'completed':
        return 'Completed';
      default:
        return 'In Progress';
    }
  };

  const tagStyles = getTagStyles();

  return (
    <div
      className="box-border content-stretch flex flex-col gap-2.5 items-center justify-center p-[8px] relative rounded-xl shrink-0"
      data-name="Tag"
      style={{ backgroundColor: tagStyles.backgroundColor }}
    >
      <div
        className="font-bold leading-[0] overflow-ellipsis overflow-hidden relative shrink-0 text-center text-nowrap"
        style={{ 
          fontFamily: typography.fontFamily.primary.join(', '),
          fontWeight: typography.fontWeight.bold,
          fontSize: typography.fontSize['button-small'],
          lineHeight: typography.lineHeight['button-small'],
          color: tagStyles.color
        }}
      >
        <p className="[text-overflow:inherit] block overflow-inherit whitespace-pre">
          {getTagText()}
        </p>
      </div>
    </div>
  );
}

function ChevronIcon() {
  return (
    <div className="relative size-6" data-name="Chevron Icon">
      <svg
        className="block size-full"
        fill="none"
        preserveAspectRatio="none"
        viewBox="0 0 24 24"
      >
        <g id="Chevron Icon">
          <path
            clipRule="evenodd"
            d="M9.47 7.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 1 1-1.06-1.06L13.19 12 9.47 8.28a.75.75 0 0 1 0-1.06Z"
            fill={colors.neutral[800]}
            fillRule="evenodd"
            id="Vector 4 (Stroke)"
          />
        </g>
      </svg>
    </div>
  );
}

interface ChevronProps {
  isExpanded: boolean;
  onClick: () => void;
}

function Chevron({ isExpanded, onClick }: ChevronProps) {
  return (
    <div
      className="box-border content-stretch flex flex-row gap-2.5 items-center justify-start p-[4px] relative rounded-xl shrink-0 cursor-pointer hover:bg-gray-100 transition-colors"
      data-name="Chevron"
      onClick={onClick}
    >
      <div className="flex h-[24.091px] items-center justify-center relative shrink-0 w-[24.091px]">
        <div 
          className={`flex-none transition-transform duration-200 ${isExpanded ? 'rotate-90' : 'rotate-0'}`}
        >
          <ChevronIcon />
        </div>
      </div>
    </div>
  );
}

interface SubjectItemProps {
  isExpanded: boolean;
  onToggle: () => void;
  grade: number;
  gradeStatus: GradeStatus;
}

function SubjectItem({ isExpanded, onToggle, grade, gradeStatus }: SubjectItemProps) {
  return (
    <div
      className="relative rounded-2xl shrink-0 w-full"
      data-name="Subject Item"
    >
      <div className="flex flex-row items-center relative size-full">
        <div className="box-border content-stretch flex flex-row gap-2 items-center justify-start p-[12px] relative w-full">
          <div
            className="basis-0 font-semibold grow leading-[0] min-h-px min-w-px overflow-ellipsis overflow-hidden relative shrink-0 text-left text-nowrap"
            style={{ 
              fontFamily: typography.fontFamily.primary.join(', '),
              fontWeight: typography.fontWeight.semibold,
              fontSize: typography.fontSize['heading-6'],
              lineHeight: typography.lineHeight['heading-6'],
              color: colors.neutral[800]
            }}
          >
            <p className="[text-overflow:inherit] [text-wrap-mode:inherit]\' [white-space-collapse:inherit] block overflow-inherit">
              Grade {grade}
            </p>
          </div>
          <Tag state={gradeStatus} />
          <Chevron isExpanded={isExpanded} onClick={onToggle} />
        </div>
      </div>
    </div>
  );
}




interface OperationItemProps {
  trackId: string;
  trackStatus: TrackStatus;
  gradeStatus: GradeStatus;
}

function OperationsItem({ trackId, trackStatus, gradeStatus }: OperationItemProps) {
  const getBackgroundColor = () => {
    if (gradeStatus === 'locked' || trackStatus === 'locked') return 'transparent';
    if (gradeStatus === 'completed' || trackStatus === 'completed') return colors.neutral[100];
    if (trackStatus === 'inProgress') return colors.primary[200];
    return 'transparent';
  };

  const getTextColor = () => {
    if (gradeStatus === 'locked' || trackStatus === 'locked') return colors.neutral[600];
    if (gradeStatus === 'completed' || trackStatus === 'completed') return colors.neutral[600];
    if (trackStatus === 'inProgress') return colors.primary[400];
    return colors.neutral[600];
  };

  const getOperationIconState = (): 'inProgress' | 'locked' => {
    if (trackStatus === 'inProgress') return 'inProgress';
    return 'locked';
  };

  const getIconAndProgress = () => {
    if (trackStatus === 'inProgress') {
      return <InProgressIcon />;
    }
    if (trackStatus === 'completed') {
      return <CompletedIcon />;
    }
    return <LockedIcon />;
  };

  const trackName = TRACK_NAMES[trackId] || trackId;

  return (
    <div
      className="box-border content-stretch flex flex-row gap-2 items-center justify-center p-[12px] relative rounded-2xl shrink-0 w-full"
      data-name="Operations Item"
      style={{ backgroundColor: getBackgroundColor() }}
    >
      <Operations state={getOperationIconState()} trackId={trackId} />
      <div
        className="basis-0 font-semibold grow leading-[0] min-h-px min-w-px overflow-ellipsis overflow-hidden relative shrink-0 text-left text-nowrap"
        style={{ 
          fontFamily: typography.fontFamily.primary.join(', '),
          fontWeight: typography.fontWeight.semibold,
          fontSize: typography.fontSize['heading-7'],
          lineHeight: typography.lineHeight['heading-7'],
          color: getTextColor()
        }}
      >
        <p className="[text-overflow:inherit] [text-wrap-mode:inherit]\' [white-space-collapse:inherit] block overflow-inherit">
          {trackName}
        </p>
      </div>
      {getIconAndProgress()}
    </div>
  );
}

function Operations({ state, trackId }: { state: 'inProgress' | 'locked'; trackId: string }) {
  const imagePath = TRACK_ICONS[trackId] || '/assets/addition.png';
  
  return (
    <div className="relative shrink-0 size-10" data-name="Operations">
      <div
        className={`absolute bg-center bg-cover bg-no-repeat left-[-0.316px] size-10 top-0 ${
          state === 'inProgress' ? '' : 'opacity-40'
        }`}
        data-name="image"
        style={{ backgroundImage: `url('${imagePath}')` }}
      />
    </div>
  );
}

function HeroiconsSolidLockClosed() {
  return (
    <div
      className="relative shrink-0 size-4"
      data-name="heroicons-solid/lock-closed"
    >
      <svg
        className="block size-full"
        fill="none"
        preserveAspectRatio="none"
        viewBox="0 0 16 16"
      >
        <g id="heroicons-solid/lock-closed">
          <path
            clipRule="evenodd"
            d="M8 1a3 3 0 0 0-3 3v1H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V4a3 3 0 0 0-3-3ZM6.5 4a1.5 1.5 0 1 1 3 0v1h-3V4Z"
            fill={colors.neutral[500]}
            fillRule="evenodd"
            id="Union"
          />
        </g>
      </svg>
    </div>
  );
}

function HeroiconsCheckCircle() {
  return (
    <div
      className="relative shrink-0 size-4"
      data-name="heroicons-solid/check-circle"
    >
      <svg
        className="block size-full"
        fill="none"
        preserveAspectRatio="none"
        viewBox="0 0 16 16"
      >
        <g id="heroicons-solid/check-circle">
          <path
            clipRule="evenodd"
            d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16Zm3.707-9.293a1 1 0 0 0-1.414-1.414L7 8.586 5.707 7.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4Z"
            fill={colors.green[400]}
            fillRule="evenodd"
            id="Union"
          />
        </g>
      </svg>
    </div>
  );
}

function HeroiconsPlayCircle() {
  return (
    <div
      className="relative shrink-0 size-4"
      data-name="heroicons-solid/play-circle"
    >
      <svg
        className="block size-full"
        fill="none"
        preserveAspectRatio="none"
        viewBox="0 0 16 16"
      >
        <g id="heroicons-solid/play-circle">
          <path
            clipRule="evenodd"
            d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zM6.5 5.5a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 .763.424l3-2a.5.5 0 0 0 0-.848l-3-2A.5.5 0 0 0 6.5 5.5z"
            fill={colors.primary[300]}
            fillRule="evenodd"
            id="Union"
          />
        </g>
      </svg>
    </div>
  );
}

function LockedIcon() {
  return (
    <div
      className="bg-[#ffffff] box-border content-stretch flex flex-row gap-2.5 items-center justify-start overflow-clip p-[8px] relative rounded-[20px] shrink-0"
      data-name="Locked Icon"
    >
      <HeroiconsSolidLockClosed />
    </div>
  );
}

function CompletedIcon() {
  return (
    <div
      className="bg-[#ffffff] box-border content-stretch flex flex-row gap-2.5 items-center justify-start overflow-clip p-[8px] relative rounded-[20px] shrink-0"
      data-name="Completed Icon"
    >
      <HeroiconsCheckCircle />
    </div>
  );
}

function InProgressIcon() {
  return (
    <div
      className="bg-[#ffffff] box-border content-stretch flex flex-row gap-2.5 items-center justify-start overflow-clip p-[8px] relative rounded-[20px] shrink-0"
      data-name="In Progress Icon"
    >
      <HeroiconsPlayCircle />
    </div>
  );
}

interface TaskListProps {
  grade: number;
  trackStatuses: TrackStatuses;
  gradeStatus: GradeStatus;
}

function TaskList({ grade, trackStatuses, gradeStatus }: TaskListProps) {
  const tracks = GRADE_TO_TRACKS[grade] || [];
  
  return (
    <div
      className="box-border content-stretch flex flex-col gap-2 items-center justify-start p-0 relative shrink-0 w-full"
      data-name="Task List"
    >
      {tracks.map((trackId) => (
        <OperationsItem 
          key={trackId}
          trackId={trackId}
          trackStatus={trackStatuses[trackId] || 'locked'}
          gradeStatus={gradeStatus}
        />
      ))}
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center justify-center relative shrink-0 w-full">
      <div className="flex-none rotate-[180deg] w-full">
        <div className="h-0 relative w-full">
          <div className="absolute bottom-0 left-0 right-0 top-[-1px]">
            <svg
              className="block size-full"
              fill="none"
              preserveAspectRatio="none"
              viewBox="0 0 376 1"
            >
              <line
                id="Line 120"
                stroke={colors.neutral[400]}
                x2="376"
                y1="0.5"
                y2="0.5"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ExpandableMenuItemProps {
  grade: number;
  trackStatuses: TrackStatuses;
  expanded?: boolean;
}

export default function ExpandableMenuItem({ grade, trackStatuses, expanded = false }: ExpandableMenuItemProps) {
  const [isExpanded, setIsExpanded] = useState(expanded);

  // Update expanded state when prop changes
  useEffect(() => {
    setIsExpanded(expanded);
  }, [expanded]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Determine grade status based on track statuses
  const getGradeStatus = (): GradeStatus => {
    const tracks = GRADE_TO_TRACKS[grade] || [];
    const statuses = tracks.map(trackId => trackStatuses[trackId] || 'locked');
    
    if (statuses.every(status => status === 'completed')) return 'completed';
    if (statuses.some(status => status === 'inProgress')) return 'inProgress';
    return 'locked';
  };

  const gradeStatus = getGradeStatus();

  return (
    <div
      className="bg-[#ffffff] relative rounded-3xl w-full transition-all duration-300"
      data-name="Menu Item Subject"
    >
      <div className="flex flex-col justify-start relative w-full">
        <div className="box-border content-stretch flex flex-col gap-3 items-start justify-start overflow-clip p-[12px] relative w-full">
          <SubjectItem 
            isExpanded={isExpanded} 
            onToggle={toggleExpanded} 
            grade={grade}
            gradeStatus={gradeStatus}
          />
          
          {isExpanded && (
            <div className="w-full animate-in slide-in-from-top-2 duration-200">
              <div
                className="absolute right-[24px] size-[192.717px] translate-y-[-50%] pointer-events-none"
                style={{ top: "calc(50% + 60px)" }}
              >
                <div className="absolute inset-[-73.424%]">
                  <svg
                    className="block size-full"
                    fill="none"
                    preserveAspectRatio="none"
                    viewBox="0 0 477 477"
                  >
                    <g filter="url(#filter0_f_1_305)" id="Ellipse 7">
                      <circle
                        cx="238.358"
                        cy="238.358"
                        fill="var(--fill-0, #E5F2FF)"
                        r="96.3583"
                      />
                    </g>
                    <defs>
                      <filter
                        colorInterpolationFilters="sRGB"
                        filterUnits="userSpaceOnUse"
                        height="475.717"
                        id="filter0_f_1_305"
                        width="475.717"
                        x="0.5"
                        y="0.5"
                      >
                        <feFlood floodOpacity="0" result="BackgroundImageFix" />
                        <feBlend
                          in="SourceGraphic"
                          in2="BackgroundImageFix"
                          mode="normal"
                          result="shape"
                        />
                        <feGaussianBlur
                          result="effect1_foregroundBlur_1_305"
                          stdDeviation="70.75"
                        />
                      </filter>
                    </defs>
                  </svg>
                </div>
              </div>
              
              <Divider />
              <div className="mt-3">
                <TaskList 
                  grade={grade}
                  trackStatuses={trackStatuses}
                  gradeStatus={gradeStatus}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="absolute border-2 border-solid inset-0 pointer-events-none rounded-3xl" style={{ borderColor: colors.primary[400] }} />
    </div>
  );
}