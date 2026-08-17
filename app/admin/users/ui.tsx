import { cn } from "@/lib/utils";

export const fieldOn = (bg: "bg-raised" | "bg-surface") =>
  `w-full rounded-[10px] border-2 border-line ${bg} px-3 py-2 text-sm text-ink outline-none placeholder:text-subtle focus:border-brand`;

export const field = fieldOn("bg-raised");

export const labelClass = "mb-1 block text-sm font-bold text-ink";

export function Label({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor: string;
}) {
  return (
    <label className={labelClass} htmlFor={htmlFor}>
      {children}
    </label>
  );
}

export function Pill({
  tone = "flat",
  children,
}: {
  tone?: "flat" | "accent";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full border-2 border-line px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        tone === "accent" ? "bg-brand text-brand-ink" : "bg-tint text-ink",
      )}
    >
      {children}
    </span>
  );
}

export type PanelProps = {
  title: string;
  note?: string;
  action?: React.ReactNode;
  /** Brand-coloured heading. */
  accent?: boolean;
  tone?: "danger";
  smallNote?: boolean;
  children: React.ReactNode;
};

export function Panel({
  title,
  note,
  action,
  accent,
  tone,
  smallNote,
  children,
}: PanelProps) {
  return (
    <section
      className={`animate-fade-in rounded-[20px] border-2 border-line ${
        tone ? "bg-tint" : "bg-surface"
      } p-5 shadow-brut`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            className={`text-sm font-extrabold uppercase tracking-wide ${
              accent ? "text-brand" : "text-ink"
            }`}
          >
            {title}
          </h2>
          {note && (
            <p
              className={`mt-1 ${smallNote ? "text-xs" : "text-sm"} text-subtle`}
            >
              {note}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Rows({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
      {items.map(([label, value]) => (
        <div className="contents" key={label}>
          <dt className="font-semibold text-subtle">{label}</dt>
          <dd className="min-w-0 break-words font-semibold text-ink">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="animate-rise-in rounded-[10px] border-2 border-line bg-tint px-3 py-2 text-sm font-semibold text-ink">
      {children}
    </p>
  );
}
