import { v4 as uuidv4 } from 'uuid';

interface UserData {
  userId: string;
  email: string;
  grade: number;
  trackId: string;
}

// Generate user data
const userData: UserData[] = [
  { userId: uuidv4(), email: 'isaiah.murray@2hourlearning.com', grade: 8, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'hunter.dastrup@2hourlearning.com', grade: 4, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'gabriella.gonzalez@2hourlearning.com', grade: 6, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'dalton.robinson@2hourlearning.com', grade: 7, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'william.case@2hourlearning.com', grade: 7, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'samuel.case@2hourlearning.com', grade: 8, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'will.robinson@2hourlearning.com', grade: 1, trackId: 'TRACK12' },
  { userId: uuidv4(), email: 'lynnix.russel@2hourlearning.com', grade: 4, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'reagan.galbreth@2hourlearning.com', grade: 3, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'monica.langford-sanchez@2hourlearning.com', grade: 4, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'ivan.langford-sanchez@2hourlearning.com', grade: 6, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'joshua.kennard@2hourlearning.com', grade: 9, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'joseph.kennard@2hourlearning.com', grade: 7, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'timothy.pena@2hourlearning.com', grade: 7, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'evelyn.kennard@2hourlearning.com', grade: 2, trackId: 'TRACK9' },
  { userId: uuidv4(), email: 'james.thompson@2hourlearning.com', grade: 5, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'kaylie.thompson@2hourlearning.com', grade: 6, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'rowan.thompson@2hourlearning.com', grade: 1, trackId: 'TRACK12' },
  { userId: uuidv4(), email: 'david.thompson@2hourlearning.com', grade: 4, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'anora.thompson@2hourlearning.com', grade: 8, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'payson.robinson@2hourlearning.com', grade: 5, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'faezon.philips@2hourlearning.com', grade: 3, trackId: 'TRACK6' },
  { userId: uuidv4(), email: 'samuel.langford-sanchez@2hourlearning.com', grade: 8, trackId: 'TRACK6' }
];

// Export the user data
export default userData; 