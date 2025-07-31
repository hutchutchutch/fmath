import axios from 'axios';
import { generateOneRosterToken } from '../src/services/oneRosterService';

const ONE_ROSTER_API_BASE = 'https://api.alpha-1edtech.com/ims/oneroster/rostering/v1p2';

interface OneRosterClass {
  sourcedId: string;
  status: string;
  title: string;
  classCode?: string;
  classType?: string;
  location?: string;
  grades?: string[];
  subjects?: string[];
  course?: {
    sourcedId: string;
  };
  school?: {
    sourcedId: string;
  };
  terms?: {
    sourcedId: string;
  }[];
}

interface OneRosterClassesResponse {
  classes: OneRosterClass[];
}

async function fetchAllClasses(): Promise<OneRosterClass[]> {
  try {
    console.log('Generating OneRoster auth token...');
    const token = await generateOneRosterToken();
    console.log('Token generated successfully');

    console.log('Fetching all classes from OneRoster API...');
    const response = await axios.get<OneRosterClassesResponse>(
      `${ONE_ROSTER_API_BASE}/classes/`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.data || !response.data.classes) {
      throw new Error('No classes data received from API');
    }

    console.log(`Fetched ${response.data.classes.length} total classes`);
    return response.data.classes;

  } catch (error: any) {
    if (error.isAxiosError) {
      console.error('API Error:', error.response?.status, error.response?.data || error.message);
    } else {
      console.error('Error fetching classes:', error);
    }
    throw error;
  }
}

function filterFastMathClasses(classes: OneRosterClass[]): OneRosterClass[] {
  const fastMathClasses = classes.filter(cls => 
    cls.title && cls.title.toLowerCase().includes('fastmath')
  );
  
  console.log(`Found ${fastMathClasses.length} classes with 'fastmath' in the title`);
  return fastMathClasses;
}

async function main() {
  try {
    const allClasses = await fetchAllClasses();
    const fastMathClasses = filterFastMathClasses(allClasses);
    
    console.log('\n=== FastMath Classes ===');
    fastMathClasses.forEach((cls, index) => {
      console.log(`\n${index + 1}. Class: ${cls.title}`);
      console.log(`   ID: ${cls.sourcedId}`);
      console.log(`   Status: ${cls.status}`);
      if (cls.classCode) console.log(`   Code: ${cls.classCode}`);
      if (cls.classType) console.log(`   Type: ${cls.classType}`);
      if (cls.location) console.log(`   Location: ${cls.location}`);
      if (cls.grades && cls.grades.length > 0) console.log(`   Grades: ${cls.grades.join(', ')}`);
      if (cls.subjects && cls.subjects.length > 0) console.log(`   Subjects: ${cls.subjects.join(', ')}`);
    });

    console.log(`\n=== Summary ===`);
    console.log(`Total classes: ${allClasses.length}`);
    console.log(`FastMath classes: ${fastMathClasses.length}`);

  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { fetchAllClasses, filterFastMathClasses };