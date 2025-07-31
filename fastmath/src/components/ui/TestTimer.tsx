import React, { useEffect, useState, useRef } from 'react';

interface CountdownTimerProps {
  onComplete: () => void;
  isActive?: boolean;
}

const TestTimer: React.FC<CountdownTimerProps> = ({ onComplete, isActive = true }) => {
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes in seconds
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!isActive || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onCompleteRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, timeLeft]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const progressPercent = (timeLeft / 120) * 100;

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-center text-sm text-gray-600">
        <span className="font-medium">Time Remaining</span>
        <span className="font-bold">
          {minutes}:{seconds.toString().padStart(2, '0')}
        </span>
      </div>
      <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
        <div 
          className="h-full bg-blue-500 transition-all duration-1000"
          style={{ 
            width: `${progressPercent}%`,
          }}
        />
      </div>
    </div>
  );
};

export default TestTimer; 