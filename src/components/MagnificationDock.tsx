/**
 * MagnificationDock Component
 *
 * macOS-inspired dock with spring-physics magnification and animated tooltips,
 * adapted to the ReverseResilia / Auren palette and sticky header navigation.
 */

import {
  AnimatePresence,
  motion,
  MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
  type SpringOptions,
} from 'motion/react';
import React, { Children, cloneElement, useEffect, useMemo, useRef, useState } from 'react';

export type DockItemData = {
  icon: React.ReactNode;
  label: React.ReactNode;
  ariaLabel?: string;
  onClick: () => void;
  className?: string;
  isActive?: boolean;
  dividerBefore?: boolean;
};

export type DockProps = {
  items: DockItemData[];
  className?: string;
  distance?: number;
  panelHeight?: number;
  baseItemSize?: number;
  dockHeight?: number;
  magnification?: number;
  spring?: SpringOptions;
  tooltipPosition?: 'top' | 'bottom';
  ariaLabel?: string;
};

type DockItemProps = {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  isActive?: boolean;
  mouseX: MotionValue<number>;
  spring: SpringOptions;
  distance: number;
  baseItemSize: number;
  magnification: number;
};

function DockItem({
  children,
  className = '',
  onClick,
  ariaLabel,
  isActive = false,
  mouseX,
  spring,
  distance,
  magnification,
  baseItemSize,
}: DockItemProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const isHovered = useMotionValue(0);

  const mouseDistance = useTransform(mouseX, (val) => {
    const rect = ref.current?.getBoundingClientRect() ?? {
      x: 0,
      width: baseItemSize,
    };
    return val - rect.x - rect.width / 2;
  });

  const targetSize = useTransform(
    mouseDistance,
    [-distance, 0, distance],
    [baseItemSize, magnification, baseItemSize]
  );
  const size = useSpring(targetSize, spring);

  return (
    <motion.button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      aria-pressed={isActive || undefined}
      style={{
        width: size,
        height: size,
      }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={() => isHovered.set(1)}
      onBlur={() => isHovered.set(0)}
      onClick={onClick}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full border transition-colors cursor-pointer ${
        isActive
          ? 'bg-[#101110] text-white border-[#101110] shadow-md'
          : 'bg-white/95 text-[#101110] border-[#101110]/15 shadow-sm hover:border-[#cee49f]'
      } ${className}`}
    >
      {Children.map(children, (child) =>
        React.isValidElement(child)
          ? cloneElement(
              child as React.ReactElement<{ isHovered?: MotionValue<number> }>,
              { isHovered }
            )
          : child
      )}
    </motion.button>
  );
}

type DockLabelProps = {
  className?: string;
  children: React.ReactNode;
  isHovered?: MotionValue<number>;
  position?: 'top' | 'bottom';
};

function DockLabel({
  children,
  className = '',
  isHovered,
  position = 'top',
}: DockLabelProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isHovered) return;
    const unsubscribe = isHovered.on('change', (latest) => {
      setIsVisible(latest === 1);
    });
    return () => unsubscribe();
  }, [isHovered]);

  const initialY = position === 'bottom' ? -4 : 0;
  const animateY = position === 'bottom' ? 6 : -10;
  const posClass = position === 'bottom' ? 'top-full mt-1.5' : '-top-8';

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: initialY }}
          animate={{ opacity: 1, y: animateY }}
          exit={{ opacity: 0, y: initialY }}
          transition={{ duration: 0.18 }}
          className={`${posClass} ${className} pointer-events-none absolute left-1/2 z-50 w-fit whitespace-nowrap rounded-md border border-[#101110]/20 bg-[#101110] px-2.5 py-1 font-auren-mono text-[10px] uppercase tracking-[0.08em] text-[#F5F5F1] shadow-md`}
          role="tooltip"
          style={{ x: '-50%' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type DockIconProps = {
  className?: string;
  children: React.ReactNode;
  isHovered?: MotionValue<number>;
};

function DockIcon({ children, className = '' }: DockIconProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      {children}
    </div>
  );
}

export function MagnificationDock({
  items,
  className = '',
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = 52,
  distance = 140,
  panelHeight = 44,
  dockHeight = 56,
  baseItemSize = 34,
  tooltipPosition = 'top',
  ariaLabel = 'Navigation dock',
}: DockProps) {
  const mouseX = useMotionValue(Infinity);
  const isHovered = useMotionValue(0);

  const maxHeight = useMemo(
    () => Math.max(dockHeight, magnification + 8),
    [dockHeight, magnification]
  );
  const heightRow = useTransform(isHovered, [0, 1], [panelHeight, maxHeight]);
  const height = useSpring(heightRow, spring);

  return (
    <motion.div
      style={{ height, scrollbarWidth: 'none' }}
      className="flex max-w-full items-center justify-center overflow-visible"
    >
      <motion.div
        onMouseMove={(e) => {
          isHovered.set(1);
          mouseX.set(e.clientX);
        }}
        onMouseLeave={() => {
          isHovered.set(0);
          mouseX.set(Infinity);
        }}
        className={`flex w-fit items-center gap-2 rounded-full border border-[#101110]/15 bg-[#e5e7dd]/80 px-3 shadow-sm backdrop-blur-md ${className}`}
        style={{ height: panelHeight }}
        role="toolbar"
        aria-label={ariaLabel}
      >
        {items.map((item, index) => (
          <React.Fragment key={index}>
            {item.dividerBefore && (
              <span
                aria-hidden="true"
                className="mx-1 h-4 w-px bg-[#101110]/20"
              />
            )}
            <DockItem
              onClick={item.onClick}
              ariaLabel={
                item.ariaLabel ??
                (typeof item.label === 'string' ? item.label : undefined)
              }
              isActive={item.isActive}
              className={item.className}
              mouseX={mouseX}
              spring={spring}
              distance={distance}
              magnification={magnification}
              baseItemSize={baseItemSize}
            >
              <DockIcon>{item.icon}</DockIcon>
              <DockLabel position={tooltipPosition}>{item.label}</DockLabel>
            </DockItem>
          </React.Fragment>
        ))}
      </motion.div>
    </motion.div>
  );
}

export default MagnificationDock;
