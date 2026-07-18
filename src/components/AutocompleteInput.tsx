import { forwardRef, useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputType?: string;
  maxLength?: number;
  // Force typed input to UPPERCASE as the user types (applied on keystrokes
  // only, never to a picked suggestion — selecting must keep the exact stored
  // spelling so lookups keyed on it, e.g. medicine details, still resolve).
  uppercase?: boolean;
  // Optional canonicalizer run when the field loses focus. If it returns a
  // different string, the value is committed via onChange — used to snap a typed
  // medicine name onto its canonical spelling so no new variant is created.
  transformOnBlur?: (value: string) => string;
}

const AutocompleteInput = forwardRef<HTMLInputElement, Props>(function AutocompleteInput({
  value,
  onChange,
  onSelect,
  suggestions,
  placeholder,
  className,
  required,
  autoFocus,
  inputType = 'text',
  maxLength,
  uppercase,
  transformOnBlur,
}, forwardedRef) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const internalRef = useRef<HTMLInputElement>(null);

  const inputRef = {
    get current() { return internalRef.current; },
  } as React.RefObject<HTMLInputElement>;
  const listRef = useRef<HTMLUListElement>(null);

  // Filter on typing. Rank prefix matches ahead of mid-string matches so the
  // most relevant names surface, then cap at 50 (the dropdown scrolls). Capping
  // at a small number previously hid every match past the 8th alphabetically.
  const MAX_RESULTS = 50;
  const q = value.trim().toLowerCase();
  const filtered = q.length > 0
    ? suggestions
        .filter((s) => s.toLowerCase().includes(q))
        .sort((a, b) => {
          const aPrefix = a.toLowerCase().startsWith(q) ? 0 : 1;
          const bPrefix = b.toLowerCase().startsWith(q) ? 0 : 1;
          return aPrefix - bPrefix || a.localeCompare(b);
        })
        .slice(0, MAX_RESULTS)
    : suggestions.slice(0, MAX_RESULTS);

  const calcPosition = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setDropStyle({
      position: 'fixed',
      top: r.bottom + 3,
      left: r.left,
      width: Math.max(r.width, 200),
      zIndex: 9999,
      maxHeight: 220,
    });
  };

  const openDrop = () => {
    calcPosition();
    setOpen(true);
    setHighlighted(-1);
  };

  const closeDrop = () => setOpen(false);

  const select = (s: string) => {
    onChange(s);
    onSelect?.(s);
    closeDrop();
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown') { openDrop(); return; }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
        break;
      case 'Enter':
        if (highlighted >= 0) {
          e.preventDefault();
          select(filtered[highlighted]);
        }
        break;
      case 'Escape':
      case 'Tab':
        closeDrop();
        break;
    }
  };

  // Close when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !listRef.current?.contains(e.target as Node)
      ) {
        closeDrop();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reposition on scroll / resize so dropdown tracks the input
  useEffect(() => {
    if (!open) return;
    const reposition = () => calcPosition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  // Highlight matching text inside suggestion
  const highlight = (text: string) => {
    if (!value.trim()) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(value.toLowerCase());
    if (idx === -1) return <span>{text}</span>;
    return (
      <span>
        {text.slice(0, idx)}
        <span className="font-bold text-blue-600">{text.slice(idx, idx + value.length)}</span>
        {text.slice(idx + value.length)}
      </span>
    );
  };

  return (
    <>
      <input
        ref={(el) => {
          (internalRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
          if (typeof forwardedRef === 'function') forwardedRef(el);
          else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
        }}
        type={inputType}
        value={value}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => { onChange(uppercase ? e.target.value.toUpperCase() : e.target.value); openDrop(); }}
        onFocus={openDrop}
        onBlur={() => {
          // Selecting a suggestion uses onMouseDown+preventDefault, so this
          // only fires on a real blur (tabbing/clicking away) — safe to snap.
          if (!transformOnBlur || !value.trim()) return;
          const next = transformOnBlur(value);
          if (next !== value) onChange(next);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        required={required}
        autoFocus={autoFocus}
        maxLength={maxLength}
      />

      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          style={dropStyle}
          className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-y-auto py-1"
        >
          {filtered.map((s, i) => (
            <li
              key={s}
              onMouseDown={(e) => { e.preventDefault(); select(s); }}
              className={`px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                i === highlighted
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {highlight(s)}
            </li>
          ))}
        </ul>
      )}
    </>
  );
});

export default AutocompleteInput;
