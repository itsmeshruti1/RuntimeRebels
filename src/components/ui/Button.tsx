import React, { forwardRef } from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'pill' | 'ghost' | 'danger' | 'accent' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'pill' | 'icon';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      icon,
      iconPosition = 'left',
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-auren-mono uppercase tracking-[0.08em] transition-all duration-200 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D0D0D] focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed';

    const variantStyles: Record<string, string> = {
      primary:
        'bg-[#0D0D0D] text-[#F5F4F0] border border-[#0D0D0D] hover:bg-black/85 hover:-translate-y-px active:translate-y-0 active:bg-black',
      secondary:
        'bg-white text-[#0D0D0D] border border-[#0D0D0D]/20 hover:bg-[#0D0D0D] hover:text-[#F5F4F0] hover:border-[#0D0D0D] hover:-translate-y-px active:translate-y-0',
      outline:
        'bg-transparent text-[#0D0D0D] border border-[#0D0D0D]/25 hover:border-[#0D0D0D] hover:bg-black/5 hover:-translate-y-px active:translate-y-0',
      pill: 'bg-white/80 backdrop-blur-md text-[#0D0D0D] border border-[#0D0D0D]/20 rounded-[4px] hover:bg-[#0D0D0D] hover:text-[#F5F4F0] hover:-translate-y-px active:translate-y-0',
      ghost:
        'bg-transparent text-[#0D0D0D] border-transparent hover:bg-black/5 active:bg-black/10',
      danger:
        'bg-[#8E2A1E] text-white border border-[#8E2A1E] hover:bg-[#722218] hover:-translate-y-px active:translate-y-0',
      accent:
        'bg-[#cee49f] text-[#0b0b0b] border border-[#b8d485] font-semibold hover:brightness-95 hover:-translate-y-px active:translate-y-0',
    };

    const sizeStyles: Record<string, string> = {
      sm: 'text-[10px] px-2.5 py-1 gap-1.5 min-h-[26px]',
      md: 'text-[11px] px-3.5 py-2 gap-2 min-h-[34px]',
      lg: 'text-xs px-5 py-2.5 gap-2.5 min-h-[42px]',
      pill: 'text-[11px] px-3.5 py-1.5 rounded-[4px] gap-2 min-h-[28px]',
      icon: 'p-2 w-8 h-8 rounded-[4px]',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseStyles} ${variantStyles[variant] || variantStyles.secondary} ${
          sizeStyles[size] || sizeStyles.md
        } ${className}`}
        {...props}
      >
        {loading ? (
          <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          icon && iconPosition === 'left' && <span className="inline-flex shrink-0">{icon}</span>
        )}
        {children && <span>{children}</span>}
        {!loading && icon && iconPosition === 'right' && (
          <span className="inline-flex shrink-0">{icon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
