#!/usr/bin/env ts-node

import axios from 'axios';
import { TRACK_NAMES } from '../src/types/constants';

// Configuration
const ONE_ROSTER_API_BASE = 'https://api.alpha-1edtech.com/ims/oneroster/rostering/v1p2';
const ONE_ROSTER_RESOURCES_API_BASE = 'https://api.alpha-1edtech.com/ims/oneroster/resources/v1p2';
const AUTH_ENDPOINT = 'https://alpha-auth-production-idp.auth.us-west-2.amazoncognito.com/oauth2/token';
const CLIENT_ID = '2ionhi7706no44misflh94l6c7';
const CLIENT_SECRET = '1bmi87dba06d50lld729k5bj10kujnuflc7ss0q6iaeh3us69edd';
const ORG_ID = 'alphak-8';
const ACADEMIC_SESSION_ID = 'alpha-2025-2026';

// Grade-based course and class definitions
const GRADES = [
  {
    id: 1,
    courseId: 'fastmath-grade-1',
    title: 'FastMath Grade 1',
    courseCode: 'FM-G1',
    classId: 'fastmath-grade-1-class',
    classCode: 'FM-G1-CLASS',
    gradeLevel: '01'
  },
  {
    id: 2,
    courseId: 'fastmath-grade-2',
    title: 'FastMath Grade 2',
    courseCode: 'FM-G2',
    classId: 'fastmath-grade-2-class',
    classCode: 'FM-G2-CLASS',
    gradeLevel: '02'
  },
  {
    id: 3,
    courseId: 'fastmath-grade-3',
    title: 'FastMath Grade 3',
    courseCode: 'FM-G3',
    classId: 'fastmath-grade-3-class',
    classCode: 'FM-G3-CLASS',
    gradeLevel: '03'
  },
  {
    id: 4,
    courseId: 'fastmath-grade-4',
    title: 'FastMath Grade 4',
    courseCode: 'FM-G4',
    classId: 'fastmath-grade-4-class',
    classCode: 'FM-G4-CLASS',
    gradeLevel: '04'
  }
];

// Track to course mapping (only active tracks + ALL)
const TRACK_TO_COURSE_MAP: Record<string, string> = {
  // Grade 1 tracks
  'TRACK12': 'fastmath-grade-1',
  
  // Grade 2 tracks  
  'TRACK9': 'fastmath-grade-2',
  'TRACK10': 'fastmath-grade-2',
  
  // Grade 3 tracks
  'TRACK6': 'fastmath-grade-3',
  'TRACK8': 'fastmath-grade-3', 
  'TRACK11': 'fastmath-grade-3',
  
  // Grade 4 tracks
  'TRACK5': 'fastmath-grade-4',
  'TRACK7': 'fastmath-grade-4',
  
  // ALL access
  'ALL': 'fastmath-grade-4'
};

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface OneRosterResponse {
  sourcedIdPairs?: {
    suppliedSourcedId: string;
    allocatedSourcedId: string;
  };
}

/**
 * Generate OAuth token for OneRoster API
 */
async function generateToken(): Promise<string> {
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    const response = await axios.post<TokenResponse>(AUTH_ENDPOINT, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    return response.data.access_token;
  } catch (error) {
    console.error('Error generating token:', error);
    throw new Error('Failed to generate OneRoster token');
  }
}

/**
 * Create a course in OneRoster
 */
