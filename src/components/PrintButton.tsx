"use client";

export function PrintButton({ label = "🖨️ Print" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className="rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-slate-800 print:hidden">
      {label}
    </button>
  );
}
