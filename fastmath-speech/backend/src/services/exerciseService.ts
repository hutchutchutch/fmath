export interface MathProblem {
  id: string;
  num1: number;
  num2: number;
  operator: '+';
  answer: number;
  timeLimit: number;
}

export function generateSingleDigitAdditionProblems(count: number): MathProblem[] {
  const problems: MathProblem[] = [];
  
  for (let i = 0; i < count; i++) {
    const num1 = Math.floor(Math.random() * 10); // 0-9
    const num2 = Math.floor(Math.random() * 10); // 0-9
    
    problems.push({
      id: `problem_${i + 1}`,
      num1,
      num2,
      operator: '+',
      answer: num1 + num2,
      timeLimit: 6 // 6 seconds per problem
    });
  }
  
  return problems;
}