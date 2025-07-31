import React from 'react';
import { Button } from '../../ui/button';
import { DateRangeOption } from './types';

interface DateRangeSelectorProps {
  selectedRange: DateRangeOption;
  onRangeChange: (range: DateRangeOption) => void;
  isLoading?: boolean;
}

const DATE_RANGE_OPTIONS: { value: DateRangeOption; label: string }[] = [
  { value: 30, label: 'Last 30 days' },
  { value: 60, label: 'Last 60 days' },
  { value: 90, label: 'Last 90 days' }
];

export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
  selectedRange,
  onRangeChange,
  isLoading = false
}) => {
  return (
    <div className="flex gap-2 mb-6">
      {DATE_RANGE_OPTIONS.map((option) => (
        <Button
          key={option.value}
          variant={selectedRange === option.value ? "default" : "outline"}
          onClick={() => onRangeChange(option.value)}
          disabled={isLoading}
          className={`${
            selectedRange === option.value
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "text-gray-600 hover:text-blue-600 hover:border-blue-600"
          }`}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
};