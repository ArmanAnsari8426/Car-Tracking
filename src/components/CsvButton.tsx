"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function CsvButton({
  filename,
  content,
  label = "⬇️ Export CSV",
}: {
  filename: string;
  content: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);

  return (
    <Button
      variant="secondary"
      onClick={() => {
        const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        setDone(true);
        window.setTimeout(() => setDone(false), 2200);
      }}
    >
      {done ? "Downloaded ✓" : label}
    </Button>
  );
}
