import React from 'react';

interface AudioLevelMeterProps {
  level: number; // 0-100
  isListening: boolean;
}

export const AudioLevelMeter: React.FC<AudioLevelMeterProps> = ({ level, isListening }) => {
  // Determine color based on level
  const getColor = () => {
    if (!isListening) return '#e0e0e0';
    if (level < 20) return '#4caf50';
    if (level < 60) return '#ff9800';
    return '#f44336';
  };

  return (
    <div className="audio-level-meter" style={{
      width: '100%',
      height: '4px',
      backgroundColor: '#f0f0f0',
      borderRadius: '2px',
      overflow: 'hidden',
      marginTop: '8px'
    }}>
      <div 
        className="level-bar" 
        style={{
          width: `${level}%`,
          height: '100%',
          backgroundColor: getColor(),
          transition: 'width 0.1s ease-out, background-color 0.3s ease',
          borderRadius: '2px'
        }}
      />
    </div>
  );
};