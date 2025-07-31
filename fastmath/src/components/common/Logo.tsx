import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ size = 36, className = "" }) => {
  return (
    <img 
      src="/logo.png" 
      alt="Fast Math Logo" 
      style={{ width: size, height: size }} 
      className={className}
    />
  );
};

export default Logo; 