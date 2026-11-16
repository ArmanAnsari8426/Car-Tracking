import { isAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/AppShell";
import { DriversManager } from "@/components/DriversManager";
import { getActiveCabs, getAssignments, getDriverPerformance } from "@/lib/data";
import { shiftDate, todayIso } from "@/lib/tracking";

export const dynamic = "force-dynamic";

async function DriversPage() {
  const [perf, assignments, cabList] = await Promise.all([
    getDriverPerformance(shiftDate(todayIso(), -29), todayIso()),
    getAssignments(),
    getActiveCabs(),
  ]);
  const rows = perf
    .map((p) => ({
      ...p,
      assigned: assignments
        .filter((a) => a.driverId === p.driver.id)
        .map((a) => `${a.cabNumber} ${a.shiftType === "day" ? "☀️" : "🌙"}`),
    }))
    .sort((a, b) => a.driver.name.localeCompare(b.driver.name));

  return (
    <>
      <PageHeader title="Drivers" subtitle="Which driver drives which cab — regular cab + last 30 days' record" />
      <DriversManager rows={rows} cabs={cabList.map((c) => ({ id: c.id, cabNumber: c.cabNumber }))} />
    </>
  );
}

export default async function Page() {
  if (!(await isAdmin())) return null;
  return DriversPage();
}
