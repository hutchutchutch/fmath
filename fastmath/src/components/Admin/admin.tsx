import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { searchUsers, createProgressAssessment, getUserProgressAssessments } from '../../config/api';
import { ProgressAssessment } from '../../types/progressAssessment';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { FiSearch, FiPlus, FiX, FiBarChart2, FiUsers, FiZap, FiDownload, FiUserPlus, FiTrendingUp } from 'react-icons/fi';
import { TRACK_NAMES } from '../../types/constants';
import UserDataTable from './UserDataTable';
import Logo from '../common/Logo';

interface User {
  userId: string;
  email: string;
}

// Memoized components for better performance
const AccessDenied = () => (
  <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col justify-center p-6">
    <div className="max-w-4xl mx-auto text-center">
      <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
      <p className="text-base text-gray-600 mt-2">You are not authorized to view this page.</p>
    </div>
  </div>
);

// Header component
const AdminHeader = () => (
  <header className="sticky top-0 z-10 bg-white border-b px-6 py-3">
    <div className="flex items-center justify-between">
      <div className="flex items-center">
        <Logo size={32} />
        <h1 className="text-2xl font-bold ml-3">Admin Dashboard</h1>
      </div>
    </div>
  </header>
);

// Assessment table component with improved design
const AssessmentTable = ({ assessments }: { assessments: ProgressAssessment[] }) => (
  <div className="overflow-hidden rounded-lg shadow-md">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
          <tr>
            {['ID', 'Status', 'Created', 'Track', 'Duration', 'CQPM', 'Accuracy'].map((header) => (
              <th key={header} className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {assessments.map((assessment) => (
            <tr key={assessment.assessmentId} className="hover:bg-blue-50 transition-colors duration-150">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">{assessment.assessmentId}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  assessment.status === 'completed' 
                    ? 'bg-green-100 text-green-800' 
                    : assessment.status === 'in_progress'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-800'
                }`}>
                  {assessment.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{new Date(assessment.startDate).toLocaleString()}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{assessment.trackId}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{assessment.duration} sec</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800">{assessment.overallCQPM.toFixed(2)}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  assessment.accuracyRate > 0.9 
                    ? 'bg-green-100 text-green-800' 
                    : assessment.accuracyRate > 0.7
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                }`}>
                  {(assessment.accuracyRate * 100).toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const AdminPage = () => {
  const { user: currentUser } = useAuth();
  // Commented out user search and assessment creation functionality
  /*
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<number[]>([]);
  const [duration, setDuration] = useState<number>(60);
  const [assessments, setAssessments] = useState<ProgressAssessment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Load user's assessments - useCallback to avoid recreation on each render
  const loadAssessments = useCallback(async (userId: string) => {
    try {
      const response = await getUserProgressAssessments(userId);
      setAssessments(response || []);
    } catch (error) {
      console.error('Failed to load assessments:', error);
      setAssessments([]);
    }
  }, []);

  // Load assessments when a user is selected
  useEffect(() => {
    if (selectedUser) {
      loadAssessments(selectedUser.userId);
    }
  }, [selectedUser, loadAssessments]);

  // Handle search with useCallback
  const handleSearch = useCallback(async () => {
    if (!searchEmail) return;

    setIsLoading(true);
    setError('');
    try {
      const response = await searchUsers(searchEmail);
      setSearchResults(response.users || []);
      if (!response.users || response.users.length === 0) {
        setError('No users found');
      }
    } catch (error) {
      setError('Failed to search users');
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchEmail]);

  // Handle user selection
  const handleUserSelect = useCallback((user: User) => {
    setSelectedUser(user);
    setSearchResults([]);
    setSearchEmail('');
  }, []);

  // Handle track toggle
  const handleTrackToggle = useCallback((trackId: number) => {
    setSelectedTracks([trackId]);
  }, []);

  // Handle creating assessment
  const handleCreateAssessment = useCallback(async () => {
    if (!selectedUser || selectedTracks.length === 0) return;

    setIsLoading(true);
    setError('');
    try {
      const trackId = `TRACK${selectedTracks[0]}`;
      await createProgressAssessment(
        selectedUser.userId,
        duration,
        trackId
      );
      
      // Refresh assessments list
      await loadAssessments(selectedUser.userId);
      setSelectedTracks([]);
    } catch (error) {
      setError('Failed to create assessment');
      console.error('Create assessment error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedUser, selectedTracks, duration, loadAssessments]);
  */

  // Check if user is admin - memoize this value
  const isAdmin = useMemo(() => 
    currentUser?.userId === 'a24ab5cd-4209-41f0-9806-65ae0a9e6957', 
    [currentUser?.userId]
  );

  // Early return if not admin
  if (!isAdmin) {
    return <AccessDenied />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <AdminHeader />

        {/* Admin Navigation */}
        <Card className="overflow-hidden rounded-xl shadow-lg border border-gray-100">
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 py-4 px-6">
            <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
              <FiUsers className="text-indigo-100" size={24} />
              Admin Tools
            </h2>
            <p className="text-indigo-100 text-sm mt-1">Access admin functionality and reports</p>
          </div>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <a href="/admin/downloads" className="block">
                <div className="p-4 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all duration-300 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <FiDownload className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Downloads</h3>
                      <p className="text-sm text-gray-600">Export data and reports</p>
                    </div>
                  </div>
                </div>
              </a>

              <a href="/admin/rostering" className="block">
                <div className="p-4 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all duration-300 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <FiUserPlus className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">User Rostering</h3>
                      <p className="text-sm text-gray-600">Manage user accounts</p>
                    </div>
                  </div>
                </div>
              </a>

              <a href="/admin/cqpm-dashboard" className="block">
                <div className="p-4 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all duration-300 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <FiTrendingUp className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">CQPM Analytics</h3>
                      <p className="text-sm text-gray-600">Assessment performance dashboard</p>
                    </div>
                  </div>
                </div>
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Daily Dashboard Section */}
        <Card className="overflow-hidden rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 py-4 px-6">
            <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
              <FiBarChart2 className="text-yellow-300" size={24} />
              Daily Dashboard
            </h2>
          </div>
          <CardContent className="p-0">
            <UserDataTable />
          </CardContent>
        </Card>

        {/* Commented out user search and assessment creation UI 
        <Card className="overflow-hidden rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 py-4 px-6">
            <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
              <FiSearch className="text-white" size={24} />
              User Search
            </h2>
          </div>
          <CardContent className="space-y-6 p-6">
            <div className="space-y-4">
              <div className="flex gap-4">
                <Input
                  type="email"
                  placeholder="Search by email"
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  className="flex-1 p-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                />
                <Button 
                  onClick={handleSearch}
                  disabled={isLoading}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300 flex items-center gap-2"
                >
                  <FiSearch />
                  Search
                </Button>
              </div>

              {error && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-500 text-base text-center">
                  {error}
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map(user => (
                    <div
                      key={user.userId}
                      onClick={() => handleUserSelect(user)}
                      className="p-4 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-all duration-300 flex items-center"
                    >
                      {user.email}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedUser && (
              <>
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-semibold text-blue-700">Selected User: {selectedUser.email}</h2>
                    <Button
                      variant="ghost"
                      onClick={() => setSelectedUser(null)}
                      className="text-gray-500 hover:text-gray-700 transition-colors duration-300"
                    >
                      <FiX size={20} />
                    </Button>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-gray-200">
                  <h3 className="text-xl font-semibold text-blue-700 flex items-center gap-2">
                    <FiPlus className="text-blue-500" size={20} />
                    Create New Assessment
                  </h3>
                  
                  <div className="space-y-2">
                    <label className="text-base font-medium text-gray-700">Duration (seconds)</label>
                    <Input
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      min={1}
                      className="w-32 p-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-base font-medium text-gray-700">Select Track</label>
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(TRACK_NAMES || {}).map(([trackKey, trackName]) => {
                        const trackId = parseInt(trackKey.replace('TRACK', ''));
                        const isSelected = selectedTracks[0] === trackId;
                        return (
                          <div
                            key={trackKey}
                            onClick={() => handleTrackToggle(trackId)}
                            className={`p-4 rounded-lg border cursor-pointer transition-all duration-300 ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 shadow-sm'
                                : 'border-gray-200 hover:border-blue-300'
                            }`}
                          >
                            {trackName}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <Button
                    onClick={handleCreateAssessment}
                    disabled={isLoading || selectedTracks.length === 0}
                    className={`w-full max-w-md mx-auto px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 
                      text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg 
                      transition-all duration-300 flex items-center justify-center gap-2
                      ${(isLoading) && 'opacity-50 cursor-not-allowed'}`}
                  >
                    {isLoading ? (
                      <>
                        <span>Creating...</span>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </>
                    ) : (
                      <>
                        <FiPlus className="w-5 h-5" />
                        <span>Create Assessment</span>
                      </>
                    )}
                  </Button>
                </div>

                <div className="space-y-4 pt-4 border-t border-gray-200">
                  <h3 className="text-xl font-semibold text-blue-700 flex items-center gap-2">
                    <FiZap className="text-blue-500" size={20} />
                    Existing Assessments
                  </h3>
                  <div className="space-y-4">
                    {assessments.length > 0 ? (
                      <AssessmentTable assessments={assessments} />
                    ) : (
                      <div className="text-base text-gray-500 p-6 text-center bg-gray-50 rounded-lg border border-gray-200">
                        No assessments found
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        */}
      </div>
    </div>
  );
};

export default AdminPage;