"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type DropdownOption = {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  keywords?: string[];
  icon?: ReactNode;
  group?: string;
  disabled?: boolean;
};

type BaseProps = {
  options: DropdownOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  name?: string;
  triggerContent?: ReactNode;
};

type SelectProps = BaseProps & {
  value: string | string[] | null;
  onChange: (value: string | string[]) => void;
  multiple: boolean;
  searchable: boolean;
};

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="m3.5 5.25 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="6.2" cy="6.2" r="3.7" stroke="currentColor" strokeWidth="1.3" />
      <path d="m9 9 2.7 2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function Select({
  options,
  value,
  onChange,
  multiple,
  searchable,
  placeholder = "Select an option",
  searchPlaceholder = "Search",
  emptyText = "No options found",
  ariaLabel = "Select an option",
  disabled = false,
  className = "",
  name,
  triggerContent,
}: SelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const [up, setUp] = useState(false);

  const selected = useMemo(() => new Set(Array.isArray(value) ? value : value === null ? [] : [value]), [value]);
  const selectedOptions = useMemo(() => options.filter((o) => selected.has(o.value)), [options, selected]);
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? options.filter((o) =>
            [typeof o.label === "string" ? o.label : "", o.value, typeof o.description === "string" ? o.description : "", ...(o.keywords ?? [])]
              .filter(Boolean)
              .some((s) => String(s).toLowerCase().includes(needle)),
          )
        : options,
    [needle, options],
  );
  const firstEnabled = filtered.findIndex((o) => !o.disabled);
  const active = highlight >= 0 && highlight < filtered.length && !filtered[highlight]?.disabled ? highlight : firstEnabled;

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlight(-1);
  }, []);

  const label = multiple
    ? selectedOptions.length === 0
      ? placeholder
      : selectedOptions.length === 1
        ? selectedOptions[0].label
        : `${selectedOptions.length} selected`
    : (selectedOptions[0]?.label ?? placeholder);

  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setUp(window.innerHeight - rect.bottom < 300 && rect.top > window.innerHeight - rect.bottom);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const frame = requestAnimationFrame(() => {
      const coarse = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
      if (searchable && !coarse) searchRef.current?.focus();
      else listRef.current?.focus({ preventScroll: true });
    });
    const onOutside = (event: Event) => {
      if (root && !root.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("focusin", onOutside);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("focusin", onOutside);
    };
  }, [close, open, searchable]);

  const choose = useCallback(
    (option: DropdownOption) => {
      if (option.disabled) return;
      if (multiple) {
        const next = new Set(selected);
        if (next.has(option.value)) next.delete(option.value);
        else next.add(option.value);
        onChange(Array.from(next));
      } else {
        onChange(option.value);
        close();
        // Looked up by id: this handler is created while rendering the option list.
        document.getElementById(`${id}-trigger`)?.focus();
      }
    },
    [close, id, multiple, onChange, selected],
  );

  const move = (step: number) => {
    if (!filtered.length) return;
    let index = active;
    for (let i = 0; i < filtered.length; i += 1) {
      index = (index + step + filtered.length) % filtered.length;
      if (!filtered[index]?.disabled) {
        setHighlight(index);
        document.getElementById(`${id}-option-${index}`)?.scrollIntoView({ block: "nearest" });
        return;
      }
    }
  };

  const onListKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(filtered[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
      triggerRef.current?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      setHighlight(filtered.findIndex((o) => !o.disabled));
    } else if (event.key === "End") {
      event.preventDefault();
      for (let i = filtered.length - 1; i >= 0; i -= 1) {
        if (!filtered[i]?.disabled) {
          setHighlight(i);
          break;
        }
      }
    }
  };

  const groups = useMemo(() => {
    if (!open) return [];
    const map = new Map<string, { option: DropdownOption; index: number }[]>();
    filtered.forEach((option, index) => {
      const key = option.group ?? "";
      const list = map.get(key);
      if (list) list.push({ option, index });
      else map.set(key, [{ option, index }]);
    });
    return Array.from(map.entries());
  }, [filtered, open]);

  return (
    <div className={`sel dropdown ${className}`.trim()} ref={rootRef}>
      {name &&
        (multiple ? (
          Array.from(selected).map((v) => <input key={v} type="hidden" name={name} value={v} />)
        ) : (
          <input type="hidden" name={name} value={selectedOptions[0]?.value ?? ""} />
        ))}
      <button
        ref={triggerRef}
        id={`${id}-trigger`}
        type="button"
        className="sel-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === "Escape") close();
        }}
      >
        <span className="sel-trigger-label" data-placeholder={(!triggerContent && selectedOptions.length === 0) || undefined}>
          {triggerContent ?? label}
        </span>
        <Chevron />
      </button>
      {open && (
        <div id={`${id}-menu`} className={`sel-menu${up ? " up" : ""}`}>
          {searchable && (
            <label className="sel-search">
              <SearchIcon />
              <input
                ref={searchRef}
                className="sel-search-input"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlight(-1);
                }}
                onKeyDown={onListKey}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={`${id}-list`}
                aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
              />
            </label>
          )}
          <div
            ref={listRef}
            id={`${id}-list`}
            className="sel-list"
            role="listbox"
            aria-label={ariaLabel}
            aria-multiselectable={multiple || undefined}
            aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
            tabIndex={searchable ? -1 : 0}
            onKeyDown={onListKey}
          >
            {filtered.length === 0 ? (
              <div className="sel-empty">{emptyText}</div>
            ) : (
              groups.map(([group, items]) => (
                <div key={group || "default"} className="sel-group" role={group ? "group" : undefined} aria-label={group || undefined}>
                  {group && <div className="sel-group-label">{group}</div>}
                  {items.map(({ option, index }) => {
                    const isSelected = selected.has(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        id={`${id}-option-${index}`}
                        aria-selected={isSelected}
                        disabled={option.disabled}
                        className={`sel-opt${isSelected ? " sel" : ""}`}
                        data-highlighted={active === index || undefined}
                        onPointerMove={(event) => {
                          if (event.pointerType === "mouse" && !option.disabled) setHighlight(index);
                        }}
                        onClick={() => choose(option)}
                      >
                        {option.icon && <span className="sel-opt-icon">{option.icon}</span>}
                        <span className="sel-opt-text">
                          <span className="sel-opt-label">{option.label}</span>
                          {option.description && <span className="sel-opt-desc">{option.description}</span>}
                        </span>
                        {multiple && (
                          <span className="sel-check" aria-hidden="true">
                            {isSelected ? "✓" : ""}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Dropdown(
  props: BaseProps & { value: string | null; onChange: (value: string) => void },
) {
  return <Select {...props} onChange={(v) => props.onChange(v as string)} multiple={false} searchable={false} />;
}

export function SearchableMultiSelectDropdown(
  props: BaseProps & { value: string[]; onChange: (value: string[]) => void },
) {
  return <Select {...props} onChange={(v) => props.onChange(v as string[])} multiple searchable />;
}
