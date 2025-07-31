export const TRACK_NAMES = {
  'ALL': 'All Tracks',
  'TRACK1': 'Addition Facts',
  'TRACK2': 'Subtraction Facts', 
  'TRACK3': 'Multiplication Facts',
  'TRACK4': 'Division Facts',
  'TRACK5': 'Division Facts (Up to 12)',
  'TRACK6': 'Addition Facts (Sums up to 20)',
  'TRACK7': 'Multiplication Facts (Factors up to 12)',
  'TRACK8': 'Subtraction Facts (Up to 20)',
  'TRACK9': 'Addition (Single-Digit)',
  'TRACK10': 'Subtraction (Single-Digit)',
  'TRACK11': 'Multiplication (Single-digit)',
  'TRACK12': 'Addition Within 10 (Sums up to 10)'
} as const;

// Onboarding assessment sequence in grade progression order
export const ONBOARDING_ASSESSMENT_SEQUENCE = [
  'TRACK12', // G1 Add - Addition Within 10
  'TRACK9',  // G2 Add - Addition Single-Digit
  'TRACK10', // G2 Sub - Subtraction Single-Digit
  'TRACK6',  // G3 Add - Addition Facts up to 20
  'TRACK8',  // G3 Sub - Subtraction Facts up to 20
  'TRACK11', // G3 Mul - Multiplication Single-digit
  'TRACK7',  // G4 Mul - Multiplication Facts up to 12
  'TRACK5'   // G4 Div - Division Facts up to 12
] as const; 

export const TRACK_RANGES = {
  'TRACK1': [1, 99] as const,    // (Deprecated) Addition Facts
  'TRACK2': [100, 195] as const,   // (Deprecated) Subtraction Facts
  'TRACK3': [196, 279] as const,  // (Deprecated) Multiplication Facts
  'TRACK4': [280, 367] as const,  // (Deprecated) Division Facts
  'TRACK5': [368, 511] as const,  // Division Facts: Grades 4 and above
  'TRACK6': [512, 742] as const,  // Addition Facts: Grades 3 and above
  'TRACK7': [743, 911] as const,  // Multiplication Facts: Grades 4 and above
  'TRACK8': [912, 1142] as const,  // Subtraction Facts: Grades 3 and above
  'TRACK9': [1143, 1242] as const,  // Addition Facts: Grade 2 only
  'TRACK10': [1243, 1407] as const,  // Subtraction Facts: Grade 2 only
  'TRACK11': [1408, 1507] as const,  // Multiplication Facts: Grade 3 only
  'TRACK12': [1508, 1573] as const  // Addition Facts: Grade 1 only
}

export const TRACK_LENGTHS = {
  'TRACK1': 99,
  'TRACK2': 96,
  'TRACK3': 84,
  'TRACK4': 88,
  'TRACK5': 144,
  'TRACK6': 231,
  'TRACK7': 169,
  'TRACK8': 231,
  'TRACK9': 100,
  'TRACK10': 165,
  'TRACK11': 100,
  'TRACK12': 66
};

// CQPM targets by grade
export const CQPM_TARGETS: { [key: number]: number } = {
  0: 30,
  1: 30,
  2: 30,
  3: 30,
  4: 35,
  5: 40,
  6: 40,
  7: 40,
  8: 40,
  9: 40,
  10: 40,
  11: 40,
  12: 40
};

// Fluency targets by grade
export const FLUENCY_TARGETS: { [key: number]: number } = {
  0: 2,
  1: 2,
  2: 2,
  3: 2,
  4: 1.5,
  5: 1.5,
  6: 1.5,
  7: 1.5,
  8: 1.5,
  9: 1.5,
  10: 1.5,
  11: 1.5,
  12: 1.5
};

// Campus options
export const CAMPUS_NAMES = {
  'alpha-fort-worth': 'Alpha Fort Worth',
  'alpha-high-school': 'Alpha High School',
  'alpha-houston': 'Alpha Houston',
  'alpha-miami': 'Alpha Miami',
  'alpha-new-york-city': 'Alpha New York City',
  'alpha-orlando': 'Alpha Orlando',
  'alpha-phoenix': 'Alpha Phoenix',
  'alpha-santa-barbara': 'Alpha Santa Barbara',
  'alpha-tampa': 'Alpha Tampa',
  'alpha-west-palm-beach': 'Alpha West Palm Beach',
  'austin-k8': 'Austin K-8',
  'brownsville-k8': 'Brownsville K-8',
  'centner-academy': 'Centner Academy',
  'colearn-academy': 'Colearn Academy',
  'esports-academy-austin': 'Esports Academy: Austin',
  'gt-school-georgetown': 'GT School: Georgetown TX',
  'havruta-learning-pod-austin': 'Havruta Learning Pod: Austin TX',
  'high-school-sat-prep': 'High School SAT Prep',
  'isee-prep': 'ISEE Prep',
  'novatio': 'Novatio',
  'single-user-2hr': 'Single-user 2hr learning',
  'sports-academy-lakeway': 'Sports Academy: Lakeway',
  'texas-preparatory-school': 'Texas Preparatory School',
  'valenta-academy': 'Valenta Academy',
  'vita-high-school': 'Vita High School',
} as const;