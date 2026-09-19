"use client";

import {
  memo,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from "react";
import { calendarDayYear, intradayStamp, LOCALE } from "@/lib/format";
import { axisTicks, pathFor } from "@/lib/navHistory";
import type { NavHistory } from "@/lib/data/types";
import styles from "./Chart.module.css";

const WIDTH = 900;
const DAY = 864e5;

const money = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function Readout({
  anchor,
  x,
  y,
  date,
  value,
}: {
  anchor: RefObject<SVGSVGElement | null>;
  x: number;
  y: number;
  date: string;
  value: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const bubble = ref.current;
    const plot = anchor.current;
    if (!bubble || !plot) return;
    bubble.showPopover();
    const place = () => {
      const rect = plot.getBoundingClientRect();
      const px = rect.left + (rect.width * x) / 100;
      const py = rect.top + (rect.height * y) / 100;
      const { width, height } = bubble.getBoundingClientRect();
      const root = document.documentElement;
      const left = Math.max(8, Math.min(px - width / 2, root.clientWidth - width - 8));
      const above = py - height - 10;
      const top = Math.max(8, Math.min(above >= 8 ? above : py + 10, root.clientHeight - height - 8));
      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    const observer = new ResizeObserver(place);
    observer.observe(plot);
    observer.observe(bubble);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      observer.disconnect();
    };
  }, [anchor, x, y, date, value]);

  return (
    <span ref={ref} popover="manual" className={styles.readout} aria-hidden="true">
      <span>{date}</span>
      <strong>{money.format(value)}</strong>
    </span>
  );
}

export const Chart = memo(function Chart({
  history,
  height,
  grid,
  axis,
  weight = 1.5,
  fill,
  className = "",
}: {
  history: NavHistory;
  height: number;
  grid?: boolean;
  axis?: boolean;
  weight?: number;
  fill?: boolean;
  className?: string;
}) {
  const { points, change, supported, loading } = history;
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientId = `chart-fill-${useId().replaceAll(":", "")}`;

  const { line, area, labels, coordinates, intraday } = useMemo(() => {
    if (loading || !supported || points.length < 2) {
      return { line: "", area: "", labels: [] as string[], coordinates: [] as { x: number; y: number }[], intraday: false };
    }
    const values = points.map(([, v]) => v);
    const pad = grid ? 8 : 4;
    const paths = pathFor(values, WIDTH, height, pad);
    const min = Math.min(...values);
    const span = Math.max(...values) - min || 1;
    const step = WIDTH / (values.length - 1);
    return {
      ...paths,
      labels: axis ? axisTicks(points) : [],
      coordinates: values.map((v, i) => ({ x: i * step, y: pad + (1 - (v - min) / span) * (height - 2 * pad) })),
      intraday: points.some((p, i) => i > 0 && p[0] - points[i - 1][0] < DAY),
    };
  }, [axis, grid, height, loading, points, supported]);

  const up = (change ?? 0) >= 0;
  const stroke = up ? "var(--color-status-positive)" : "var(--color-status-negative)";
  const gridLines = grid ? [0, height / 3, (height / 3) * 2, height - 1] : [];
  const point = hover === null ? undefined : points[hover];
  const coord = hover === null ? undefined : coordinates[hover];
  const date = point ? (intraday ? intradayStamp(point[0]) : calendarDayYear(point[0])) : "";
  const hx = coord ? (coord.x / WIDTH) * 100 : 0;
  const hy = coord ? (coord.y / height) * 100 : 0;

  const track = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || points.length < 2) return;
      const index = Math.round(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * (points.length - 1));
      setHover((prev) => (prev === index ? prev : index));
    },
    [points.length],
  );

  return (
    <figure
      className={`${styles.frame} ${fill ? styles.fill : ""} ${className}`.trim()}
      style={{ "--chart-height": `${height}px` } as CSSProperties}
      data-axis={axis || undefined}
    >
      <div className={styles.plot}>
        {loading ? (
          <span className={`sk ${styles.skeleton}`} aria-hidden />
        ) : !supported || points.length < 2 ? (
          <div className={styles.empty}>{supported ? "No price history in this range." : "Price history unavailable."}</div>
        ) : (
          <>
            <svg
              ref={svgRef}
              className={`${styles.svg} ${styles.interactive}`}
              viewBox={`0 0 ${WIDTH} ${height}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`NAV history, ${up ? "up" : "down"} ${Math.abs((change ?? 0) * 100).toFixed(2)}% over the window`}
              onPointerDown={track}
              onPointerMove={track}
              onPointerLeave={() => setHover(null)}
              onPointerCancel={() => setHover(null)}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={stroke} stopOpacity=".16" />
                  <stop offset="1" stopColor={stroke} stopOpacity=".025" />
                </linearGradient>
              </defs>
              {gridLines.map((y) => (
                <line key={y} className={styles.grid} x1="0" y1={y} x2={WIDTH} y2={y} vectorEffect="non-scaling-stroke" />
              ))}
              <path d={area} fill={`url(#${gradientId})`} />
              <path
                d={line}
                fill="none"
                stroke={stroke}
                strokeWidth={weight}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {point && coord && (
              <div
                className={styles.inspector}
                style={{ "--chart-hover-x": `${hx}%`, "--chart-hover-y": `${hy}%`, "--chart-hover-color": stroke } as CSSProperties}
                aria-hidden="true"
              >
                <span className={styles.toolline} />
                <span className={styles.point} />
                <Readout anchor={svgRef} x={hx} y={hy} date={date} value={point[1]} />
              </div>
            )}
          </>
        )}
      </div>
      {axis && (
        <div className={styles.axis} aria-hidden>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i}>{labels[i] ?? ""}</span>
          ))}
        </div>
      )}
    </figure>
  );
});

export const Change = memo(function Change({ value, suffix }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="c-muted">—</span>;
  const up = value >= 0;
  return (
    <span className={up ? "c-positive" : "c-negative"} style={{ fontWeight: 650 }}>
      {up ? "+" : ""}
      {(100 * value).toFixed(2)}%
      {suffix && (
        <span className="c-muted" style={{ fontWeight: 500 }}>
          {" "}
          {suffix}
        </span>
      )}
    </span>
  );
});
