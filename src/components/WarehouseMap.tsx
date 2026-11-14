import React, { useState } from 'react';
import type { Warehouse } from '../types/recovery';

const WIDTH = 720;
const HEIGHT = 390;
const TILE_SIZE = 256;

function project(lat: number, lon: number) {
  const radians = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
  return { x: (lon + 180) / 360, y: (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 };
}

interface WarehouseMapProps {
  city: string;
  warehouses: Warehouse[];
  isOutage: (id: string) => boolean;
  onToggle: (id: string) => void;
}

export function WarehouseMap({ city, warehouses, isOutage, onToggle }: WarehouseMapProps) {
  const [failedTiles, setFailedTiles] = useState<Set<string>>(() => new Set());
  if (!warehouses.length) return <p>No warehouses in {city}.</p>;

  const points = warehouses.map((wh) => ({ wh, ...project(wh.lat, wh.lon) }));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs),
    right = Math.max(...xs);
  const top = Math.min(...ys),
    bottom = Math.max(...ys);
  const fit = Math.min(
    (WIDTH - 160) / Math.max(1e-5, right - left),
    (HEIGHT - 96) / Math.max(1e-5, bottom - top),
  );
  const zoom = Math.max(0, Math.min(14, Math.floor(Math.log2(fit / TILE_SIZE))));
  const tileCount = 2 ** zoom;
  const worldSize = tileCount * TILE_SIZE;
  const originX = ((left + right) / 2) * worldSize - WIDTH / 2;
  const originY = ((top + bottom) / 2) * worldSize - HEIGHT / 2;
  const tiles = [];
  for (
    let y = Math.max(0, Math.floor(originY / TILE_SIZE));
    y < Math.min(tileCount, Math.ceil((originY + HEIGHT) / TILE_SIZE));
    y++
  ) {
    for (
      let x = Math.floor(originX / TILE_SIZE);
      x < Math.ceil((originX + WIDTH) / TILE_SIZE);
      x++
    ) {
      const wrappedX = ((x % tileCount) + tileCount) % tileCount;
      const url = `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`;
      tiles.push({ x: x * TILE_SIZE - originX, y: y * TILE_SIZE - originY, url });
    }
  }

  return (
    <section aria-label={`${city} warehouse map`}>
      <header className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <h3 className="font-auren-sans text-xl font-bold">{city} warehouses</h3>
        <div className="flex gap-3 text-xs">
          <span>
            <span aria-hidden="true" className="text-[#14382B]">
              ■
            </span>{' '}
            Active
          </span>
          <span>
            <span aria-hidden="true" className="text-[#8E2A1E]">
              ■
            </span>{' '}
            Outage
          </span>
        </div>
      </header>
      <div className="relative aspect-[720/390] overflow-hidden border border-black/15 bg-[#EFECE6]">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
        >
          {tiles.map((tile) => (
            <image
              key={`${tile.x},${tile.y},${tile.url}`}
              href={tile.url}
              x={tile.x}
              y={tile.y}
              width={TILE_SIZE}
              height={TILE_SIZE}
              onError={() => setFailedTiles((previous) => new Set(previous).add(tile.url))}
            />
          ))}
        </svg>
        {points.map(({ wh, x, y }) => {
          const outage = isOutage(wh.id);
          return (
            <button
              key={wh.id}
              type="button"
              aria-label={`${wh.name} (${wh.id}), toggle outage`}
              aria-pressed={outage}
              title={`${wh.name} · ${outage ? 'Outage' : 'Active'}`}
              onClick={() => onToggle(wh.id)}
              className="absolute z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center focus-visible:z-20"
              style={{
                left: `${((x * worldSize - originX) / WIDTH) * 100}%`,
                top: `${((y * worldSize - originY) / HEIGHT) * 100}%`,
              }}
            >
              <span
                aria-hidden="true"
                className="h-4 w-4 border-2 border-white shadow"
                style={{ background: outage ? '#8E2A1E' : '#14382B' }}
              />
              <span
                aria-hidden="true"
                className="absolute top-[24px] whitespace-nowrap rounded-sm bg-white/95 px-1 font-auren-mono text-[10px] font-bold text-black shadow-sm"
              >
                {wh.id}
              </span>
            </button>
          );
        })}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-0 right-0 z-20 bg-white/90 px-1 text-[10px] text-black underline"
        >
          © OpenStreetMap contributors
        </a>
      </div>
      <p className="mt-2 text-xs">Select a warehouse to toggle its outage.</p>
      {tiles.some((tile) => failedTiles.has(tile.url)) && (
        <p role="status" className="mt-1 text-xs">
          Some street map tiles could not load. Warehouse markers are still available.
        </p>
      )}
    </section>
  );
}
