"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, TextInput } from "@/components/ui";
import { cx } from "@/lib/cx";
import { cabKey } from "@/lib/tracking";
import { AdminPinSettings } from "@/components/AdminPinSettings";

type DriverRow = { id: string; name: string; phone: string; cabs: { cabNumber: string; shiftType: string }[] };

const waPhone = (p: string) => {
  const d = p.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  return d;
};

export function SharePanel({
  enabled,
  link,
  publicUrl,
  hasPin,
  qrSvg,
  drivers,
  isPreview,
}: {
  enabled: boolean;
  link: string;
  publicUrl: string;
  hasPin: boolean;
  qrSvg: string;
  drivers: DriverRow[];
  isPreview: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [url, setUrl] = useState(publicUrl);
  const [copied, setCopied] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save faileded");
      return data as { key?: string; recovery?: string | null };
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : "Error"}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this:", text);
    }
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1800);
  };

  const cabLink = (d: DriverRow) => (d.cabs.length ? `${link}&cab=${cabKey(d.cabs[0].cabNumber)}` : link);
  const groupText = `Hello 🙏\nFrom now on, please submit each cab's DUTY ON / DUTY OFF / LEAVE using this link:\n${link}\n\n1️⃣ Open the link\n2️⃣ Enter the cab number (last 4 digits also work)\n3️⃣ Choose DUTY ON / DUTY OFF / LEAVE → Submit\n\nTap DUTY ON when the duty starts and DUTY OFF when it ends. 🚕`;
  const personalText = (d: DriverRow) =>
    `Hello ${d.name} 🙏\n${d.cabs.length ? `Your cab ${d.cabs.map((c) => c.cabNumber).join(", ")} ` : "Your cab "}— please submit DUTY ON / OFF using this link:\n${cabLink(d)}\n\nDuty starts → DUTY ON\nDuty ends → DUTY OFF\nLeave → LEAVE\nPlease save this link. 🚕`;

  return (
    <div className="space-y-4">
      {isPreview ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-[13px] leading-relaxed text-amber-900">
          <b>⚠️ This is currently a preview link.</b> This platform's preview only opens for your account — drivers who open it will get
          <b> &quot;403 Forbidden&quot;</b>. For drivers, the app must be deployed to the public internet (Vercel + Neon, free —
          see <code>DEPLOY.md</code>). After deploying, paste that link into <b>Public URL</b> below — all links and QR codes will update automatically.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader icon="📱" title="Driver form" subtitle="Drivers can only submit Duty ON / OFF while this is ON" />
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <div>
                <div className="text-[15px] font-bold text-slate-900">
                  Status: <span className={on ? "text-emerald-600" : "text-slate-500"}>{on ? "🟢 ON — form is live" : "⚪ OFF — form is closed"}</span>
                </div>
                <div className="text-[12px] text-slate-500">When closed, the link opens but shows &quot;form closed&quot;.</div>
              </div>
              <button
                onClick={async () => {
                  const r = await patch({ driverFormEnabled: !on });
                  if (r) {
                    setOn(!on);
                    router.refresh();
                  }
                }}
                disabled={busy}
                className={cx("relative h-9 w-[72px] rounded-full transition-colors", on ? "bg-emerald-500" : "bg-slate-300")}
                aria-label="Driver form on/off"
              >
                <span className={cx("absolute top-1 size-7 rounded-full bg-white shadow transition-all", on ? "left-[40px]" : "left-1")} />
              </button>
            </div>

            <div>
              <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-500">Drivers' link</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-xl bg-slate-900 px-3 py-2.5 text-[12.5px] text-emerald-300">{link}</code>
                <Button variant="primary" onClick={() => copy(link, "link")}>
                  {copied === "link" ? "✓ Copied" : "📋 Copy"}
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`https://wa.me/?text=${encodeURIComponent(groupText)}`} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-500">
                  💬 Send to WhatsApp group
                </a>
                <Button variant="secondary" onClick={() => copy(groupText, "msg")}>
                  {copied === "msg" ? "✓ Message copied" : "📝 Copy message"}
                </Button>
                <a href={link} target="_blank" rel="noreferrer" className="rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                  👀 Open the form to check
                </a>
              </div>
            </div>

            <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-[12.5px] leading-relaxed text-indigo-900">
              <b>What the driver does:</b> opens the link → enters the cab number (or last 4 digits) → sees their name, cab and shift timing →
              <b> DUTY ON / DUTY OFF / LEAVE</b> and taps Submit. The phone remembers the cab, so next time the details open directly.
              <br />
              <b>What you get:</b> an instant 🔔 alert for every action, a ⚠️ red alert for Duty OFF before time, a ⏳ alert if Duty ON is not started within 30 min (for cabs that use the form) —
              and Daily Attendance and the Daily report fill in automatically.
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader icon="🔳" title="QR code" subtitle="Scan → the form opens" />
          <div className="p-5 text-center">
            <div className="mx-auto w-48 rounded-2xl bg-white p-2 ring-1 ring-slate-200 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <Link href="/share/print" className="mt-4 inline-block rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white">
              🖨️ Print a QR sticker for each cab
            </Link>
            <p className="mt-2 text-[11.5px] text-slate-500">Sticker QR codes already contain the cab number — drivers don't need to type anything.</p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader icon="🧑‍✈️" title="Send each driver their own link" subtitle="The link already has their cab filled in — one click on WhatsApp" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">Driver</th>
                <th className="px-3 py-2.5">Phone</th>
                <th className="px-3 py-2.5">Regular cab</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {drivers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-400">Add drivers first.</td>
                </tr>
              ) : (
                drivers.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-2.5 font-semibold text-slate-900">{d.name}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-600">{d.phone || <span className="text-amber-600">no phone</span>}</td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {d.cabs.length ? d.cabs.map((c) => `${c.cabNumber} ${c.shiftType === "day" ? "☀️" : "🌙"}`).join(", ") : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        {d.phone ? (
                          <a href={`https://wa.me/${waPhone(d.phone)}?text=${encodeURIComponent(personalText(d))}`} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-500">
                            💬 WhatsApp
                          </a>
                        ) : (
                          <Link href="/drivers" className="rounded-lg bg-amber-50 px-3 py-1.5 text-[12px] font-semibold text-amber-700 ring-1 ring-amber-200">
                            + add phone
                          </Link>
                        )}
                        <Button size="sm" variant="secondary" onClick={() => copy(personalText(d), d.id)}>
                          {copied === d.id ? "✓" : "📋"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AdminPinSettings hasPin={hasPin} />

        <Card>
          <CardHeader icon="🌐" title="Public URL & link security" subtitle="Enter your app URL here after deploying" />
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap gap-2">
              <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://cabtrack.vercel.app" className="min-w-0 flex-1" />
              <Button
                variant="primary"
                disabled={busy}
                onClick={async () => {
                  if (await patch({ publicUrl: url })) {
                    setMsg("✅ Public URL saved");
                    router.refresh();
                  }
                }}
              >
                Save
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 px-4 py-3">
              <div className="text-[12.5px] text-rose-800">Did the link reach the wrong person? Create a new link — the old one stops working immediately.</div>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm("Create a new link? The old link and old QR stickers will stop working.")) return;
                  if (await patch({ regenerateKey: true })) {
                    setMsg("✅ New link created — send it to drivers again");
                    router.refresh();
                  }
                }}
              >
                🔄 Create new link
              </Button>
            </div>
          </div>
        </Card>
      </div>
      {msg ? <p className="rounded-xl bg-slate-900 px-4 py-2.5 text-center text-[13px] font-semibold text-white">{msg}</p> : null}
    </div>
  );
}
