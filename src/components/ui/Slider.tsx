import React, { forwardRef } from 'react';

export interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  valueDisplay?: React.ReactNode;
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ label, valueDisplay, className = '', id, ...props }, ref) => {
    const sliderId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="flex flex-col gap-1.5 w-full">
        <div className="flex items-center justify-between font-auren-mono text-[10px] sm:text-[11px] uppercase tracking-[0.08em]">
          {label && (
            <label htmlFor={sliderId} className="text-[#5A5852]">
              {label}
            </label>
          )}
          {valueDisplay && <span className="font-bold text-[#0D0D0D]">{valueDisplay}</span>}
        </div>
        <input
          ref={ref}
          id={sliderId}
          type="range"
          className={`w-full h-1.5 bg-[#0D0D0D]/15 rounded-none appearance-none cursor-pointer accent-[#0D0D0D] focus:outline-none focus:ring-1 focus:ring-[#0D0D0D] ${className}`}
          {...props}
        />
      </div>
    );
  }
);

Slider.displayName = 'Slider';
