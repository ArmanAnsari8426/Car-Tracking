import { isAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/AppShell";
import { AutomationPanel } from "@/components/AutomationPanel";
import { Card, CardHeader } from "@/components/ui";
import { getActiveCabs, getActiveDrivers } from "@/lib/data";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function SettingsPage() {
  const [cabs, drivers] = await Promise.all([getActiveCabs(), getActiveDrivers()]);

  return (
    <>
      <PageHeader
        title="Automation & settings"
        subtitle="Daily sheet auto-generation and data tools"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Active cabs" value={cabs.length} icon="🚕" />
        <MiniStat label="Active drivers" value={drivers.length} icon="🧑‍✈️" />
        <MiniStat
          label="Rows / day"
          value={cabs.length * 2}
          icon="📄"
          hint="day + night"
        />
        <MiniStat
          label="Rows / month"
          value={cabs.length * 2 * 30}
          icon="🗓️"
          hint="approx."
        />
      </div>

      <AutomationPanel />
      <Link href="/share" className="mt-4 block rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-[13px] text-indigo-900 hover:bg-indigo-100">
        📱 <b>Driver Form, link, QR stickers and Admin PIN</b> are on the <b>&quot;Driver Form &amp; Link&quot;</b> page →
      </Link>

      <Card className="mt-4">
        <CardHeader
          icon="💡"
          title="How to use"
          subtitle="Daily workflow"
        />
        <div className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-3">
          <Step
            n={1}
            title="Upload your sheet"
            text="On the Upload page, add an Excel/CSV file — cabs, drivers and attendance are all saved to the database. Keep adding sheets later; everything merges."
          />
          <Step
            n={2}
            title="Roz fill the sheet"
            text="On the Daily Attendance page, fill in the status, driver and actual in/out time for each cab's day and night row."
          />
          <Step
            n={3}
            title="Check the dashboard"
            text="The dashboard and reports show who came, who did not, who was late and which driver drove."
          />
        </div>
      </Card>
    </>
  );
}

function MiniStat({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: number;
  icon: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <span className="text-base">{icon}</span>
      </div>
      <div className="mt-1 text-[24px] font-bold tabular-nums text-slate-900">
        {value}
      </div>
      {hint ? <div className="text-[11px] text-slate-400">{hint}</div> : null}
    </div>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <span className="grid size-7 place-items-center rounded-lg bg-slate-900 text-[12px] font-bold text-white">
        {n}
      </span>
      <h3 className="mt-2.5 text-[13.5px] font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">{text}</p>
    </div>
  );
}

export default async function Page() {
  if (!(await isAdmin())) return null;
  return SettingsPage();
}
