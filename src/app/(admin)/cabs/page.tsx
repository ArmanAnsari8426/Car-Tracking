import { isAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/AppShell";
import { CabsManager, type CabRow } from "@/components/CabsManager";
import { getAttendanceRange, getCabs, getDrivers, getShifts, indexShifts } from "@/lib/data";
import { hhmm, shiftDate, todayIso } from "@/lib/tracking";
import { Button } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function CabsPage() {
  const from = shiftDate(todayIso(), -29);
  const [cabs, shifts, records, drivers] = await Promise.all([
    getCabs(),
    getShifts(),
    getAttendanceRange(from, todayIso()),
    getDrivers(),
  ]);
  const tpl = indexShifts(shifts);
  const driverName = new Map(drivers.map((d) => [d.id, d.name]));

  const rows: CabRow[] = cabs.map((cab) => {
    const recs = records.filter((r) => r.cabId === cab.id && r.status !== "off" && r.status !== "pending");
    const present = recs.filter((r) => r.status === "present" || r.status === "half_day");
    const shift = (st: "day" | "night") => {
      const t = tpl.get(`${cab.id}:${st}`);
      return {
        in: hhmm(t?.scheduledIn) ?? (st === "day" ? "08:00" : "20:00"),
        out: hhmm(t?.scheduledOut) ?? (st === "day" ? "20:00" : "08:00"),
        enabled: t?.enabled ?? true,
        driverId: t?.defaultDriverId ?? "",
        driverName: t?.defaultDriverId ? (driverName.get(t.defaultDriverId) ?? "") : "",
        isDefault: t?.isDefault ?? true,
      };
    };
    return {
      cab,
      day: shift("day"),
      night: shift("night"),
      present: present.length,
      slots: recs.length,
      late: present.filter((r) => r.lateMinutes > 0).length,
    };
  });

  return (
    <>
      <PageHeader
        title="Cabs, drivers & timing"
        subtitle="Each cab's owner, ☀️ day / 🌙 night driver and timing — this is used automatically everywhere"
      >
        <Link href="/upload">
          <Button variant="secondary">📤 Upload cab list</Button>
        </Link>
      </PageHeader>
      <CabsManager rows={rows} drivers={drivers.map((d) => ({ id: d.id, name: d.name, phone: d.phone }))} />
    </>
  );
}

export default async function Page() {
  if (!(await isAdmin())) return null;
  return CabsPage();
}
