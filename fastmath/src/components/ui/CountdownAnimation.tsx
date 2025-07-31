import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CountdownAnimationProps {
  onComplete: () => void;
}

const CountdownAnimation: React.FC<CountdownAnimationProps> = ({ onComplete }) => {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (count === 0) {
      onComplete();
      return;
    }

    const timer = setTimeout(() => {
      setCount(count - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [count, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
    >
      <AnimatePresence mode="wait">
        {count > 0 && (
          <motion.div
            key={count}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ 
              scale: [0.5, 1.2, 1],
              opacity: [0, 1, 0]
            }}
            transition={{ 
              duration: 1.0,
              times: [0, 0.3, 1],
              ease: "easeInOut"
            }}
            className="text-[8rem] font-bold text-white"
          >
            {count}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default CountdownAnimation; 