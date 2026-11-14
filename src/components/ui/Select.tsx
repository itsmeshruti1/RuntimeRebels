import React, { forwardRef } from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, children, className = '', id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="flex flex-col gap-1 w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="font-auren-mono text-[10px] sm:text-[11px] uppercase tracking-[0.08em] text-[#5A5852]"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`w-full bg-white border border-[#0D0D0D]/20 px-3 py-1.5 font-auren-mono text-xs text-[#0D0D0D] transition-colors focus:outline-none focus:border-[#0D0D0D] focus:ring-1 focus:ring-[#0D0D0D] disabled:opacity-50 disabled:bg-[#F5F4F0] cursor-pointer ${
            error ? 'border-[#8E2A1E] focus:border-[#8E2A1E]' : ''
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        {error && (
          <span className="font-auren-mono text-[10px] text-[#8E2A1E] tracking-tight">{error}</span>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
