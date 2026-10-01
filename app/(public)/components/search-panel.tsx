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
  // A search form, so phone keyboards show a Search key; submitting just
  // closes the keyboard (results already filter as you type).
  <form
    className="mt-3 flex flex-wrap items-center gap-2"
    onSubmit={(submitEvent) => {
      submitEvent.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur();
    }}
    role="search"
  >
    <div className="relative min-w-[220px] flex-1">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
      />
      <input
        aria-label={ariaLabel}
        className="w-full rounded-[10px] border-2 border-line bg-surface py-2 pr-3 pl-9 text-ink pointer-coarse:min-h-11"
        enterKeyHint="search"
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
        <Button
          className="max-md:h-10 max-md:rounded-[16px] max-md:px-6 pointer-coarse:min-h-11"
          onClick={() => onQueryChange("")}
          size="sm"
          type="button"
          variant="outline"
        >
          Clear
        </Button>
      </>
    )}
  </form>
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
