"use client";

import { useRef, useState } from "react";
import { BLUE } from "@/lib/types";
import { parseCSV } from "@/lib/csv-parser";

interface CSVUploadProps {
  label: string;
  onParsed: (rows: Record<string, string>[]) => void;
  disabled?: boolean;
}

export default function CSVUpload({ label, onParsed, disabled }: CSVUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== "string") return;
      const rows = parseCSV(text);
      onParsed(rows);
    };
    reader.readAsText(file);

    // Reset so same file can be re-uploaded
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,application/vnd.ms-excel"
        onChange={handleFile}
        style={{ display: "none" }}
      />
      <button
        type="button"
        className="pill pill-blue"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        style={{
          background: BLUE,
          color: "#fff",
          border: "none",
          padding: "8px 20px",
          borderRadius: 980,
          fontSize: 14,
          fontWeight: 500,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {label}
      </button>
      {fileName && (
        <span style={{ fontSize: 13, color: "#86868b" }}>{fileName}</span>
      )}
    </div>
  );
}
