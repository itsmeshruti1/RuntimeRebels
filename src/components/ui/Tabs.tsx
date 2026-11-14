import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: string | number;
  tag?: string;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  variant?: 'pills' | 'segmented';
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  activeId,
  onChange,
  className = '',
  variant = 'pills',
}) => {
  if (variant === 'segmented') {
    return (
      <div
        className={`grid grid-cols-2 sm:grid-cols-5 border border-[#0D0D0D]/15 bg-white ${className}`}
        role="tablist"
      >
        {items.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              className={`p-3.5 text-left border-b sm:border-b-0 sm:border-r last:border-r-0 border-[#0D0D0D]/12 transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#0D0D0D] text-[#F5F4F0]'
                  : 'bg-white text-[#0D0D0D] hover:bg-[#F9F9F7]'
              }`}
            >
              <div className="flex items-center justify-between font-auren-mono text-[10px] tracking-[0.12em] uppercase opacity-75">
                <span>{tab.tag || tab.id}</span>
                {tab.count !== undefined && <span>{tab.count}</span>}
              </div>
              <div className="mt-1 font-auren-sans text-sm md:text-base font-bold tracking-[-0.01em] uppercase">
                {tab.label}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} role="tablist">
      {items.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[4px] font-auren-mono text-[11px] uppercase tracking-[0.08em] transition-all cursor-pointer ${
              isActive
                ? 'bg-[#0D0D0D] text-[#F5F4F0] border border-[#0D0D0D]'
                : 'bg-white text-[#5A5852] border border-[#0D0D0D]/15 hover:border-[#0D0D0D] hover:text-[#0D0D0D]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-[1px] transition-colors ${
                isActive ? 'bg-[#cee49f]' : 'bg-[#0D0D0D]/30'
              }`}
              aria-hidden="true"
            />
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className="text-[9px] opacity-75 font-semibold">[{tab.count}]</span>
            )}
          </button>
        );
      })}
    </div>
  );
};
