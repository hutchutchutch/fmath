import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Card, CardContent } from '../../ui/card';
import { WeeklyData } from './types';
import { convertToChartData } from './utils';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface WeeklyActivityChartProps {
  weeklyData: WeeklyData[];
  isLoading?: boolean;
}

export const WeeklyActivityChart: React.FC<WeeklyActivityChartProps> = ({
  weeklyData,
  isLoading = false
}) => {
  const chartData = convertToChartData(weeklyData);

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20
        }
      },
      title: {
        display: true,
        text: 'Weekly Assessment Activity',
        font: {
          size: 16,
          weight: 'bold'
        },
        padding: 20
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          title: (context) => {
            return `Week: ${context[0].label}`;
          },
          label: (context) => {
            const label = context.dataset.label || '';
            return `${label}: ${context.raw} users`;
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Week',
          font: {
            size: 12,
            weight: 'bold'
          }
        },
        grid: {
          display: false
        }
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Number of Users',
          font: {
            size: 12,
            weight: 'bold'
          }
        },
        ticks: {
          stepSize: 1
        }
      }
    },
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
  };

  if (isLoading) {
    return (
      <Card className="h-[400px]">
        <CardContent className="p-6 h-full flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading chart data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!weeklyData || weeklyData.length === 0) {
    return (
      <Card className="h-[400px]">
        <CardContent className="p-6 h-full flex items-center justify-center">
          <div className="text-center">
            <div className="text-gray-400 mb-2">📊</div>
            <p className="text-gray-600">No assessment data available for this period</p>
            <p className="text-sm text-gray-500 mt-1">
              Try selecting a different date range or check back later
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border border-gray-100">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 py-4 px-6 rounded-t-lg">
        <h3 className="text-xl font-semibold text-white">Weekly Assessment Activity</h3>
        <p className="text-blue-100 text-sm mt-1">
          Track user engagement and fluency achievement over time
        </p>
      </div>
      <CardContent className="p-6">
        <div className="h-[350px] w-full">
          <Bar data={chartData} options={options} />
        </div>
        
        {/* Summary stats below chart */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {Math.max(...weeklyData.map(w => w.usersAttempted))}
            </div>
            <div className="text-xs text-gray-600">Peak Weekly Users</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {Math.max(...weeklyData.map(w => w.usersFluent))}
            </div>
            <div className="text-xs text-gray-600">Peak Weekly Fluent</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {weeklyData.reduce((sum, w) => sum + w.usersAttempted, 0)}
            </div>
            <div className="text-xs text-gray-600">Total Attempts</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-600">
              {weeklyData.reduce((sum, w) => sum + w.usersFluent, 0)}
            </div>
            <div className="text-xs text-gray-600">Total Fluent</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};