import React, { forwardRef } from 'react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className = '', id, checked, ...props }, ref) => {
    const checkboxId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <label
        htmlFor={checkboxId}
        className={`inline-flex items-start gap-2.5 cursor-pointer select-none group ${className}`}
      >
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            ref={ref}
            id={checkboxId}
            type="checkbox"
            checked={checked}
            className="sr-only peer"
            {...props}
          />
          <div className="w-4 h-4 border border-[#0D0D0D]/30 bg-white transition-all peer-checked:bg-[#0D0D0D] peer-checked:border-[#0D0D0D] peer-focus-visible:ring-2 peer-focus-visible:ring-[#0D0D0D] peer-focus-visible:ring-offset-1 flex items-center justify-center">
            <svg
              className={`w-2.5 h-2.5 text-[#F5F4F0] fill-none stroke-current stroke-[2.5] transition-opacity ${
                checked ? 'opacity-100' : 'opacity-0'
              }`}
              viewBox="0 0 12 12"
            >
              <polyline points="2 6 5 9 10 3" />
            </svg>
          </div>
        </div>
        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <span className="font-auren-mono text-xs uppercase tracking-[0.06em] text-[#0D0D0D] font-medium">
                {label}
              </span>
            )}
            {description && (
              <span className="font-auren-mono text-[10px] text-[#5A5852] tracking-tight">
                {description}
              </span>
            )}
          </div>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
