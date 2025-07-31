import React from 'react';
import { Card, CardContent } from '../../ui/card';
import { FiTrendingUp, FiAward, FiUser } from 'react-icons/fi';
import { UserRanking } from './types';
import { formatDate, formatCqpm, formatPercentage } from './utils';

interface FluentUsersRankingProps {
  userRankings: UserRanking[];
  isLoading?: boolean;
}

export const FluentUsersRanking: React.FC<FluentUsersRankingProps> = ({
  userRankings,
  isLoading = false
}) => {
  if (isLoading) {
    return (
      <Card className="shadow-lg border border-gray-100">
        <div className="bg-gradient-to-r from-green-600 to-teal-600 py-4 px-6">
          <h3 className="text-xl font-semibold text-white">Top Performing Students</h3>
        </div>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading student rankings...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const topUsers = userRankings.slice(0, 10); // Show top 10 users

  if (topUsers.length === 0) {
    return (
      <Card className="shadow-lg border border-gray-100">
        <div className="bg-gradient-to-r from-green-600 to-teal-600 py-4 px-6">
          <h3 className="text-xl font-semibold text-white">Top Performing Students</h3>
          <p className="text-green-100 text-sm mt-1">
            Students ranked by fluent assessment achievements
          </p>
        </div>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <div className="text-gray-400 mb-2">🏆</div>
            <p className="text-gray-600">No student data available</p>
            <p className="text-sm text-gray-500 mt-1">
              Students will appear here once they complete assessments
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getRankingIcon = (index: number) => {
    switch (index) {
      case 0:
        return <FiAward className="w-5 h-5 text-yellow-500" />;
      case 1:
        return <FiAward className="w-5 h-5 text-gray-400" />;
      case 2:
        return <FiAward className="w-5 h-5 text-amber-600" />;
      default:
        return <FiUser className="w-5 h-5 text-gray-500" />;
    }
  };

  const getRankingBadge = (index: number) => {
    const rank = index + 1;
    let badgeClasses = '';
    
    switch (index) {
      case 0:
        badgeClasses = 'bg-yellow-100 text-yellow-800 border-yellow-200';
        break;
      case 1:
        badgeClasses = 'bg-gray-100 text-gray-800 border-gray-200';
        break;
      case 2:
        badgeClasses = 'bg-amber-100 text-amber-800 border-amber-200';
        break;
      default:
        badgeClasses = 'bg-blue-100 text-blue-800 border-blue-200';
        break;
    }

    return (
      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeClasses}`}>
        #{rank}
      </div>
    );
  };

  const getFluentPercentageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 70) return 'text-blue-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card className="shadow-lg border border-gray-100">
      <div className="bg-gradient-to-r from-green-600 to-teal-600 py-4 px-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-white flex items-center">
              <FiTrendingUp className="w-5 h-5 mr-2" />
              Top Performing Students
            </h3>
            <p className="text-green-100 text-sm mt-1">
              Students ranked by fluent assessment achievements
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-white">
              {topUsers.length}
            </div>
            <div className="text-xs text-green-100">
              Active Students
            </div>
          </div>
        </div>
      </div>

      <CardContent className="p-0">
        {/* Summary Stats */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">
                {Math.max(...topUsers.map(u => u.fluentCount))}
              </div>
              <div className="text-xs text-gray-600">Most Fluent</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">
                {Math.max(...topUsers.map(u => u.totalAssessments))}
              </div>
              <div className="text-xs text-gray-600">Most Attempts</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-purple-600">
                {formatPercentage(Math.max(...topUsers.map(u => u.fluentPercentage)))}
              </div>
              <div className="text-xs text-gray-600">Best Rate</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-indigo-600">
                {formatCqpm(Math.max(...topUsers.map(u => u.averageCqpm)))}
              </div>
              <div className="text-xs text-gray-600">Highest CQPM</div>
            </div>
          </div>
        </div>

        {/* Rankings Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Student Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fluent Count
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Assessments
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fluent Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg CQPM
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Activity
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {topUsers.map((user, index) => (
                <tr 
                  key={user.userEmail} 
                  className={`hover:bg-gray-50 ${index < 3 ? 'bg-gradient-to-r from-yellow-50 to-transparent' : ''}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getRankingIcon(index)}
                      <span className="ml-2">{getRankingBadge(index)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {user.userEmail}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="text-lg font-bold text-green-600">
                        {user.fluentCount}
                      </div>
                      <div className="ml-2 text-xs text-gray-500">
                        assessments
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="font-semibold">{user.totalAssessments}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`font-bold ${getFluentPercentageColor(user.fluentPercentage)}`}>
                      {formatPercentage(user.fluentPercentage)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="font-semibold text-indigo-600">
                      {formatCqpm(user.averageCqpm)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(user.lastActivity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Show all link if there are more than 10 users */}
        {userRankings.length > 10 && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 text-center">
            <p className="text-sm text-gray-600">
              Showing top 10 of {userRankings.length} students
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};