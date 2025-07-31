import { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createUsers, updateUserGradesBatch, updateUserTracksBatch, resetUserProgress } from '../../api/admin';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { FiPlus, FiUsers, FiTrash2, FiEdit, FiRefreshCw } from 'react-icons/fi';
import { TRACK_NAMES, CAMPUS_NAMES } from '../../types/constants';
import Logo from '../common/Logo';

// Track options based on TRACK_NAMES constant - using only tracks 5-12 plus "No Track" option
const TRACKS = [
  { id: '', name: 'No Track' },
  { id: 'TRACK5', name: TRACK_NAMES.TRACK5 },
  { id: 'TRACK6', name: TRACK_NAMES.TRACK6 },
  { id: 'TRACK7', name: TRACK_NAMES.TRACK7 },
  { id: 'TRACK8', name: TRACK_NAMES.TRACK8 },
  { id: 'TRACK9', name: TRACK_NAMES.TRACK9 },
  { id: 'TRACK10', name: TRACK_NAMES.TRACK10 },
  { id: 'TRACK11', name: TRACK_NAMES.TRACK11 },
  { id: 'TRACK12', name: TRACK_NAMES.TRACK12 },
];

// Campus options based on CAMPUS_NAMES constant - automatically sorted alphabetically
const CAMPUSES = Object.entries(CAMPUS_NAMES)
  .map(([id, name]) => ({ id, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

// Access denied component for non-admin users
const AccessDenied = () => (
  <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col justify-center p-6">
    <div className="max-w-4xl mx-auto text-center">
      <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
      <p className="text-base text-gray-600 mt-2">You are not authorized to view this page.</p>
    </div>
  </div>
);

// Header component
const RosteringHeader = () => (
  <h1 className="text-4xl font-bold text-center pt-8 mb-6 flex items-center justify-center gap-4">
    <Logo size={32} />
    <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
      User Rostering
    </span>
  </h1>
);

// Interface for user data
interface UserData {
  email: string;
  grade: number | ''; // Allow empty string for initial state, parse to number on change
  trackId: string;
  campus: string;
}

// Interface for API response
interface UserCreationResult {
  email: string;
  userId?: string;
  status: string;
  oneRosterStatus?: string;
  message?: string;
}

interface ApiResponse {
  success: boolean;
  message: string;
  results?: {
    totalProcessed: number;
    created: number;
    alreadyExisting: number;
    failed: number;
    details: UserCreationResult[];
  };
}

// New interfaces for batch updates
interface GradeUpdateData {
  email: string;
  grade?: number;
}

interface TrackUpdateData {
  email: string;
  track: string;
}

interface BatchUpdateResponse {
  success: boolean;
  message: string;
  results: {
    email: string;
    success: boolean;
    message: string;
    userId?: string;
  }[];
}

export const RosteringPage = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserData[]>([{ email: '', grade: '', trackId: '', campus: CAMPUSES[0].id }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null);
  
  // State for grade update form
  const [gradeUpdateUsers, setGradeUpdateUsers] = useState<GradeUpdateData[]>([{ email: '', grade: undefined }]);
  const [isUpdatingGrade, setIsUpdatingGrade] = useState(false);
  const [gradeUpdateResponse, setGradeUpdateResponse] = useState<{
    success?: boolean;
    message: string;
    results?: { email: string; success: boolean; message: string }[];
  } | null>(null);

  // State for track update form
  const [trackUpdateUsers, setTrackUpdateUsers] = useState<TrackUpdateData[]>([{ email: '', track: '' }]);
  const [isUpdatingTrack, setIsUpdatingTrack] = useState(false);
  const [trackUpdateResponse, setTrackUpdateResponse] = useState<{
    success?: boolean;
    message: string;
    results?: { email: string; success: boolean; message: string }[];
  } | null>(null);

  // State for progress reset form
  const [resetEmail, setResetEmail] = useState('');
  const [resetTrackId, setResetTrackId] = useState(TRACKS[0].id);
  const [isResetting, setIsResetting] = useState(false);
  const [resetResponse, setResetResponse] = useState<{
    success?: boolean;
    message: string;
  } | null>(null);

  // Check if user is admin - same logic as AdminPage
  const isAdmin = useMemo(() => 
    currentUser?.userId === 'a24ab5cd-4209-41f0-9806-65ae0a9e6957', 
    [currentUser?.userId]
  );

  // Add a new empty user field
  const addUser = () => {
    setUsers([...users, { email: '', grade: '', trackId: '', campus: CAMPUSES[0].id }]);
  };

  // Add a new grade update row
  const addGradeUpdateRow = () => {
    setGradeUpdateUsers([...gradeUpdateUsers, { email: '', grade: undefined }]);
  };

  // Add a new track update row
  const addTrackUpdateRow = () => {
    setTrackUpdateUsers([...trackUpdateUsers, { email: '', track: '' }]);
  };

  // Remove a user at specific index
  const removeUser = (index: number) => {
    const newUsers = [...users];
    newUsers.splice(index, 1);
    setUsers(newUsers);
  };

  // Remove a grade update row
  const removeGradeUpdateRow = (index: number) => {
    const newRows = [...gradeUpdateUsers];
    newRows.splice(index, 1);
    setGradeUpdateUsers(newRows);
  };

  // Remove a track update row
  const removeTrackUpdateRow = (index: number) => {
    const newRows = [...trackUpdateUsers];
    newRows.splice(index, 1);
    setTrackUpdateUsers(newRows);
  };

  // Update user field
  const updateUserField = (index: number, field: keyof UserData, value: string) => {
    const newUsers = [...users];
    if (field === 'grade') {
      newUsers[index][field] = value === '' ? '' : parseInt(value, 10);
    } else {
      newUsers[index][field] = value;
    }
    setUsers(newUsers);
  };

  // Update grade update field
  const updateGradeField = (index: number, field: keyof GradeUpdateData, value: string) => {
    const newRows = [...gradeUpdateUsers];
    if (field === 'grade') {
      newRows[index][field] = value === '' ? undefined : parseInt(value, 10);
    } else {
      newRows[index][field] = value;
    }
    setGradeUpdateUsers(newRows);
  };

  // Update track update field
  const updateTrackField = (index: number, field: keyof TrackUpdateData, value: string) => {
    const newRows = [...trackUpdateUsers];
    newRows[index][field] = value;
    setTrackUpdateUsers(newRows);
  };

  // Handle form submission
  const handleSubmit = async () => {
    // Validate form
    const invalidUsers = users.filter(user => !user.email || user.grade === '' || isNaN(Number(user.grade)) || !user.campus);
    if (invalidUsers.length > 0) {
      setApiResponse({
        success: false,
        message: 'Please fill in all required fields for all users (email, grade, campus).'
      });
      return;
    }

    setIsSubmitting(true);
    setApiResponse(null);

    try {
      // Call the API
      const usersToSubmit = users.map(user => ({
        ...user,
        grade: Number(user.grade), // Ensure grade is a number before sending
      }));
      const response = await createUsers(usersToSubmit);
      
      // Set the API response for display
      setApiResponse(response);
      
      // Reset form on success
      if (response.success) {
        setUsers([{ email: '', grade: '', trackId: '', campus: CAMPUSES[0].id }]);
      }
    } catch (error) {
      // Handle error
      setApiResponse({
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle batch grade update
  const handleGradeUpdate = async () => {
    // Validate input
    const invalidRows = gradeUpdateUsers.filter(row => !row.email || row.grade === undefined || isNaN(row.grade));
    if (invalidRows.length > 0) {
      setGradeUpdateResponse({
        success: false,
        message: 'Please enter valid email and grade for all rows.'
      });
      return;
    }

    setIsUpdatingGrade(true);
    setGradeUpdateResponse(null);

    try {
      // For both single and batch updates
      const updates = gradeUpdateUsers.map(user => ({
        email: user.email,
        grade: user.grade!
      }));
      
      const response = await updateUserGradesBatch(updates);

      setGradeUpdateResponse({
        success: response.success,
        message: response.message,
        results: response.results
      });

      // Clear form on success
      if (response.success) {
        setGradeUpdateUsers([{ email: '', grade: undefined }]);
      }
    } catch (error) {
      // Handle error
      setGradeUpdateResponse({
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred.'
      });
    } finally {
      setIsUpdatingGrade(false);
    }
  };

  // Handle batch track update
  const handleTrackUpdate = async () => {
    // Validate input - track can be empty (representing "No Track")
    const invalidRows = trackUpdateUsers.filter(row => !row.email);
    if (invalidRows.length > 0) {
      setTrackUpdateResponse({
        success: false,
        message: 'Please enter valid email for all rows.'
      });
      return;
    }

    setIsUpdatingTrack(true);
    setTrackUpdateResponse(null);

    try {
      // For both single and batch updates
      const updates = trackUpdateUsers.map(user => ({
        email: user.email,
        track: user.track
      }));
      
      const response = await updateUserTracksBatch(updates);

      setTrackUpdateResponse({
        success: response.success,
        message: response.message,
        results: response.results
      });

      // Clear form on success
      if (response.success) {
        setTrackUpdateUsers([{ email: '', track: '' }]);
      }
    } catch (error) {
      // Handle error
      setTrackUpdateResponse({
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred.'
      });
    } finally {
      setIsUpdatingTrack(false);
    }
  };

  // Handle user progress reset
  const handleProgressReset = async () => {
    if (!resetEmail || !resetTrackId) {
      setResetResponse({ success: false, message: 'Please enter an email address and select a track.' });
      return;
    }

    // Show confirmation dialog
    if (!window.confirm(`Are you sure you want to reset progress for track ${resetTrackId} for user ${resetEmail}? This action cannot be undone.`)) {
      return;
    }

    setIsResetting(true);
    setResetResponse(null);

    try {
      const response = await resetUserProgress(resetEmail, resetTrackId);
      setResetResponse(response);
      if (response.success) {
        setResetEmail('');
      }
    } catch (error) {
      setResetResponse({
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred.',
      });
    } finally {
      setIsResetting(false);
    }
  };

  // Early return if not admin
  if (!isAdmin) {
    return <AccessDenied />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        <RosteringHeader />

        {/* Update Grade Card */}
        <Card className="overflow-hidden rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 py-4 px-6">
            <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
              <FiEdit className="text-yellow-300" size={24} />
              Update User Grades
            </h2>
          </div>
          <CardContent className="p-6 space-y-6">
            {/* Grade Update Response Display */}
            {gradeUpdateResponse && (
              <div className={`p-4 rounded-lg ${
                gradeUpdateResponse.success 
                  ? "bg-green-50 border border-green-200 text-green-800" 
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}>
                <div className="font-medium">{gradeUpdateResponse.message}</div>
                
                {gradeUpdateResponse.results && gradeUpdateResponse.results.length > 0 && (
                  <div className="mt-3">
                    <h4 className="font-medium">Results:</h4>
                    <ul className="mt-1 list-disc pl-5 text-sm">
                      {gradeUpdateResponse.results.map((result, idx) => (
                        <li key={idx} className={result.success ? 'text-green-700' : 'text-red-700'}>
                          {result.email}: {result.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            {/* Grade Update Form */}
            <div className="space-y-4">
              {gradeUpdateUsers.map((gradeRow, index) => (
                <div key={index} className="p-4 rounded-lg border border-gray-200 space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium">User {index + 1}</h3>
                    {gradeUpdateUsers.length > 1 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => removeGradeUpdateRow(index)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <FiTrash2 size={16} />
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor={`update-grade-email-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <Input
                        id={`update-grade-email-${index}`}
                        type="email"
                        placeholder="student@example.com"
                        value={gradeRow.email}
                        onChange={(e) => updateGradeField(index, 'email', e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label htmlFor={`update-grade-value-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                        New Grade
                      </label>
                      <Input
                        id={`update-grade-value-${index}`}
                        type="number"
                        min="-1"
                        placeholder="5"
                        value={gradeRow.grade !== undefined ? gradeRow.grade : ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          updateGradeField(index, 'grade', value);
                        }}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Add row button */}
            <div className="flex justify-center">
              <Button
                onClick={addGradeUpdateRow}
                variant="outline"
                className="flex items-center gap-2"
              >
                <FiPlus size={16} />
                Add Another User
              </Button>
            </div>
            
            {/* Update button */}
            <div className="text-center">
              <Button
                onClick={handleGradeUpdate}
                disabled={isUpdatingGrade}
                className="px-6 py-2 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300 flex items-center gap-2 mx-auto"
              >
                {isUpdatingGrade ? 'Updating...' : (
                  <>
                    <FiRefreshCw size={16} />
                    Update Grades
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Update Track Card */}
        <Card className="overflow-hidden rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 py-4 px-6">
            <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
              <FiEdit className="text-yellow-300" size={24} />
              Update User Tracks
            </h2>
          </div>
          <CardContent className="p-6 space-y-6">
            {/* Track Update Response Display */}
            {trackUpdateResponse && (
              <div className={`p-4 rounded-lg ${
                trackUpdateResponse.success 
                  ? "bg-green-50 border border-green-200 text-green-800" 
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}>
                <div className="font-medium">{trackUpdateResponse.message}</div>
                
                {trackUpdateResponse.results && trackUpdateResponse.results.length > 0 && (
                  <div className="mt-3">
                    <h4 className="font-medium">Results:</h4>
                    <ul className="mt-1 list-disc pl-5 text-sm">
                      {trackUpdateResponse.results.map((result, idx) => (
                        <li key={idx} className={result.success ? 'text-green-700' : 'text-red-700'}>
                          {result.email}: {result.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            {/* Track Update Form */}
            <div className="space-y-4">
              {trackUpdateUsers.map((trackRow, index) => (
                <div key={index} className="p-4 rounded-lg border border-gray-200 space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium">User {index + 1}</h3>
                    {trackUpdateUsers.length > 1 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => removeTrackUpdateRow(index)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <FiTrash2 size={16} />
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor={`update-track-email-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <Input
                        id={`update-track-email-${index}`}
                        type="email"
                        placeholder="student@example.com"
                        value={trackRow.email}
                        onChange={(e) => updateTrackField(index, 'email', e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label htmlFor={`update-track-value-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                        New Track
                      </label>
                      <select
                        id={`update-track-value-${index}`}
                        value={trackRow.track}
                        onChange={(e) => updateTrackField(index, 'track', e.target.value)}
                        className="w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="" disabled>Select a track</option>
                        {TRACKS.map(track => (
                          <option key={track.id} value={track.id}>
                            {track.id ? `${track.id} - ${track.name}` : track.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Add row button */}
            <div className="flex justify-center">
              <Button
                onClick={addTrackUpdateRow}
                variant="outline"
                className="flex items-center gap-2"
              >
                <FiPlus size={16} />
                Add Another User
              </Button>
            </div>
            
            {/* Update button */}
            <div className="text-center">
              <Button
                onClick={handleTrackUpdate}
                disabled={isUpdatingTrack}
                className="px-6 py-2 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300 flex items-center gap-2 mx-auto"
              >
                {isUpdatingTrack ? 'Updating...' : (
                  <>
                    <FiRefreshCw size={16} />
                    Update Tracks
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* User Rostering Form */}
        <Card className="overflow-hidden rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 py-4 px-6">
            <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
              <FiUsers className="text-yellow-300" size={24} />
              Add New Users
            </h2>
          </div>
          <CardContent className="p-6 space-y-6">
            {/* API Response Display */}
            {apiResponse && (
              <div className={`p-4 rounded-lg ${
                apiResponse.success 
                  ? "bg-green-50 border border-green-200 text-green-800" 
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}>
                <div className="font-medium mb-2">{apiResponse.message}</div>
                
                {apiResponse.results && (
                  <div className="space-y-4 mt-4">
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <div className="bg-white bg-opacity-50 p-2 rounded text-center">
                        <div className="font-medium">Total</div>
                        <div className="text-xl font-bold">{apiResponse.results.totalProcessed}</div>
                      </div>
                      <div className="bg-green-100 p-2 rounded text-center">
                        <div className="font-medium">Created</div>
                        <div className="text-xl font-bold text-green-700">{apiResponse.results.created}</div>
                      </div>
                      <div className="bg-blue-100 p-2 rounded text-center">
                        <div className="font-medium">Existing</div>
                        <div className="text-xl font-bold text-blue-700">{apiResponse.results.alreadyExisting}</div>
                      </div>
                      <div className="bg-red-100 p-2 rounded text-center">
                        <div className="font-medium">Failed</div>
                        <div className="text-xl font-bold text-red-700">{apiResponse.results.failed}</div>
                      </div>
                    </div>
                    
                    {apiResponse.results.details && apiResponse.results.details.length > 0 && (
                      <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User ID</th>
                              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {apiResponse.results.details.map((detail, idx) => (
                              <tr key={idx} className="text-sm">
                                <td className="px-3 py-2 whitespace-nowrap">{detail.email}</td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    detail.status === 'created' 
                                      ? 'bg-green-100 text-green-800' 
                                      : detail.status === 'existing'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-red-100 text-red-800'
                                  }`}>
                                    {detail.status}
                                  </span>
                                  {detail.oneRosterStatus && (
                                    <span className="ml-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                      OneRoster: {detail.oneRosterStatus}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{detail.userId || '-'}</td>
                                <td className="px-3 py-2">{detail.message || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* User forms */}
            <div className="space-y-4">
              {users.map((user, index) => (
                <div key={index} className="p-4 rounded-lg border border-gray-200 space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium">User {index + 1}</h3>
                    {users.length > 1 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => removeUser(index)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <FiTrash2 size={16} />
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label htmlFor={`email-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <Input
                        id={`email-${index}`}
                        type="email"
                        placeholder="student@example.com"
                        value={user.email}
                        onChange={(e) => updateUserField(index, 'email', e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label htmlFor={`grade-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                        Grade
                      </label>
                      <Input
                        id={`grade-${index}`}
                        type="number"
                        min="-1"
                        placeholder="5"
                        value={user.grade !== undefined ? user.grade : ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          updateUserField(index, 'grade', value);
                        }}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label htmlFor={`track-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                        Track
                      </label>
                      <select
                        id={`track-${index}`}
                        value={user.trackId}
                        onChange={(e) => {
                          updateUserField(index, 'trackId', e.target.value);
                        }}
                        className="w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        {TRACKS.map(track => (
                          <option key={track.id} value={track.id}>
                            {track.id ? `${track.id} - ${track.name}` : track.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`campus-${index}`} className="block text-sm font-medium text-gray-700 mb-1">
                        Campus
                      </label>
                      <select
                        id={`campus-${index}`}
                        value={user.campus}
                        onChange={(e) => {
                          updateUserField(index, 'campus', e.target.value);
                        }}
                        className="w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="" disabled>Select a campus</option>
                        {CAMPUSES.map(campus => (
                          <option key={campus.id} value={campus.id}>
                            {campus.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Add row button */}
            <div className="flex justify-center">
              <Button
                onClick={addUser}
                variant="outline"
                className="flex items-center gap-2"
              >
                <FiPlus size={16} />
                Add Another User
              </Button>
            </div>
            
            {/* Submit button */}
            <div className="text-center">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-6 py-2 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300 flex items-center gap-2 mx-auto"
              >
                {isSubmitting ? 'Submitting...' : (
                  <>
                    <FiRefreshCw size={16} />
                    Submit
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Reset User Progress Card */}
        <Card className="overflow-hidden rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300">
          <div className="bg-gradient-to-r from-red-600 to-yellow-600 py-4 px-6">
            <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
              <FiTrash2 className="text-white" size={24} />
              Reset User Track Progress
            </h2>
          </div>
          <CardContent className="p-6 space-y-6">
            {/* Reset Progress Response Display */}
            {resetResponse && (
              <div className={`p-4 rounded-lg ${
                resetResponse.success 
                  ? "bg-green-50 border border-green-200 text-green-800" 
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}>
                <div className="font-medium">{resetResponse.message}</div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-1">
                  User Email
                </label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="student@example.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="reset-track" className="block text-sm font-medium text-gray-700 mb-1">
                  Track to Reset
                </label>
                <select
                  id="reset-track"
                  value={resetTrackId}
                  onChange={(e) => setResetTrackId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {TRACKS.map(track => (
                    <option key={track.id} value={track.id}>
                      {track.id} - {track.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-sm text-gray-500 text-center">
              This will delete all progress data for a user for the selected track. This action is irreversible.
            </p>
            
            <div className="text-center">
              <Button
                onClick={handleProgressReset}
                disabled={isResetting}
                className="px-6 py-2 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300 flex items-center gap-2 mx-auto"
              >
                {isResetting ? 'Resetting...' : (
                  <>
                    <FiTrash2 size={16} />
                    Reset Track Progress
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RosteringPage; 
