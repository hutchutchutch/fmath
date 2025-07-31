import React from 'react';

interface ProgressBarProps {
  current: number;
  total: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ current, total }) => {
  const progressPercentage = Math.round((current / total) * 100);
  
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-green-500"
            style={{ 
              width: `${progressPercentage}%`,
              transition: 'width 0.5s ease-in-out'
            }}
          />
        </div>
        <span className="text-sm text-gray-500 min-w-[3rem] text-right">
          {progressPercentage}%
        </span>
      </div>
    </div>
  );
};

export default ProgressBar; 