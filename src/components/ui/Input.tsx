import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  suffix?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, suffix, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="flex flex-col gap-1 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="font-auren-mono text-[10px] sm:text-[11px] uppercase tracking-[0.08em] text-[#5A5852]"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <input
            ref={ref}
            id={inputId}
            className={`w-full bg-white border border-[#0D0D0D]/20 px-3 py-1.5 font-auren-mono text-xs text-[#0D0D0D] transition-colors focus:outline-none focus:border-[#0D0D0D] focus:ring-1 focus:ring-[#0D0D0D] disabled:opacity-50 disabled:bg-[#F5F4F0] disabled:cursor-not-allowed ${
              error ? 'border-[#8E2A1E] focus:border-[#8E2A1E] focus:ring-[#8E2A1E]' : ''
            } ${className}`}
            {...props}
          />
          {suffix && (
            <span className="absolute right-2.5 font-auren-mono text-[11px] text-[#5A5852] pointer-events-none">
              {suffix}
            </span>
          )}
        </div>
        {error && (
          <span className="font-auren-mono text-[10px] text-[#8E2A1E] tracking-tight">{error}</span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
