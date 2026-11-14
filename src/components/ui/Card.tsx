import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'subtle' | 'dark' | 'outline';
  hoverEffect?: boolean;
}

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  hoverEffect = false,
  children,
  className = '',
  ...props
}) => {
  const variantStyles = {
    default: 'bg-white border border-[#0D0D0D]/12 text-[#0D0D0D]',
    subtle: 'bg-[#FAF9F7] border border-[#0D0D0D]/10 text-[#0D0D0D]',
    dark: 'bg-[#0D0D0D] border border-white/15 text-[#F5F4F0]',
    outline: 'bg-transparent border border-[#0D0D0D]/20 text-[#0D0D0D]',
  };

  const hoverStyle = hoverEffect
    ? 'transition-all duration-200 hover:border-[#0D0D0D]/30 hover:shadow-sm'
    : '';

  return (
    <div
      className={`rounded-[3px] p-4 sm:p-5 relative ${variantStyles[variant]} ${hoverStyle} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <div className={`mb-3.5 pb-2.5 border-b border-[#0D0D0D]/10 flex flex-col gap-1 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <h3
    className={`font-auren-sans text-sm sm:text-base font-bold uppercase tracking-[-0.01em] text-[#0D0D0D] ${className}`}
    {...props}
  >
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <p className={`font-auren-mono text-[10px] sm:text-[11px] uppercase tracking-[0.08em] text-[#5A5852] ${className}`} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => <div className={className} {...props}>{children}</div>;
