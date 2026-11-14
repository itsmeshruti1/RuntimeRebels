import React, { useEffect, useRef } from 'react';

interface SpiralRibbonCanvasProps {
  onClickRibbon?: () => void;
  activeCityName?: string;
  recoveryPct?: number;
}

export const SpiralRibbonCanvas: React.FC<SpiralRibbonCanvasProps> = ({
  onClickRibbon,
  activeCityName = 'Bengaluru',
  recoveryPct = 100,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;
    let time = 0;

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      targetMouseX = ((e.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
      targetMouseY = ((e.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    const render = () => {
      time += 0.008;
      mouseX += (targetMouseX - mouseX) * 0.06;
      mouseY += (targetMouseY - mouseY) * 0.06;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const cx = w * 0.5 + mouseX * 14;
      const cy = h * 0.48 + mouseY * 10;
      const baseScale = Math.min(w, h) * 0.34;

      // Draw 3D helical fluted ribbon turns (back-to-front painter's algorithm)
      const turns = 4.35;
      const totalSegments = 540;
      const ribbonHeight = baseScale * 0.24;
      const tiltX = 0.56 + mouseY * 0.08;
      const tiltZ = -0.36 + mouseX * 0.08;

      const cosZ = Math.cos(tiltZ);
      const sinZ = Math.sin(tiltZ);

      interface Quad {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        x3: number;
        y3: number;
        zDepth: number;
        nx: number;
        nz: number;
        t: number;
        idx: number;
      }

      const quads: Quad[] = [];

      for (let i = 0; i < totalSegments; i++) {
        const t0 = i / totalSegments;
        const t1 = (i + 1) / totalSegments;

        const theta0 = t0 * Math.PI * 2 * turns - time * 0.85;
        const theta1 = t1 * Math.PI * 2 * turns - time * 0.85;

        // Spiral radius grows outward with gentle organic wave
        const r0 = baseScale * (0.21 + 0.86 * Math.pow(t0, 0.88));
        const r1 = baseScale * (0.21 + 0.86 * Math.pow(t1, 0.88));

        // Vertical offset along helix axis
        const elev0 = (t0 - 0.5) * baseScale * 0.42;
        const elev1 = (t1 - 0.5) * baseScale * 0.42;

        // Local 3D coordinates before tilt
        const lx0 = Math.cos(theta0) * r0;
        const lz0 = Math.sin(theta0) * r0;
        const lx1 = Math.cos(theta1) * r1;
        const lz1 = Math.sin(theta1) * r1;

        const band0 = ribbonHeight * (0.52 + 0.48 * Math.sin(t0 * Math.PI));
        const band1 = ribbonHeight * (0.52 + 0.48 * Math.sin(t1 * Math.PI));

        const topY0 = elev0 - band0 * 0.5;
        const botY0 = elev0 + band0 * 0.5;
        const topY1 = elev1 - band1 * 0.5;
        const botY1 = elev1 + band1 * 0.5;

        // Project 3D to 2D with tiltX and tiltZ
        const proj = (x: number, y: number, z: number) => {
          const yTilted = y * Math.cos(tiltX) - z * Math.sin(tiltX);
          const zTilted = y * Math.sin(tiltX) + z * Math.cos(tiltX);
          const px = cx + (x * cosZ - yTilted * sinZ);
          const py = cy + (x * sinZ + yTilted * cosZ);
          return { px, py, pz: zTilted };
        };

        const p0 = proj(lx0, topY0, lz0);
        const p1 = proj(lx1, topY1, lz1);
        const p2 = proj(lx1, botY1, lz1);
        const p3 = proj(lx0, botY0, lz0);

        const midTheta = (theta0 + theta1) * 0.5;
        const nx = Math.cos(midTheta);
        const nz = Math.sin(midTheta);

        quads.push({
          x0: p0.px,
          y0: p0.py,
          x1: p1.px,
          y1: p1.py,
          x2: p2.px,
          y2: p2.py,
          x3: p3.px,
          y3: p3.py,
          zDepth: (p0.pz + p1.pz + p2.pz + p3.pz) * 0.25,
          nx,
          nz,
          t: t0,
          idx: i,
        });
      }

      // Sort back to front
      quads.sort((a, b) => a.zDepth - b.zDepth);

      // Draw subtle ground shadow beneath the spiral
      const shadowGrad = ctx.createRadialGradient(
        cx,
        cy + baseScale * 0.56,
        baseScale * 0.08,
        cx,
        cy + baseScale * 0.56,
        baseScale * 0.95
      );
      shadowGrad.addColorStop(0, 'rgba(18, 17, 15, 0.14)');
      shadowGrad.addColorStop(0.6, 'rgba(18, 17, 15, 0.05)');
      shadowGrad.addColorStop(1, 'rgba(18, 17, 15, 0)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.ellipse(cx, cy + baseScale * 0.56, baseScale * 0.92, baseScale * 0.26, tiltZ * 0.35, 0, Math.PI * 2);
      ctx.fill();

      for (const q of quads) {
        const isFrontFacing = q.nz > 0;
        const light = 0.5 + 0.5 * (q.nx * -0.45 + q.nz * 0.88);
        const flute = (q.idx % 3 === 0) ? 0.06 : 0;

        ctx.beginPath();
        ctx.moveTo(q.x0, q.y0);
        ctx.lineTo(q.x1, q.y1);
        ctx.lineTo(q.x2, q.y2);
        ctx.lineTo(q.x3, q.y3);
        ctx.closePath();

        if (isFrontFacing) {
          // Exterior graphite fluted surface
          const lum = Math.round(24 + light * 58 + flute * 35);
          const r = Math.min(255, lum + 8);
          const g = Math.min(255, lum + 10);
          const b = Math.min(255, lum + 6);
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        } else {
          // Interior pale green fluted surface
          const lum = Math.round(188 + light * 56 - flute * 22);
          const r = Math.min(252, lum + 2);
          const g = Math.min(252, lum + 10);
          const b = Math.min(235, lum - 24);
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        }
        ctx.fill();

        // Subtle fluted vertical rib line every 2 segments
        if (q.idx % 2 === 0) {
          ctx.strokeStyle = isFrontFacing
            ? 'rgba(255, 248, 235, 0.16)'
            : 'rgba(35, 38, 31, 0.15)';
          ctx.lineWidth = 0.65;
          ctx.beginPath();
          ctx.moveTo(q.x0, q.y0);
          ctx.lineTo(q.x3, q.y3);
          ctx.stroke();
        }

        // Crisp rim highlight on top and bottom edges of the ribbon
        ctx.strokeStyle = isFrontFacing
          ? 'rgba(174, 198, 126, 0.35)'
          : 'rgba(35, 38, 31, 0.35)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(q.x0, q.y0);
        ctx.lineTo(q.x1, q.y1);
        ctx.moveTo(q.x3, q.y3);
        ctx.lineTo(q.x2, q.y2);
        ctx.stroke();
      }

      // Draw centered Auren "A" architectural monogram inside the spiral core
      ctx.save();
      ctx.translate(cx, cy - baseScale * 0.04);
      ctx.strokeStyle = '#101110';
      ctx.lineWidth = 1.6;
      const aSize = Math.max(14, baseScale * 0.075);
      ctx.beginPath();
      ctx.moveTo(0, -aSize);
      ctx.lineTo(-aSize * 0.72, aSize * 0.85);
      ctx.moveTo(0, -aSize);
      ctx.lineTo(aSize * 0.72, aSize * 0.85);
      // Curved crossbar of the Auren monogram
      ctx.moveTo(-aSize * 0.46, aSize * 0.25);
      ctx.quadraticCurveTo(0, -aSize * 0.05, aSize * 0.46, aSize * 0.25);
      ctx.stroke();
      ctx.restore();

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div
      onClick={onClickRibbon}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClickRibbon?.();
        }
      }}
      title={`Click to open ReverseResilia Workbench (${activeCityName} · ${recoveryPct.toFixed(0)}% Service)`}
      className="relative w-full h-[360px] sm:h-[430px] md:h-[500px] flex items-center justify-center cursor-pointer group select-none"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-[#0D0D0D]/90 text-[#F5F4F0] font-auren-mono text-[10px] tracking-[0.14em] uppercase px-3 py-1.5 rounded">
        {activeCityName} Corridor · {recoveryPct.toFixed(0)}% Recovery · Click to Configure
      </div>
    </div>
  );
};
