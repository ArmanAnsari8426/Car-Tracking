import QRCode from "qrcode";
import { isAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/AppShell";
import { SharePanel } from "@/components/SharePanel";
import { getActiveDrivers, getAssignments } from "@/lib/data";
import { appBaseUrl } from "@/lib/share";
import { getDriverFormKey, getPublicUrl, hasAdminPin, isDriverFormEnabled } from "@/lib/settings";

export const dynamic = "force-dynamic";

async function SharePage() {
  const [enabled, key, publicUrl, hasPin, drivers, assignments, base] = await Promise.all([
    isDriverFormEnabled(),
    getDriverFormKey(),
    getPublicUrl(),
    hasAdminPin(),
    getActiveDrivers(),
    getAssignments(),
    appBaseUrl(),
  ]);
  const link = `${base}/driver?k=${key}`;
  const qrSvg = await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const rows = drivers.map((d) => ({
    id: d.id,
    name: d.name,
    phone: d.phone,
    cabs: assignments.filter((a) => a.driverId === d.id).map((a) => ({ cabNumber: a.cabNumber, shiftType: a.shiftType })),
  }));
  return (
    <>
      <PageHeader title="Driver Form & Link" subtitle="Send drivers the link — they will submit Duty ON / OFF / Leave, and you will get an instant alert here" />
      <SharePanel
        enabled={enabled}
        link={link}
        publicUrl={publicUrl}
        hasPin={hasPin}
        qrSvg={qrSvg}
        drivers={rows}
        isPreview={base.includes(".e2b.app") || base.includes("localhost") || base.includes("127.0.0.1")}
      />
    </>
  );
}

export default async function Page() {
  if (!(await isAdmin())) return null;
  return SharePage();
}
