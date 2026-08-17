import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";

export const SearchField = ({
  ariaLabel,
  onQueryChange,
  placeholder,
  query,
  results,
}: {
  ariaLabel: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  query: string;
  results: ReactNode;
}) => (
  <div className="mt-3 flex flex-wrap items-center gap-2">
    <div className="relative min-w-[220px] flex-1">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
      />
      <input
        aria-label={ariaLabel}
        className="w-full rounded-[10px] border-2 border-line bg-surface py-2 pr-3 pl-9 text-ink"
        onChange={(changeEvent) => onQueryChange(changeEvent.target.value)}
        placeholder={placeholder}
        type="search"
        value={query}
      />
    </div>
    {results && (
      <>
        <span aria-live="polite" className="text-sm text-subtle">
          {results}
        </span>
        <Button onClick={() => onQueryChange("")} size="sm" variant="outline">
          Clear
        </Button>
      </>
    )}
  </div>
);

type RetryNoticeProps = { message: string | null; onRetry: () => void };

export const RetryNotice = ({ message, onRetry }: RetryNoticeProps) =>
  message ? (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <p className="m-0 text-subtle">{message}</p>
      <Button onClick={onRetry} size="sm" variant="outline">
        Try again
      </Button>
    </div>
  ) : null;
