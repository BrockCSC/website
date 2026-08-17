import type { DayCount } from "@/lib/api";

const PLOT_W = 600;
const PLOT_H = 160;

const SEGMENT_OPACITY = [1, 0.68, 0.45];

export const formatDay = (day: string) =>
  new Date(`${day}T00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

export const TrendChart = ({
  points,
  unit,
}: {
  points: DayCount[];
  unit: string;
}) => {
  const max = Math.max(1, ...points.map((point) => point.count));
  const step = points.length > 1 ? PLOT_W / (points.length - 1) : PLOT_W;
  const line = points
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${(index * step).toFixed(1)} ${(
          PLOT_H -
          4 -
          (point.count / max) * (PLOT_H - 12)
        ).toFixed(1)}`,
    )
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
      preserveAspectRatio="none"
      className="h-36 w-full text-brand sm:h-44"
      aria-label={`${unit} per day, peaking at ${max}`}
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
        fillOpacity={0.12}
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
      {points.map((point, index) => (
        <rect
          key={point.day}
          x={index * step - step / 2}
          y={0}
          width={step}
          height={PLOT_H}
          fill="transparent"
        >
          <title>{`${formatDay(point.day)}: ${point.count.toLocaleString()} ${unit}`}</title>
        </rect>
      ))}
    </svg>
  );
};

export const BarList = ({
  rows,
}: {
  rows: { label: string; value: number }[];
}) => {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate font-mono text-xs text-ink">
              {row.label}
            </span>
            <span className="shrink-0 text-xs font-bold tabular-nums text-subtle">
              {row.value.toLocaleString()}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 w-full rounded-full bg-tint">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${Math.max((row.value / max) * 100, 3)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

export const SplitBar = ({
  segments,
}: {
  segments: { label: string; value: number }[];
}) => {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const widths = segments.map((segment) =>
    total > 0 ? (segment.value / total) * 100 : 0,
  );
  const parts = segments.map((segment, index) => ({
    ...segment,
    x: widths.slice(0, index).reduce((sum, width) => sum + width, 0),
    width: widths[index],
    opacity: SEGMENT_OPACITY[index] ?? 0.45,
  }));

  return (
    <div>
      <svg
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        className="h-4 w-full overflow-hidden rounded-full bg-tint text-brand"
        aria-hidden
      >
        {parts.map((part) => (
          <rect
            key={part.label}
            x={part.x}
            y={0}
            width={part.width}
            height={10}
            fill="currentColor"
            fillOpacity={part.opacity}
          />
        ))}
        {parts.slice(1).map((part) => (
          <line
            key={part.label}
            className="text-surface"
            x1={part.x}
            x2={part.x}
            y1={0}
            y2={10}
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center gap-2 text-sm">
            <span
              className="h-3 w-3 shrink-0 rounded-[3px] bg-brand"
              style={{ opacity: part.opacity }}
            />
            <span className="text-subtle">{part.label}</span>
            <span className="font-bold tabular-nums text-ink">
              {part.value.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
