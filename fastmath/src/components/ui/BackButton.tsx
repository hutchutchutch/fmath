import { motion } from 'framer-motion';
import { FiArrowLeft } from 'react-icons/fi';

interface BackButtonProps {
  onBack: () => void;
  className?: string;
  fixed?: boolean;
  size?: number;
}

export function BackButton({ 
  onBack, 
  className = '', 
  fixed = true,
  size = 24 
}: BackButtonProps) {
  const baseClassName = "p-2 rounded-full hover:bg-blue-50 transition-colors";
  const positionClassName = fixed ? "fixed top-6 left-6" : "";
  
  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onBack}
      className={`${baseClassName} ${positionClassName} ${className}`}
      aria-label="Go back"
    >
      <FiArrowLeft className="text-blue-600" size={size} />
    </motion.button>
  );
} 