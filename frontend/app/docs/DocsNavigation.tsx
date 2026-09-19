"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./docs.module.css";

export type DocsNavGroup = { label: string; links: [id: string, label: string][] };

export type DocsSearchItem = {
  title: string;
  description: string;
  group: string;
  href: string;
  keywords?: string;
};

/** A section counts as current once its top passes below the sticky docs bar. */
const ACTIVE_OFFSET = 132;

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10.5 10.5 3.25 3.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M3.5 1.75h5l3 3v8.5h-8z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
      <path d="M8.5 1.75v3h3M5.5 7.25h4M5.5 9.75h4" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  );
}

export function DocsNavigation({ groups }: { groups: DocsNavGroup[] }) {
  const ids = useMemo(() => groups.flatMap((g) => g.links.map(([id]) => id)), [groups]);
  const labels = useMemo(() => new Map(groups.flatMap((g) => g.links)), [groups]);
  const [active, setActive] = useState(ids[0] ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      let current = ids[0] ?? "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= ACTIVE_OFFSET) current = id;
        else if (el) break;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
    };
  }, [ids]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const renderGroups = (inPanel = false) =>
    groups.map((group) => (
      <div key={group.label} className={styles.sidebarGroup}>
        <div className={styles.sidebarGroupLabel}>{group.label}</div>
        <nav aria-label={`${group.label} documentation`}>
          {group.links.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              data-active={active === id || undefined}
              aria-current={active === id ? "location" : undefined}
              onClick={() => {
                setActive(id);
                if (inPanel) setOpen(false);
              }}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
    ));

  return (
    <div className={styles.navColumn}>
      <aside className={styles.sidebar}>{renderGroups()}</aside>
      <div className={styles.mobileNav}>
        <button
          type="button"
          className={styles.mobileNavTrigger}
          aria-expanded={open}
          aria-controls="mobile-docs-navigation"
          onClick={() => setOpen((v) => !v)}
        >
          <span>
            <small>Section</small>
            <b>{labels.get(active) ?? "Overview"}</b>
          </span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <>
            <button className={styles.mobileNavBackdrop} aria-label="Close documentation navigation" onClick={() => setOpen(false)} />
            <div className={styles.mobileNavPanel} id="mobile-docs-navigation">
              {renderGroups(true)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function rank(items: DocsSearchItem[], query: string) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...items];
  return items
    .map((item, index) => {
      const title = item.title.toLowerCase();
      const haystack = `${item.title} ${item.description} ${item.group} ${item.keywords ?? ""}`.toLowerCase();
      if (!terms.every((t) => haystack.includes(t))) return null;
      const score = terms.reduce(
        (sum, t) => sum + (title === t ? 12 : title.startsWith(t) ? 8 : title.includes(t) ? 4 : 1),
        0,
      );
      return { item, index, score };
    })
    .filter((hit) => hit !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}

export function DocsSearch({ items }: { items: DocsSearchItem[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [shortcut, setShortcut] = useState("⌘ K");

  const results = useMemo(() => rank(items, query), [items, query]);
  const grouped = useMemo(() => {
    const map = new Map<string, DocsSearchItem[]>();
    for (const item of results) map.set(item.group, [...(map.get(item.group) ?? []), item]);
    return [...map.entries()];
  }, [results]);

  const openSearch = () => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const closeSearch = () => dialogRef.current?.close();

  const go = (item: DocsSearchItem) => {
    closeSearch();
    setQuery("");
    setCursor(0);
    if (!item.href.startsWith("#")) {
      window.location.assign(item.href);
      return;
    }
    const target = document.getElementById(item.href.slice(1));
    if (!target) return;
    window.history.pushState(null, "", item.href);
    requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform is only known on the client
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K");
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!dialogRef.current?.open) dialogRef.current?.showModal();
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button type="button" className={styles.searchTrigger} onClick={openSearch} aria-haspopup="dialog">
        <SearchIcon />
        <span>Search documentation...</span>
        <kbd>{shortcut}</kbd>
      </button>
      <dialog
        ref={dialogRef}
        className={styles.searchDialog}
        aria-labelledby="docs-search-title"
        onClose={() => {
          setQuery("");
          setCursor(0);
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeSearch();
        }}
      >
        <h2 id="docs-search-title" className={styles.srOnly}>
          Search Darwin documentation
        </h2>
        <div className={styles.commandInput}>
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            placeholder="Search contracts, fees, methods, and guides..."
            aria-label="Search documentation"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="docs-search-results"
            aria-activedescendant={results[cursor] ? `docs-result-${cursor}` : undefined}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((c) => (results.length === 0 ? 0 : (c + 1) % results.length));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((c) => (results.length === 0 ? 0 : (c - 1 + results.length) % results.length));
              } else if (event.key === "Enter" && results[cursor]) {
                event.preventDefault();
                go(results[cursor]);
              }
            }}
          />
          <button type="button" onClick={closeSearch} aria-label="Close search">
            Esc
          </button>
        </div>
        <div className={styles.commandResults} id="docs-search-results" role="listbox">
          {grouped.map(([group, entries]) => (
            <section key={group} className={styles.commandGroup} role="group" aria-label={group}>
              <div className={styles.commandGroupLabel}>{group}</div>
              {entries.map((item) => {
                const index = results.indexOf(item);
                return (
                  <button
                    key={`${item.group}-${item.href}-${item.title}`}
                    id={`docs-result-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === cursor}
                    data-active={index === cursor || undefined}
                    className={styles.commandItem}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => go(item)}
                  >
                    <span className={styles.commandItemIcon}>
                      <PageIcon />
                    </span>
                    <span>
                      <b>{item.title}</b>
                      <small>{item.description}</small>
                    </span>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                );
              })}
            </section>
          ))}
          {results.length === 0 && (
            <div className={styles.commandEmpty}>
              <SearchIcon />
              <b>No documentation found</b>
              <span>Try a contract name, function, event, or protocol concept.</span>
            </div>
          )}
        </div>
        <footer className={styles.commandFooter}>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> Navigate
          </span>
          <span>
            <kbd>↵</kbd> Open
          </span>
          <span>
            <kbd>Esc</kbd> Close
          </span>
        </footer>
      </dialog>
    </>
  );
}
