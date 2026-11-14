import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'accent' | 'dark' | 'success' | 'warning' | 'danger';
  dot?: boolean;
  count?: string | number;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  dot = false,
  count,
  children,
  className = '',
  ...props
}) => {
  const variantStyles: Record<string, string> = {
    neutral: 'bg-white text-[#5A5852] border border-[#0D0D0D]/15',
    accent: 'bg-[#cee49f] text-[#0b0b0b] border border-[#b8d485]',
    dark: 'bg-[#0D0D0D] text-[#F5F4F0] border border-[#0D0D0D]',
    success: 'bg-[#F0F8F3] text-[#1E6641] border border-[rgba(30,102,65,0.25)]',
    warning: 'bg-[#FEF9EC] text-[#946800] border border-[rgba(148,104,0,0.25)]',
    danger: 'bg-[#FDF2F0] text-[#8E2A1E] border border-[rgba(142,42,30,0.25)]',
  };

  const dotStyles: Record<string, string> = {
    neutral: 'bg-[#5A5852]',
    accent: 'bg-[#0b0b0b]',
    dark: 'bg-[#cee49f]',
    success: 'bg-[#1E6641]',
    warning: 'bg-[#946800]',
    danger: 'bg-[#8E2A1E]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] font-auren-mono text-[10px] uppercase tracking-[0.08em] select-none ${
        variantStyles[variant] || variantStyles.neutral
      } ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-[1px] shrink-0 ${
            dotStyles[variant] || dotStyles.neutral
          }`}
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
      {count !== undefined && (
        <span className="text-[9px] opacity-75 font-semibold">[{count}]</span>
      )}
    </span>
  );
};
