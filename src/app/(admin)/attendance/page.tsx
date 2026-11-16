import { isAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/AppShell";
import { DateNav } from "@/components/DateNav";
import { AttendanceSheet } from "@/components/AttendanceSheet";
import { generateDailySheet, getDrivers, getSheet } from "@/lib/data";
import { formatDateLabel, isIsoDate, todayIso } from "@/lib/tracking";

export const dynamic = "force-dynamic";

async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const date = sp.date && isIsoDate(sp.date) ? sp.date : todayIso();

  // Automation: create this date's sheet if it does not exist yet.
  await generateDailySheet(date);

  const [sheet, drivers] = await Promise.all([getSheet(date), getDrivers()]);

  const filled = sheet.filter((e) => e.status !== "pending").length;
  const total = sheet.length;

  return (
    <>
      <PageHeader
        title="Daily Attendance"
        subtitle={`${formatDateLabel(date)} · ${filled}/${total} shift slots filled`}
      >
        <DateNav basePath="/attendance" />
      </PageHeader>

      {sheet.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <div className="text-3xl">🚕</div>
          <h3 className="mt-3 text-[15px] font-semibold text-slate-900">
            Add cabs first
          </h3>
          <p className="mt-1 text-[13px] text-slate-500">
            Once cabs are added, each day's sheet appears here automatically.
          </p>
          <a
            href="/cabs"
            className="mt-4 inline-block rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white"
          >
            Go to Cabs
          </a>
        </div>
      ) : (
        <AttendanceSheet date={date} entries={sheet} drivers={drivers} />
      )}
    </>
  );
}

export default async function Page(props: Parameters<typeof AttendancePage>[0]) {
  if (!(await isAdmin())) return null;
  return AttendancePage(props);
}
