import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Button } from "./button";
import { cn } from "../../lib/utils";
import { Delete } from "lucide-react";

interface TouchpadInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  showFeedback?: boolean;
  wasCorrect?: boolean;
}

const TouchpadInput = React.forwardRef<HTMLDivElement, TouchpadInputProps>(
  ({ value, onChange, disabled = false, className, showFeedback = false, wasCorrect = false }, ref) => {
    // Handle digit input
    const handleDigitClick = (digit: string) => {
      if (disabled) return;
      // Only allow numbers
      const newValue = value + digit;
      if (/^\d*$/.test(newValue)) {
        onChange(newValue);
      }
    };

    // Handle backspace
    const handleBackspace = () => {
      if (disabled) return;
      onChange(value.slice(0, -1));
    };

    const buttonClassName = cn(
      "h-14 text-xl font-semibold transition-all duration-200 hover:scale-105 active:scale-95",
      showFeedback && (wasCorrect 
        ? "border-green-500 bg-green-50 text-green-700"
        : "border-red-500 bg-red-50 text-red-700"
      )
    );

    return (
      <div 
        ref={ref}
        className={cn(
          "grid grid-cols-3 gap-2 p-2 w-[280px]",
          className
        )}
      >
        {/* Numbers 1-9 */}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <Button
            key={digit}
            variant="outline"
            className={buttonClassName}
            onClick={() => handleDigitClick(digit.toString())}
            disabled={disabled || showFeedback}
          >
            {digit}
          </Button>
        ))}

        {/* Bottom row with expanded 0 and backspace */}
        <Button
          variant="outline"
          className={cn(buttonClassName, "col-span-2")}
          onClick={() => handleDigitClick("0")}
          disabled={disabled || showFeedback}
        >
          0
        </Button>

        <Button
          variant="secondary"
          className={buttonClassName}
          onClick={handleBackspace}
          disabled={disabled || showFeedback}
        >
          <Delete className="w-6 h-6" />
        </Button>
      </div>
    );
  }
);

TouchpadInput.displayName = "TouchpadInput";

export { TouchpadInput }; 