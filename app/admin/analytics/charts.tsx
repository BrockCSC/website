import type { DayCount } from "@/lib/api";
import type { CSSProperties } from "react";
import { useCrosshair, useHighlight } from "./pointer";

const PLOT_W = 600;
const PLOT_H = 160;
const TICKS = 5;

const SEGMENT_OPACITY = [1, 0.68, 0.45, 0.3, 0.18];

export const formatDay = (day: string) =>
  new Date(`${day}T00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

export const plural = (count: number, noun: string) =>
  `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;

const share = (value: number, total: number) => {
  const percent = total > 0 ? (value / total) * 100 : 0;
  return percent > 0 && percent < 1 ? "<1%" : `${Math.round(percent)}%`;
};

// Centres on `fraction` of the nearest @container, but never past either edge.
const pinned = (fraction: number): CSSProperties => ({
  transform: `translateX(clamp(0px, calc(${(fraction * 100).toFixed(2)}cqw - 50%), calc(100cqw - 100%)))`,
});

const Readout = ({
  value,
  detail,
  visible,
  className = "",
  style,
}: {
  value: string;
  detail: string;
  visible: boolean;
  className?: string;
  style?: CSSProperties;
}) => (
  <div
    aria-hidden
    className={`pointer-events-none absolute left-0 z-10 whitespace-nowrap rounded-[8px] border-2 border-line bg-ink px-2 py-0.5 text-xs text-surface shadow-brut-sm transition-[transform,opacity] duration-[var(--dur-fast)] ease-smooth ${
      visible ? "opacity-100" : "opacity-0"
    } ${className}`}
    style={style}
  >
    <span className="font-extrabold tabular-nums">{value}</span>
    <span className="opacity-75"> · {detail}</span>
  </div>
);

export const TrendChart = ({
  points,
  unit,
}: {
  points: DayCount[];
  unit: string;
}) => {
  const { index, visible, bind } = useCrosshair(points.length);
  const peak = Math.max(0, ...points.map((point) => point.count));
  const max = Math.max(1, peak);
  const last = Math.max(points.length - 1, 1);
  const x = (i: number) => i / last;
  const y = (count: number) =>
    (PLOT_H - 4 - (count / max) * (PLOT_H - 12)) / PLOT_H;
  const line = points
    .map(
      (point, i) =>
        `${i ? "L" : "M"}${(x(i) * PLOT_W).toFixed(1)} ${(y(point.count) * PLOT_H).toFixed(1)}`,
    )
    .join(" ");
  const ticks = [
    ...new Set(
      Array.from({ length: TICKS }, (_, k) =>
        Math.round((k * (points.length - 1)) / (TICKS - 1)),
      ),
    ),
  ];
  const point = points[index];
  const readout = point && {
    value: plural(point.count, unit),
    detail: formatDay(point.day),
  };
  const at = { left: `${x(index) * 100}%` };

  return (
    <div
      {...bind}
      role="group"
      aria-roledescription="chart"
      aria-label={`${unit[0].toUpperCase()}${unit.slice(1)}s per day, peaking at ${plural(peak, unit)}. Use the arrow keys to read each day.`}
      className="@container relative touch-pan-y select-none rounded-[12px]"
    >
      <div className="relative h-36 sm:h-44">
        <svg
          viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full text-brand"
          aria-hidden
        >
          {[0.25, 0.5, 0.75].map((fraction) => (
            <line
              key={fraction}
              className="text-line"
              x1={0}
              x2={PLOT_W}
              y1={PLOT_H * fraction}
              y2={PLOT_H * fraction}
              stroke="currentColor"
              strokeOpacity={0.2}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path
            d={`${line} L${PLOT_W} ${PLOT_H} L0 ${PLOT_H} Z`}
            fill="currentColor"
            className="transition-[fill-opacity] duration-[var(--dur)] ease-smooth"
            style={{ fillOpacity: visible ? 0.2 : 0.12 }}
          />
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          aria-hidden
          className={`pointer-events-none absolute top-0 -bottom-2 w-0 -translate-x-1/2 border-l-2 border-dashed border-ink/60 transition-[left,opacity] duration-[var(--dur-fast)] ease-smooth ${
            visible ? "opacity-100" : "opacity-0"
          }`}
          style={at}
        />
        {point && (
          <div
            aria-hidden
            className={`pointer-events-none absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center transition-[left,top,opacity,scale] duration-[var(--dur-fast)] ease-smooth ${
              visible ? "scale-100 opacity-100" : "scale-50 opacity-0"
            }`}
            style={{ ...at, top: `${y(point.count) * 100}%` }}
          >
            <span className="absolute inset-0 rounded-full bg-brand/20" />
            <span className="relative size-3.5 rounded-full border-2 border-line bg-brand ring-2 ring-surface" />
          </div>
        )}
      </div>

      <div className="relative mt-2 h-7 text-xs text-subtle">
        {ticks.map((tick, k) => (
          <span
            key={tick}
            className={`absolute top-1 left-0 whitespace-nowrap transition-opacity duration-[var(--dur-fast)] ease-smooth ${
              k === 0 || k === ticks.length - 1 || k === ticks.length >> 1
                ? ""
                : "hidden @sm:block"
            } ${visible ? "opacity-25" : ""}`}
            style={pinned(x(tick))}
          >
            {formatDay(points[tick].day)}
          </span>
        ))}
        {readout && (
          <Readout
            {...readout}
            visible={visible}
            className="top-0"
            style={pinned(x(index))}
          />
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {visible && readout ? `${readout.value}, ${readout.detail}` : ""}
      </p>
    </div>
  );
};

export const BarList = ({
  rows,
  total,
  of,
}: {
  rows: { label: string; value: number }[];
  total: number;
  of: string;
}) => {
  const { ref, active, target } = useHighlight<HTMLUListElement>();
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <ul ref={ref} className="-mx-2.5 -my-1.5 flex flex-col">
      {rows.map((row, index) => {
        const on = active === index;
        return (
          <li
            key={row.label}
            tabIndex={0}
            {...target(index)}
            className={`rounded-[12px] border-2 px-2 py-1.5 transition-[translate,background-color,border-color,box-shadow] duration-[var(--dur-fast)] ease-smooth ${
              on
                ? "-translate-y-0.5 border-line bg-surface shadow-brut-sm motion-reduce:translate-y-0"
                : "border-transparent"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-mono text-xs text-ink">
                {row.label}
              </span>
              <span className="flex shrink-0 items-baseline gap-2 text-xs tabular-nums">
                {on && (
                  <span className="animate-fade-in font-semibold text-subtle">
                    {share(row.value, total)} {of}
                  </span>
                )}
                <span
                  className={`font-bold transition-colors duration-[var(--dur-fast)] ease-smooth ${on ? "text-ink" : "text-subtle"}`}
                >
                  {row.value.toLocaleString()}
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-2.5 w-full rounded-full bg-tint">
              <div
                className={`h-full origin-left rounded-full bg-brand transition-[scale] duration-[var(--dur)] ease-smooth ${
                  on ? "scale-y-125" : ""
                }`}
                style={{ width: `${Math.max((row.value / max) * 100, 3)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export const SplitBar = ({
  segments,
  format = (value) => value.toLocaleString(),
}: {
  segments: { label: string; value: number }[];
  format?: (value: number) => string;
}) => {
  const { ref, active, target } = useHighlight<HTMLDivElement>();
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const widths = segments.map((segment) =>
    total > 0 ? (segment.value / total) * 100 : 0,
  );
  const parts = segments.map((segment, index) => ({
    ...segment,
    index,
    x: widths.slice(0, index).reduce((sum, width) => sum + width, 0),
    width: widths[index],
    opacity: SEGMENT_OPACITY[index] ?? 0.18,
  }));
  const current = active === null ? null : parts[active];
  const shown = parts.filter((part) => part.value > 0);

  return (
    <div ref={ref}>
      <div className="@container relative">
        <div
          aria-hidden
          className="flex h-4 w-full overflow-hidden rounded-full bg-tint"
        >
          {shown.map((part, position) => (
            <div
              key={part.label}
              {...target(part.index)}
              className={`h-full transition-shadow duration-[var(--dur-fast)] ease-smooth ${
                position ? "border-l-2 border-surface" : ""
              } ${active === part.index ? "shadow-[inset_0_0_0_2px_var(--ink)]" : ""}`}
              style={{
                width: `${part.width}%`,
                backgroundColor: `color-mix(in srgb, var(--brand) ${part.opacity * 100}%, transparent)`,
              }}
            />
          ))}
        </div>
        {current && (
          <Readout
            value={format(current.value)}
            detail={`${current.label} · ${share(current.value, total)}`}
            visible
            className="bottom-full mb-2 animate-fade-in"
            style={pinned((current.x + current.width / 2) / 100)}
          />
        )}
      </div>
      <ul className="-mx-2.5 mt-1.5 flex flex-wrap gap-x-1 gap-y-1">
        {parts.map((part) => {
          const on = active === part.index;
          return (
            <li
              key={part.label}
              tabIndex={0}
              {...target(part.index)}
              className={`flex items-center gap-2 rounded-[10px] border-2 px-2 py-1 text-sm transition-colors duration-[var(--dur-fast)] ease-smooth ${
                on ? "border-line bg-tint" : "border-transparent"
              }`}
            >
              <span
                className={`h-3 w-3 shrink-0 rounded-[3px] bg-brand transition-[scale] duration-[var(--dur-fast)] ease-smooth ${on ? "scale-125 motion-reduce:scale-100" : ""}`}
                style={{ opacity: part.opacity }}
              />
              <span className="text-subtle">{part.label}</span>
              <span className="font-bold tabular-nums text-ink">
                {format(part.value)}
              </span>
              <span className="sr-only">, {share(part.value, total)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
