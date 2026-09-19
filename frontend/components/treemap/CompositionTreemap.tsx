"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { assetSurface } from "@/lib/assetColor";
import { StockLogo } from "@/components/ui/StockLogo";
import styles from "./CompositionTreemap.module.css";

export type TreemapItem = {
  id: string;
  symbol: string;
  weight: number;
  /** Overrides the default "NN%" label. */
  valueLabel?: string;
};

type Size = { width: number; height: number };
type Rect = { x: number; y: number; width: number; height: number };
type Tile<T> = T & Rect;
type Sized<T> = { item: T; sourceIndex: number; area: number };

const byId = <T extends TreemapItem>(a: { item: T; sourceIndex: number }, b: { item: T; sourceIndex: number }) =>
  a.item.id !== undefined && b.item.id !== undefined ? String(a.item.id).localeCompare(String(b.item.id)) : a.sourceIndex - b.sourceIndex;

function worst<T>(row: Sized<T>[], side: number) {
  if (row.length === 0 || side <= 0) return Infinity;
  const sum = row.reduce((s, r) => s + r.area, 0);
  const max = Math.max(...row.map((r) => r.area));
  const min = Math.min(...row.map((r) => r.area));
  return sum <= 0 || min <= 0 ? Infinity : Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

function layoutRow<T>(row: Sized<T>[], rect: Rect, out: Tile<T>[]) {
  const sum = row.reduce((s, r) => s + r.area, 0);
  if (rect.width >= rect.height) {
    const width = rect.height > 0 ? sum / rect.height : 0;
    let y = rect.y;
    for (const r of row) {
      const height = width > 0 ? r.area / width : 0;
      out.push({ ...r.item, x: rect.x, y, width, height });
      y += height;
    }
    rect.x += width;
    rect.width = Math.max(0, rect.width - width);
    return;
  }
  const height = rect.width > 0 ? sum / rect.width : 0;
  let x = rect.x;
  for (const r of row) {
    const width = height > 0 ? r.area / height : 0;
    out.push({ ...r.item, x, y: rect.y, width, height });
    x += width;
  }
  rect.y += height;
  rect.height = Math.max(0, rect.height - height);
}

/** Equal weights get an even grid whose cells are as square as possible. */
function evenGrid<T extends TreemapItem>(items: T[], rect: Rect): Tile<T>[] | null {
  if (items.length < 2) return null;
  const first = items[0].weight;
  const tolerance = 1e-8 * Math.max(1, Math.abs(first));
  if (!items.every((i) => Math.abs(i.weight - first) <= tolerance)) return null;
  let rows = 1;
  let best = Infinity;
  for (let r = 1; r <= items.length; r += 1) {
    if (items.length % r !== 0) continue;
    const cols = items.length / r;
    const skew = Math.abs(Math.log(rect.width / cols / (rect.height / r)));
    if (skew < best) {
      rows = r;
      best = skew;
    }
  }
  const cols = items.length / rows;
  const w = rect.width / cols;
  const h = rect.height / rows;
  return items
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .sort(byId)
    .map(({ item }, i) => ({ ...item, x: rect.x + (i % cols) * w, y: rect.y + Math.floor(i / cols) * h, width: w, height: h }));
}

function squarify<T extends TreemapItem>(items: T[], rect: Rect): Tile<T>[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ ...items[0], ...rect }];
  const grid = evenGrid(items, rect);
  if (grid) return grid;
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0 || rect.width <= 0 || rect.height <= 0) return [];
  const scale = (rect.width * rect.height) / total;
  const queue: Sized<T>[] = items
    .map((item, sourceIndex) => ({ item, sourceIndex, area: item.weight * scale }))
    .sort((a, b) => b.area - a.area || byId(a, b));
  const free = { ...rect };
  const out: Tile<T>[] = [];
  let row: Sized<T>[] = [];
  while (queue.length > 0) {
    const next = queue[0];
    const side = Math.min(free.width, free.height);
    if (row.length === 0 || worst([...row, next], side) <= worst(row, side)) row.push(queue.shift()!);
    else {
      layoutRow(row, free, out);
      row = [];
    }
  }
  if (row.length > 0) layoutRow(row, free, out);
  return out;
}

// One shared observer for every treemap on the page.
const callbacks = new Map<Element, (size: Size) => void>();
let observer: ResizeObserver | null = null;

export function CompositionTreemap<T extends TreemapItem>({
  items,
  compact = false,
  className = "",
  label = "Basket composition",
  selectedId,
  onSelect,
  selectLabel,
}: {
  items: T[];
  compact?: boolean;
  className?: string;
  label?: string;
  selectedId?: string;
  onSelect?: (id: string) => void;
  selectLabel?: (tile: Tile<T>) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 100, height: 100 });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = (next: Size) =>
      setSize((prev) => (Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5 ? prev : next));
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) update({ width: rect.width, height: rect.height });
    observer ??= new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cb = callbacks.get(entry.target);
        if (!cb) continue;
        const r = entry.target.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) cb({ width: r.width, height: r.height });
      }
    });
    callbacks.set(node, update);
    observer.observe(node);
    return () => {
      observer?.unobserve(node);
      callbacks.delete(node);
      if (callbacks.size === 0) {
        observer?.disconnect();
        observer = null;
      }
    };
  }, []);

  const { tiles, total } = useMemo(() => {
    const weighted = items.filter((i) => Number.isFinite(i.weight) && i.weight > 0);
    const laid = squarify(weighted.length > 0 ? weighted : items.map((i) => ({ ...i, weight: 1 })), { x: 0, y: 0, ...size });
    return { tiles: laid, total: laid.reduce((s, t) => s + t.weight, 0) || 1 };
  }, [size, items]);

  const valueOf = (tile: Tile<T>) => tile.valueLabel ?? `${Math.round((tile.weight / total) * 100)}%`;
  const summary = tiles.map((t) => `${t.symbol} ${valueOf(t)}`).join(", ");

  return (
    <div
      ref={ref}
      className={`${styles.root} ${compact ? styles.compact : ""} ${className}`.trim()}
      role={onSelect ? "group" : "img"}
      aria-label={`${label}: ${summary}`}
    >
      {tiles.map((tile) => {
        const surface = assetSurface(tile.symbol);
        const style = {
          left: `${(tile.x / size.width) * 100}%`,
          top: `${(tile.y / size.height) * 100}%`,
          width: `${(tile.width / size.width) * 100}%`,
          height: `${(tile.height / size.height) * 100}%`,
          "--tile-color": surface.background,
          "--tile-ink": surface.foreground,
        } as CSSProperties;
        const inner = (
          <div className={styles.tileInner}>
            <span className={styles.logo}>
              <StockLogo sym={tile.symbol} size={compact ? 18 : 24} />
            </span>
            <span className={styles.symbol}>{tile.symbol}</span>
            <span className={styles.value}>{valueOf(tile)}</span>
          </div>
        );
        return onSelect ? (
          <button
            key={tile.id}
            type="button"
            className={styles.tile}
            style={style}
            data-selected={selectedId === tile.id || undefined}
            aria-pressed={selectedId === tile.id}
            aria-label={selectLabel?.(tile) ?? `Adjust ${tile.symbol}, ${valueOf(tile)} of basket`}
            onClick={() => onSelect(tile.id)}
          >
            {inner}
          </button>
        ) : (
          <div key={tile.id} className={styles.tile} aria-hidden="true" style={style}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
