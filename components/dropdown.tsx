"use client";

import { useEffect, useRef, useState } from "react";

interface DropdownProps {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  id?: string;
  label?: string;
}

export function Dropdown({ value, options, onChange, id, label }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={rootRef} className="dropdown" data-open={open}>
      <button
        type="button"
        id={id}
        className="dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {value}
      </button>
      {open && (
        <div className="dropdown__panel" role="listbox">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={opt === value}
              className="dropdown__option"
              onClick={(e) => {
                e.stopPropagation();
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
