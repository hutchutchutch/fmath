import React, { useEffect, useState, useRef } from 'react';

interface TimerProps {
  duration: number; // Duration of green zone in seconds
  onTimeout: () => void;
  onZoneChange?: (zone: 'green' | 'yellow') => void;
  isActive?: boolean;
}

const Timer: React.FC<TimerProps> = ({ duration: greenZoneDuration, onTimeout, onZoneChange, isActive = true }) => {
  const [key, setKey] = useState(0);
  const [isYellowZone, setIsYellowZone] = useState(false);
  const onTimeoutRef = useRef(onTimeout);
  const onZoneChangeRef = useRef(onZoneChange);
  const totalDuration = greenZoneDuration * 3; // Total duration is 3x the green zone duration

  // Reset yellow zone and notify parent on mount
  useEffect(() => {
    setIsYellowZone(false);
    if (onZoneChangeRef.current) {
      onZoneChangeRef.current('green');
    }
  }, []); // Empty deps array means this runs once on mount

  // Update refs when callbacks change
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
    onZoneChangeRef.current = onZoneChange;
  }, [onTimeout, onZoneChange]);

  // Generate animation style for shrinking only
  const animationStyle = `
    @keyframes shrinkBar {
      0% {
        transform: scaleX(1);
      }
      100% {
        transform: scaleX(0);
      }
    }
  `;

  useEffect(() => {
    const styleSheet = document.createElement("style");
    styleSheet.innerText = animationStyle;
    document.head.appendChild(styleSheet);

    return () => {
      document.head.removeChild(styleSheet);
    };
  }, [animationStyle]);

  useEffect(() => {
    if (!isActive) return;

    setIsYellowZone(false);
    setKey(prev => prev + 1);

    let isTimeoutActive = true;

    // Schedule zone change to yellow
    const zoneChangeTimeout = setTimeout(() => {
      if (isTimeoutActive) {
        setIsYellowZone(true);
        if (onZoneChangeRef.current) {
          onZoneChangeRef.current('yellow');
        }
      }
    }, greenZoneDuration * 1000);

    // Schedule final timeout
    const finalTimeout = setTimeout(() => {
      if (isTimeoutActive) {
        onTimeoutRef.current();
      }
    }, totalDuration * 1000);

    return () => {
      isTimeoutActive = false;
      clearTimeout(zoneChangeTimeout);
      clearTimeout(finalTimeout);
    };
  }, [isActive, greenZoneDuration, totalDuration]);

  return (
    <div 
      key={key}
      className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden opacity-60"
    >
      <div 
        className={`h-full w-full origin-right ${isYellowZone ? 'bg-amber-400' : 'bg-emerald-400'}`}
        style={{ 
          animation: `shrinkBar ${totalDuration}s linear forwards`,
          transformOrigin: 'right',
          animationPlayState: isActive ? 'running' : 'paused'
        }}
      />
    </div>
  );
};

export default Timer;