async function createCourse(token: string, grade: typeof GRADES[0]): Promise<boolean> {
  try {
    console.log(`Creating course: ${grade.title}`);
    
    const courseData = {
      course: {
        sourcedId: grade.courseId,
        status: "active",
        title: grade.title,
        courseCode: grade.courseCode,
        grades: [grade.gradeLevel],
        subjects: ["Math"],
        subjectCodes: ["MA"],
        org: {
          sourcedId: ORG_ID
        }
      }
    };

    const response = await axios.post<OneRosterResponse>(
      `${ONE_ROSTER_API_BASE}/courses/`,
      courseData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    console.log(`✓ Created course: ${grade.title} (${response.data.sourcedIdPairs?.suppliedSourcedId})`);
    return true;
  } catch (error: any) {
    console.error(`✗ Failed to create course ${grade.title}:`, error.response?.data || error.message);
    return false;
  }
}

/**
 * Create a course component in OneRoster
 */
async function createComponent(token: string, grade: typeof GRADES[0]): Promise<boolean> {
  try {
    console.log(`Creating component for: ${grade.title}`);
    
    const componentData = {
      courseComponent: {
        sourcedId: `${grade.courseId}-component`,
        status: "active",
        title: `${grade.title} Component`,
        courseSourcedId: grade.courseId,
        course: { sourcedId: grade.courseId }
      }
    };

    const response = await axios.post<OneRosterResponse>(
      `${ONE_ROSTER_API_BASE}/courses/components`,
      componentData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    console.log(`✓ Created component: ${grade.title} Component (${response.data.sourcedIdPairs?.suppliedSourcedId})`);
    return true;
  } catch (error: any) {
    console.error(`✗ Failed to create component for ${grade.title}:`, error.response?.data || error.message);
    return false;
  }
}

/**
 * Create a resource in OneRoster for a specific track
 */
async function createTrackResource(token: string, trackId: string): Promise<string | null> {
  try {
    const trackName = TRACK_NAMES[trackId as keyof typeof TRACK_NAMES];
    console.log(`Creating resource for track: ${trackId} (${trackName})`);
    
    const resourceData = {
      resource: {
        sourcedId: `fastmath-${trackId.toLowerCase()}-resource`,
        title: trackName,
        vendorResourceId: `fastmath-${trackId.toLowerCase()}-v1`,
        status: "active",
        metadata: {
          launchPattern: "lti-magic-link",
          type: "interactive",
          subject: "Math",
          url: "https://app.fastmath.pro",
          launchUrl: "https://server.fastmath.pro/lti/launch",
          instructionalMethod: "direct-instruction"
        }
      }
    };

    const response = await axios.post<OneRosterResponse>(
      `${ONE_ROSTER_RESOURCES_API_BASE}/resources`,
      resourceData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const suppliedSourcedId = `fastmath-${trackId.toLowerCase()}-resource`;
    const resourceId = response.data.sourcedIdPairs?.suppliedSourcedId || suppliedSourcedId;
    console.log(`✓ Created resource: ${trackName} (${resourceId})`);
    return resourceId;
  } catch (error: any) {
    console.error(`✗ Failed to create resource for ${trackId}:`, error.response?.data || error.message);
    return null;
  }
}

/**
 * Create a component resource in OneRoster linking a track resource to a course component
 */
async function createTrackComponentResource(token: string, trackId: string, resourceId: string): Promise<boolean> {
  try {
    const trackName = TRACK_NAMES[trackId as keyof typeof TRACK_NAMES];
    const courseId = TRACK_TO_COURSE_MAP[trackId];
    
    console.log(`Creating component resource for track: ${trackId} (${trackName}) → ${courseId}`);
    
    const componentResourceData = {
      componentResource: {
        sourcedId: `${courseId}-${trackId.toLowerCase()}-component-resource`,
        status: "active",
        title: trackName, // Use track name as title per requirement
        courseComponent: {
          sourcedId: `${courseId}-component`
        },
        resource: {
          sourcedId: resourceId
        }
      }
    };

    const response = await axios.post<OneRosterResponse>(
      `${ONE_ROSTER_API_BASE}/courses/component-resources`,
      componentResourceData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    console.log(`✓ Created component resource: ${trackName} (${response.data.sourcedIdPairs?.suppliedSourcedId})`);
    return true;
  } catch (error: any) {
    console.error(`✗ Failed to create component resource for ${trackId}:`, error.response?.data || error.message);
    return false;
  }
}

/**
 * Create a class in OneRoster
 */
async function createClass(token: string, grade: typeof GRADES[0]): Promise<boolean> {
  try {
    console.log(`Creating class: ${grade.title} Class`);
    
    const classData = {
      class: {
        sourcedId: grade.classId,
        status: "active",
        title: `${grade.title} Class`,
        classCode: grade.classCode,
        grades: [grade.gradeLevel],
        subjects: ["Math"],
        course: {
          sourcedId: grade.courseId
        },
        org: {
          sourcedId: ORG_ID
        },
        subjectCodes: ["MA"],
        terms: [
          {
            sourcedId: ACADEMIC_SESSION_ID
          }
        ]
      }
    };

    const response = await axios.post<OneRosterResponse>(
      `${ONE_ROSTER_API_BASE}/classes/`,
      classData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    console.log(`✓ Created class: ${grade.title} Class (${response.data.sourcedIdPairs?.suppliedSourcedId})`);
    return true;
  } catch (error: any) {
    console.error(`✗ Failed to create class ${grade.title} Class:`, error.response?.data || error.message);
    return false;
  }
}

/**
 * Add delay between API calls
 */
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main setup function with step-by-step execution
 */
async function setupGradeBasedOneRoster(): Promise<void> {
  try {
    console.log('🚀 Starting OneRoster grade-based setup...\n');
    
    // Generate token
    console.log('Generating OneRoster API token...');
    const token = await generateToken();
    console.log('✓ Token generated successfully\n');

    let successCount = 0;
    let totalOperations = 0;

    // STEP 10: Create remaining 3 classes (Grades 2-4) with correct academic session
    console.log('🏫 Creating remaining classes (Grades 2-4)...');
    const remainingGrades = GRADES.slice(1); // Skip Grade 1 (already created)
    
    console.log(`Creating classes for: ${remainingGrades.map(g => g.title).join(', ')}`);
    console.log(`Using academic session: ${ACADEMIC_SESSION_ID}`);
    console.log('');
    
    for (const grade of remainingGrades) {
      const success = await createClass(token, grade);
      if (success) {
        successCount++;
      }
      totalOperations++;
      await delay(500); // Small delay between requests
    }
    console.log('');

    // Summary - showing what was created
    console.log('📊 Setup Summary (Remaining Classes):');
    console.log(`✓ Successful operations: ${successCount}/${totalOperations}`);
    console.log(`✗ Failed operations: ${totalOperations - successCount}/${totalOperations}`);
    
    if (successCount === totalOperations) {
      console.log('\n🎉 Remaining classes created successfully!');
      remainingGrades.forEach(grade => {
        console.log(`  • ${grade.title} Class (${grade.classId})`);
        console.log(`    → Course: ${grade.courseId}`);
        console.log(`    → Grade level: ${grade.gradeLevel}`);
      });
      console.log(`\n📚 Academic session: ${ACADEMIC_SESSION_ID}`);
      console.log('\n🎊 COMPLETE! OneRoster grade-based setup is finished!');
      console.log('\n📋 Final Structure:');
      console.log('  ✅ 4 Grade-based courses');
      console.log('  ✅ 4 Course components');  
      console.log('  ✅ 9 Track-based resources');
      console.log('  ✅ 9 Component resources (linking tracks to courses)');
      console.log('  ✅ 4 Grade-based classes');
      console.log('\n🚀 Ready for student enrollment!');
    } else {
      console.log('\n⚠️ Some class creations failed. Check logs above.');
    }

  } catch (error) {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  }
}

// Run the setup if this script is executed directly
if (require.main === module) {
  setupGradeBasedOneRoster()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
}

export { setupGradeBasedOneRoster };