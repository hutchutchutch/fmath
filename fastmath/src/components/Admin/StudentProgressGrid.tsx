import React, { useState, useEffect, useCallback } from 'react';
import { Fact } from '../Learn/types';
import { motion } from 'framer-motion';

import { UserProgress } from '../../types/progress';
import { CircularProgress } from '@mui/material';

interface StudentProgressGridProps {
  userId: string;
  trackId: string;
  userProgress: UserProgress | null;
  facts: Fact[];
  progressPercentage: number;
  isLoading: boolean;
  targetFluency?: number; // Target fluency level based on user's grade
}

interface SelectedCell {
  i: number;
  j: number;
}

const StudentProgressGrid: React.FC<StudentProgressGridProps> = ({ 
  userId,
  trackId,
  userProgress,
  facts,
  progressPercentage,
  isLoading,
  targetFluency = 1.5 // Default to 1.5 seconds if not provided
}) => {
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Function to check if a fact is mastered according to our unified criteria
  const isFactMastered = useCallback((fact: Fact, factProgress: any) => {
    if (!factProgress) return false;

    // Criteria 1: Progress status is already 'mastered'
    if (factProgress.status === 'mastered') return true;

    // Criteria 2: Based on specific fluency practice levels
    if (targetFluency === 1.5) {
      // For standard target fluency (1.5s)
      return factProgress.status === 'fluency1Practice' || factProgress.status === 'automatic';
    } else {
      // For other target fluency levels
      return factProgress.status === 'fluency1_5Practice' || 
             factProgress.status === 'fluency1Practice' || 
             factProgress.status === 'automatic';
    }
  }, [targetFluency]);

  // Process facts data to create grid data
  const processGridData = () => {
    const rowNumbers = new Set<number>();
    const colNumbers = new Set<number>();
    const factGrid: Record<number, Record<number, Fact[]>> = {};
    let operator = '+'; // Default operator
    
    // Determine if this is subtraction or division track
    const isSubtractionOrDivision = trackId === 'TRACK2' || trackId === 'TRACK4' || trackId === 'TRACK5' || trackId === 'TRACK8';

    // Collect all numbers and build grid
    facts.forEach((fact) => {
      if (isSubtractionOrDivision) {
        // For subtraction and division: result on rows, operand2 on columns, operand1 in cells
        rowNumbers.add(fact.result);
        colNumbers.add(fact.operand2);
        
        if (!factGrid[fact.result]) factGrid[fact.result] = {};
        if (!factGrid[fact.result][fact.operand2]) factGrid[fact.result][fact.operand2] = [];
        factGrid[fact.result][fact.operand2].push(fact);
      } else {
        // For addition and multiplication: operand1 on rows, operand2 on columns
        rowNumbers.add(fact.operand1);
        colNumbers.add(fact.operand2);
        
        if (!factGrid[fact.operand1]) factGrid[fact.operand1] = {};
        if (!factGrid[fact.operand1][fact.operand2]) factGrid[fact.operand1][fact.operand2] = [];
        factGrid[fact.operand1][fact.operand2].push(fact);
      }
      
      operator = fact.operation === 'addition' ? '+' : 
                fact.operation === 'subtraction' ? '−' :
                fact.operation === 'multiplication' ? '×' : '÷';
    });

    return {
      rowNumbers: Array.from(rowNumbers).sort((a, b) => a - b),
      colNumbers: Array.from(colNumbers).sort((a, b) => a - b),
      factGrid,
      operator,
      isSubtractionOrDivision
    };
  };

  const getColorClass = (facts: Fact[] | undefined): string => {
    if (!facts || facts.length === 0) {
      return 'bg-gray-50 hover:bg-gray-100'; // Even lighter gray for facts not in the track
    }
    
    if (!userProgress) {
      return 'bg-gray-200 hover:bg-gray-300';
    }
    
    // Check if ALL facts in the cell are mastered according to our unified criteria
    let allFactsMastered = facts.length > 0; // Initialize to true if we have facts
    
    for (const fact of facts) {
      const factProgress = userProgress.facts[fact.factId];
      
      if (!isFactMastered(fact, factProgress)) {
        allFactsMastered = false;
        break; // Once we find a non-mastered fact, we can stop checking
      }
    }
    
    if (allFactsMastered) {
      return 'bg-green-500 hover:bg-green-600'; // All facts mastered - green
    }
    
    // If not all facts are mastered, determine the highest status
    let highestStatus = 'notStarted';
    const statusRank: Record<string, number> = {
      'notStarted': 0,
      'learning': 1,
      'accuracyPractice': 2,
      'fluency6Practice': 3,
      'fluency3Practice': 4,
      'fluency2Practice': 5,
      'fluency1_5Practice': 6,
      'fluency1Practice': 7,
      'automatic': 8,
      'mastered': 9
    };

    for (const fact of facts) {
      const factProgress = userProgress.facts[fact.factId];
      if (!factProgress) continue;
      
      const status = factProgress.status;
      
      if (statusRank[status as keyof typeof statusRank] > statusRank[highestStatus as keyof typeof statusRank]) {
        highestStatus = status;
      }
    }
    
    // Return color based on highest status (for non-mastered facts)
    switch (highestStatus) {
      case 'notStarted':
        return 'bg-gray-200 hover:bg-gray-300';
      case 'learning':
        return 'bg-blue-200 hover:bg-blue-300';
      case 'accuracyPractice':
        return 'bg-orange-400 hover:bg-orange-500';
      case 'fluency6Practice':
        return 'bg-yellow-400 hover:bg-yellow-500';
      case 'fluency3Practice':
      case 'fluency2Practice':
      case 'fluency1_5Practice':
      case 'fluency1Practice':
      case 'automatic':
        return 'bg-lime-400 hover:bg-lime-500';
      default:
        return 'bg-gray-200 hover:bg-gray-300';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <CircularProgress size={40} thickness={4} sx={{ color: '#3b82f6' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-white rounded-lg shadow-md">
        <div className="text-center text-red-500">
          {error}
        </div>
      </div>
    );
  }

  // If there are no facts, show a message
  if (!facts || facts.length === 0) {
    return (
      <div className="p-4 bg-white rounded-lg shadow-md">
        <div className="text-center text-gray-500">
          No facts data available for this track.
        </div>
      </div>
    );
  }

  const { rowNumbers, colNumbers, factGrid, operator, isSubtractionOrDivision } = processGridData();

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      {/* Progress Bar Section */}
      <div className="mb-3">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text mb-2">
          Track Progress
        </h2>
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
            {Math.round(progressPercentage)}%
          </span>
        </div>
      </div>

      {/* Facts Grid with Integrated Legend */}
      <div className="flex flex-row items-start gap-4">
        {/* Legend Column - Now always in a column layout */}
        <div className="flex flex-col gap-2 mr-4">
          <h2 className="text-lg font-bold text-gray-700 mb-2">
            Facts Grid
          </h2>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-gray-200 border border-gray-300"></div>
            <span className="text-sm text-gray-600">Not Started</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-200 border border-blue-300"></div>
            <span className="text-sm text-gray-600">Learning</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-orange-400 border border-orange-500"></div>
            <span className="text-sm text-gray-600">Accuracy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-yellow-400 border border-yellow-500"></div>
            <span className="text-sm text-gray-600">Fluency 6s</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-lime-400 border border-lime-500"></div>
            <span className="text-sm text-gray-600">
              {targetFluency === 1 ? 'Fluency 3s-1.5s' : 
               targetFluency === 1.5 ? 'Fluency 3s-2s' : 
               targetFluency === 2 ? 'Fluency 3s' : 
               `Fluency 3s-${targetFluency}s`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500 border border-green-600"></div>
            <span className="text-sm text-gray-600">Mastered</span>
          </div>
        </div>
        
        {/* Grid Container - Now takes remaining space with square aspect ratio */}
        <div className="flex-1">
          <div className="relative w-full aspect-square max-w-[55vh] max-h-[55vh] mx-auto">
            <div className="w-full h-full">
              <div className="grid gap-1 h-full" 
                   style={{ 
                     gridTemplateColumns: `1.5rem repeat(${colNumbers.length}, minmax(${Math.max(0.5, 1.8 - colNumbers.length * 0.05)}rem, 1fr))`,
                     gridTemplateRows: `1.5rem repeat(${rowNumbers.length}, minmax(${Math.max(0.5, 1.8 - rowNumbers.length * 0.05)}rem, 1fr))`,
                     fontSize: Math.max(0.65, 0.9 - Math.max(rowNumbers.length, colNumbers.length) * 0.01) + 'rem'
                   }}>
                {/* Header row */}
                <div className="flex items-center justify-center text-xs font-medium text-gray-500">
                  {isSubtractionOrDivision ? operator : operator}
                </div>
                {colNumbers.map((num) => (
                  <div 
                    key={num} 
                    className="flex items-center justify-center text-xs font-medium text-gray-500"
                    style={{ fontSize: Math.max(0.65, 0.85 - colNumbers.length * 0.01) + 'rem' }}
                  >
                    {num}
                  </div>
                ))}
                
                {/* Grid rows */}
                {rowNumbers.map((rowNum) => (
                  <React.Fragment key={rowNum}>
                    <div 
                      className="flex items-center justify-center text-xs font-medium text-gray-500"
                      style={{ fontSize: Math.max(0.65, 0.85 - rowNumbers.length * 0.01) + 'rem' }}
                    >
                      {rowNum}
                    </div>
                    {colNumbers.map((colNum) => {
                      const facts = factGrid[rowNum]?.[colNum];
                      const isFactInTrack = facts && facts.length > 0;
                      
                      return (
                        <button
                          key={colNum}
                          className={`
                            w-full
                            h-full
                            rounded
                            text-white
                            font-medium
                            transition-all
                            duration-200
                            transform
                            ${getColorClass(facts)}
                            ${isFactInTrack ? 'hover:shadow-sm hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-default'}
                          `}
                          onClick={isFactInTrack ? () => setSelectedCell({ i: rowNum, j: colNum }) : undefined}
                          aria-disabled={!isFactInTrack}
                        />
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Equation Overlay */}
      {selectedCell && (
        <div 
          className="fixed inset-0 flex items-center justify-center bg-black/50
                    transition-opacity duration-200 ease-in-out z-50"
          onClick={() => setSelectedCell(null)}
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-lg shadow-md p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-4xl font-bold flex items-center space-x-4">
              {isSubtractionOrDivision ? (
                // For subtraction and division: operand1 - operand2 = result
                <>
                  <span className="text-gray-800">
                    {factGrid[selectedCell.i]?.[selectedCell.j]?.[0]?.operand1 || '?'}
                  </span>
                  <span className="text-blue-500">{operator}</span>
                  <span className="text-gray-800">{selectedCell.j}</span>
                  <span className="text-blue-500">=</span>
                  <span className="text-gray-800">{selectedCell.i}</span>
                </>
              ) : (
                // For addition and multiplication: operand1 operator operand2 = result
                <>
                  <span className="text-gray-800">{selectedCell.i}</span>
                  <span className="text-blue-500">{operator}</span>
                  <span className="text-gray-800">{selectedCell.j}</span>
                  <span className="text-blue-500">=</span>
                  <span className="text-gray-800">
                    {factGrid[selectedCell.i]?.[selectedCell.j]?.[0]?.result || '?'}
                  </span>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default StudentProgressGrid; 