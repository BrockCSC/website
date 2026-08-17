import { cn } from "@/lib/utils";

export const field =
  "w-full rounded-[10px] border-2 border-line bg-raised px-3 py-2 text-sm text-ink outline-none placeholder:text-subtle";

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

export function Panel({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[20px] border-2 border-line bg-surface p-5 shadow-brut">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-ink">
            {title}
          </h2>
          {note && <p className="mt-1 text-sm text-subtle">{note}</p>}
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
    <p className="rounded-[10px] border-2 border-line bg-tint px-3 py-2 text-sm font-semibold text-ink">
      {children}
    </p>
  );
}
