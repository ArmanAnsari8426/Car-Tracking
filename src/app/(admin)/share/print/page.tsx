import QRCode from "qrcode";
import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import { PrintButton } from "@/components/PrintButton";
import { getActiveCabs, getAssignments } from "@/lib/data";
import { appBaseUrl } from "@/lib/share";
import { getDriverFormKey } from "@/lib/settings";
import { cabKey } from "@/lib/tracking";

export const dynamic = "force-dynamic";

async function PrintPage() {
  const [key, cabs, assignments, base] = await Promise.all([getDriverFormKey(), getActiveCabs(), getAssignments(), appBaseUrl()]);
  const items = await Promise.all(
    cabs.map(async (c) => {
      const url = `${base}/driver?k=${key}&cab=${cabKey(c.cabNumber)}`;
      return {
        cab: c,
        drivers: assignments.filter((a) => a.cabId === c.id).map((a) => a.driverName),
        svg: await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
      };
    }),
  );
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-[26px] font-bold text-slate-900">QR stickers — for each cab</h1>
          <p className="text-[13px] text-slate-500">Print and stick one on each cab. When a driver scans it, their cab's details open directly.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/share" className="rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 ring-1 ring-slate-200">← Back</Link>
          <PrintButton label="🖨️ Print stickers" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-3">
        {items.map(({ cab, drivers, svg }) => (
          <div key={cab.id} className="break-inside-avoid rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4 text-center">
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">CabTrack</div>
            <div className="text-[19px] font-extrabold tracking-wide text-slate-900">{cab.cabNumber}</div>
            <div className="mx-auto mt-2 w-40 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="mt-2 text-[13px] font-extrabold text-slate-800">📱 Scan → DUTY ON / OFF</div>
            {drivers.length ? <div className="text-[11px] text-slate-500">{drivers.join(" / ")}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function Page() {
  if (!(await isAdmin())) return null;
  return PrintPage();
}
