import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '../../ui/card';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { FiSearch, FiDownload, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { ProcessedAssessmentResult, TablePaginationProps } from './types';
import {
  formatDate,
  formatCqpm,
  formatPercentage,
  getFluentBadgeClasses,
  getFluentDisplayText,
  getCqpmColor,
  getAccuracyColor,
  sortAssessmentsByDate,
  filterAssessments,
  paginateArray,
  calculateTotalPages,
  exportToCSV,
  debounce
} from './utils';

interface AssessmentResultsTableProps {
  assessmentResults: ProcessedAssessmentResult[];
  isLoading?: boolean;
}

const ITEMS_PER_PAGE = 25;

const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage,
  totalPages,
  itemsPerPage,
  totalItems,
  onPageChange
}) => {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
      <div className="text-sm text-gray-600">
        Showing {startItem} to {endItem} of {totalItems} results
      </div>
      
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="flex items-center"
        >
          <FiChevronLeft className="w-4 h-4 mr-1" />
          Previous
        </Button>
        
        <div className="flex items-center space-x-1">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (currentPage <= 3) {
              pageNum = i + 1;
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = currentPage - 2 + i;
            }

            return (
              <Button
                key={pageNum}
                variant={currentPage === pageNum ? "default" : "outline"}
                size="sm"
                onClick={() => onPageChange(pageNum)}
                className="w-8 h-8 p-0"
              >
                {pageNum}
              </Button>
            );
          })}
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="flex items-center"
        >
          Next
          <FiChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
};

export const AssessmentResultsTable: React.FC<AssessmentResultsTableProps> = ({
  assessmentResults,
  isLoading = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Debounced search
  const debouncedSearch = useMemo(
    () => debounce((term: string) => {
      setSearchTerm(term);
      setCurrentPage(1); // Reset to first page on search
    }, 300),
    []
  );

  // Process and filter data
  const processedData = useMemo(() => {
    const sorted = sortAssessmentsByDate(assessmentResults);
    return filterAssessments(sorted, searchTerm);
  }, [assessmentResults, searchTerm]);

  // Paginated data
  const paginatedData = useMemo(() => {
    return paginateArray(processedData, currentPage, ITEMS_PER_PAGE);
  }, [processedData, currentPage]);

  const totalPages = calculateTotalPages(processedData.length, ITEMS_PER_PAGE);

  const handleExportCSV = () => {
    const filename = `assessment_results_${new Date().toISOString().split('T')[0]}.csv`;
    exportToCSV(processedData, filename);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  if (isLoading) {
    return (
      <Card className="shadow-lg border border-gray-100">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 py-4 px-6">
          <h3 className="text-xl font-semibold text-white">Assessment Results</h3>
        </div>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading assessment results...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border border-gray-100">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 py-4 px-6">
        <h3 className="text-xl font-semibold text-white">Assessment Results</h3>
        <p className="text-blue-100 text-sm mt-1">
          Detailed view of all completed assessments
        </p>
      </div>
      
      {/* Search and Export Controls */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search by user email..."
              onChange={(e) => debouncedSearch(e.target.value)}
              className="pl-10 pr-4 py-2"
            />
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={processedData.length === 0}
              className="flex items-center"
            >
              <FiDownload className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            
            <div className="text-sm text-gray-600 py-2 px-3 bg-white rounded border">
              {processedData.length} results
            </div>
          </div>
        </div>
      </div>

      <CardContent className="p-0">
        {processedData.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">📊</div>
            <p className="text-gray-600">No assessment results found</p>
            {searchTerm && (
              <p className="text-sm text-gray-500 mt-1">
                Try adjusting your search terms
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      CQPM Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Accuracy Rate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Correct/Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fluent Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Score Date
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedData.map((result, index) => (
                    <tr key={result.sourcedId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {result.userEmail}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-semibold ${getCqpmColor(result.cqpm)}`}>
                          {formatCqpm(result.cqpm)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-semibold ${getAccuracyColor(result.accuracyRate)}`}>
                          {formatPercentage(result.accuracyRate)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {result.correct}/{result.attempts}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getFluentBadgeClasses(result.fluent)}`}>
                          {getFluentDisplayText(result.fluent)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(result.scoreDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                itemsPerPage={ITEMS_PER_PAGE}
                totalItems={processedData.length}
                onPageChange={handlePageChange}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};