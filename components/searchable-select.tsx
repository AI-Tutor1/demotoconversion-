"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MUTED } from "@/lib/types";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  // Styling hook — matches existing filter-select-dark / filter-select-light
  // classes so this drops into both hero bars and light forms without tweaks.
  variant?: "dark" | "light";
  width?: number | string;
  // Caller can override the label shown when `value === ""` — defaults to
  // placeholder text. Useful for "All teachers" vs "All agents".
  clearLabel?: string;
  // Override the button's className entirely — used by form fields to swap in
  // "apple-input apple-select" so the trigger matches the surrounding inputs.
  buttonClassName?: string;
  // Paints the trigger with the same red border used by Field error states.
  invalid?: boolean;
}

// Replaces native <select> on filter surfaces. Click to open, type to filter,
// click an option to select. Outside-click / ESC dismiss. Keeps a hidden "clear"
// row at the top so the user can reset the filter without an extra button.
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  variant = "dark",
  width,
  clearLabel,
  buttonClassName,
  invalid = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = useMemo(() => {
    if (!value) return "";
    const m = options.find((o) => o.value === value);
    return m?.label ?? value;
  }, [options, value]);

  // Outside-click dismiss — matches the pattern used by the nav dropdowns.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ESC to dismiss
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Focus the input when the dropdown opens so the user can start typing immediately.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  const isDark = variant === "dark";
  const clearText = clearLabel ?? placeholder;

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        display: "inline-block",
        width: width ?? "auto",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={
          buttonClassName ?? (isDark ? "filter-select-dark" : "filter-select-light")
        }
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          minWidth: 150,
          width: width ?? "auto",
          cursor: "pointer",
          textAlign: "left",
          borderColor: invalid ? "#E24B4A" : undefined,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: selectedLabel
              ? undefined
              : isDark
              ? "rgba(255,255,255,.55)"
              : MUTED,
          }}
        >
          {selectedLabel || placeholder}
        </span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 12 8"
          fill="none"
          stroke={isDark ? "rgba(255,255,255,.7)" : MUTED}
          strokeWidth="1.5"
          strokeLinecap="round"
          style={{ flexShrink: 0 }}
        >
          <path d="M1 1l5 5 5-5" />
        </svg>
      </button>

      {open && (
        <div
          className="animate-slide-in"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            minWidth: 220,
            width: "max-content",
            maxWidth: 320,
            background: "#fff",
            border: "1px solid #e8e8ed",
            borderRadius: 12,
            boxShadow: "0 10px 32px rgba(0,0,0,.12)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="apple-input"
              style={{ fontSize: 13, padding: "7px 10px" }}
            />
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            <button
              type="button"
              onClick={() => select("")}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "9px 14px",
                background: value === "" ? "#f5f5f7" : "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: MUTED,
                fontStyle: "italic",
              }}
            >
              {clearText}
            </button>
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: "14px 14px",
                  color: MUTED,
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                No matches
              </div>
            ) : (
              filtered.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => select(o.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 14px",
                    background: value === o.value ? "#f5f5f7" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "#1d1d1f",
                    fontWeight: value === o.value ? 600 : 400,
                  }}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
