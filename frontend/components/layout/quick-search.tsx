"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuickSearchItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface QuickSearchProps {
  items: QuickSearchItem[];
  placeholder: string;
  noResultsLabel: string;
}

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[ʻʼ'`‘’]/g, "").trim();
}

/**
 * Header quick search shared by every portal. There is no global search API,
 * so it jumps between the portal's own pages: type, pick with ↑/↓, Enter.
 */
export function QuickSearch({ items, placeholder, noResultsLabel }: QuickSearchProps) {
  const router = useRouter();
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => {
    const q = normalize(query);
    if (!q) return items;
    return items.filter((item) => normalize(item.label).includes(q));
  }, [items, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function go(item: QuickSearchItem) {
    router.push(item.href);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      const item = results[activeIndex];
      if (item) {
        e.preventDefault();
        go(item);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showList = open && (query.trim().length > 0 || results.length > 0);

  return (
    <div className="relative hidden md:block" ref={containerRef}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-9 w-60 pl-9 pr-4 rounded-xl border border-border bg-secondary text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:bg-card transition-all"
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute right-0 top-full mt-2 w-60 max-h-80 overflow-y-auto bg-card rounded-2xl shadow-lg border border-border py-1.5 z-50"
        >
          {results.length === 0 ? (
            <li className="px-4 py-2.5 text-sm text-muted-foreground">{noResultsLabel}</li>
          ) : (
            results.map((item, index) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.href}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => go(item)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2 text-sm cursor-pointer transition-colors",
                    index === activeIndex ? "bg-secondary text-foreground" : "text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
