import React from 'react';

export interface NoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  action?: React.ReactNode;
}

export const Notice: React.FC<NoticeProps> = ({
  variant = 'info',
  title,
  action,
  children,
  className = '',
  ...props
}) => {
  const variantStyles = {
    info: 'bg-white border-[#0D0D0D]/20 text-[#0D0D0D]',
    warning: 'bg-[#FEF9EC] border-[#946800]/30 text-[#4E3204]',
    danger: 'bg-[#FDF2F0] border-[#8E2A1E]/30 text-[#8E2A1E]',
    success: 'bg-[#F0F8F3] border-[#1E6641]/30 text-[#14382B]',
  };

  const iconStyles = {
    info: 'bg-[#0D0D0D] text-white',
    warning: 'bg-[#946800] text-white',
    danger: 'bg-[#8E2A1E] text-white',
    success: 'bg-[#1E6641] text-white',
  };

  const marker = {
    info: 'i',
    warning: '!',
    danger: '×',
    success: '✓',
  }[variant];

  return (
    <div
      role="status"
      className={`p-3.5 sm:p-4 border rounded-[3px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-auren-mono text-xs ${variantStyles[variant]} ${className}`}
      {...props}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`w-4 h-4 rounded-[1px] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${iconStyles[variant]}`}
          aria-hidden="true"
        >
          {marker}
        </span>
        <div className="flex flex-col gap-0.5">
          {title && (
            <span className="font-bold tracking-[0.06em] uppercase">
              {title}
            </span>
          )}
          <div className="text-[11px] leading-relaxed opacity-90">{children}</div>
        </div>
      </div>
      {action && <div className="shrink-0 self-end sm:self-center">{action}</div>}
    </div>
  );
};
