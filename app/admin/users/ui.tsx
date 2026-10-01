import { cn } from "@/lib/utils";

// 16px on touch so iOS doesn't zoom into the field on focus. Disabled fields
// read as static (dashed, no fill) on touch and below lg only; wide
// fine-pointer desktop keeps its look.
export const fieldOn = (bg: "bg-raised" | "bg-surface") =>
  `w-full rounded-[10px] border-2 border-[var(--line-strong)] ${bg} px-3 py-2 text-base pointer-fine:text-sm text-ink outline-none placeholder:text-subtle focus:border-brand max-lg:disabled:border-dashed max-lg:disabled:bg-transparent max-lg:disabled:text-subtle pointer-coarse:disabled:border-dashed pointer-coarse:disabled:bg-transparent pointer-coarse:disabled:text-subtle`;

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
        "inline-block rounded-full border-2 border-line px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide max-md:text-xs",
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
  /** Extra heading classes, e.g. "normal-case" for an address. */
  titleClassName?: string;
  children: React.ReactNode;
};

export function Panel({
  title,
  note,
  action,
  accent,
  tone,
  smallNote,
  titleClassName,
  children,
}: PanelProps) {
  return (
    <section
      className={`animate-fade-in rounded-[16px] border-2 border-line ${
        tone ? "bg-tint" : "bg-surface"
      } p-4 shadow-none md:shadow-brut-sm`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            className={cn(
              "text-sm font-extrabold uppercase tracking-wide",
              accent ? "text-brand" : "text-ink",
              titleClassName,
            )}
          >
            {title}
          </h2>
          {note && (
            <p
              className={`mt-1 ${smallNote ? "text-sm md:text-xs" : "text-sm"} text-subtle`}
            >
              {note}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Label/value pairs. One column below sm, so long values get the full width. */
export function Rows({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm max-sm:[&>div+div>dt]:mt-2 sm:grid-cols-[9rem_1fr] sm:gap-x-6 sm:gap-y-2">
      {items.map(([label, value]) => (
        <div className="contents" key={label}>
          <dt className="font-semibold text-subtle">{label}</dt>
          <dd className="min-w-0 wrap-anywhere font-semibold text-ink">
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
