"use client";

import { useMemo, useState } from "react";

export type Contact = { name: string; email: string };

const looksLikeAddress = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function RecipientInput({
  label,
  value,
  onChange,
  contacts,
  autoFocus,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  contacts: Contact[];
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [highlight, setHighlight] = useState(0);

  const suggestions = useMemo(() => {
    const query = draft.trim().toLowerCase();
    if (!query) return [];
    return contacts
      .filter(
        (contact) =>
          !value.includes(contact.email) &&
          (contact.name.toLowerCase().includes(query) ||
            contact.email.toLowerCase().includes(query)),
      )
      .slice(0, 6);
  }, [draft, contacts, value]);

  const add = (email: string) => {
    const trimmed = email.trim().replace(/[,;]$/, "");
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setDraft("");
    setHighlight(0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setHighlight((index) => (index + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setHighlight(
        (index) => (index - 1 + suggestions.length) % suggestions.length,
      );
      return;
    }
    if (["Enter", "Tab", ",", ";"].includes(event.key)) {
      const picked = suggestions[highlight];
      if (picked || draft.trim()) {
        event.preventDefault();
        add(picked ? picked.email : draft);
      }
      return;
    }
    if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] border-2 border-line px-2 py-1.5 transition-colors duration-[var(--dur-fast)] ease-smooth focus-within:border-brand">
        <span className="px-1 text-sm font-bold text-subtle">{label}</span>
        {value.map((email) => (
          <span
            key={email}
            className="flex animate-pop-in items-center gap-1 rounded-full bg-tint px-2.5 py-0.5 text-sm font-semibold text-brand"
          >
            {email}
            <button
              type="button"
              aria-label={`Remove ${email}`}
              onClick={() => onChange(value.filter((item) => item !== email))}
              className="text-brand/70 hover:text-brand"
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-40 flex-1 px-1 py-0.5 text-sm focus:outline-none"
          value={draft}
          autoFocus={autoFocus}
          onChange={(event) => {
            setDraft(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => looksLikeAddress(draft.trim()) && add(draft)}
        />
      </div>

      {suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full animate-fade-in overflow-hidden rounded-[10px] border-2 border-line bg-surface shadow-brut-sm">
          {suggestions.map((contact, index) => (
            <li key={contact.email}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  add(contact.email);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm ${
                  index === highlight ? "bg-tint" : "hover:bg-raised"
                }`}
              >
                <span className="font-bold">{contact.name}</span>
                <span className="text-xs text-subtle">{contact.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
