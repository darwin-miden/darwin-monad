export function SearchField({
  id,
  value,
  onChange,
  placeholder = "Search",
  ariaLabel = placeholder,
  className = "",
  autoFocus = false,
  name,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  autoFocus?: boolean;
  name?: string;
}) {
  return (
    <label className={`search-field ${className}`.trim()}>
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.35" />
        <path d="m9.5 9.5 3 3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      </svg>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        name={name}
      />
      {value && (
        <button type="button" className="search-clear" onClick={() => onChange("")} aria-label="Clear search">
          ×
        </button>
      )}
    </label>
  );
}
