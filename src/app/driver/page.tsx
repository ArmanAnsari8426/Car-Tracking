import type { Metadata } from "next";
import { DriverForm } from "@/components/DriverForm";
import { getActiveDrivers } from "@/lib/data";
import { lookupCabs } from "@/lib/duty";
import { getDriverFormKey, isDriverFormEnabled } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Duty ON / OFF — CabTrack" };

function Closed({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-lg">
        <div className="text-4xl">🔒</div>
        <h1 className="mt-3 text-lg font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-[14px] text-slate-500">{text}</p>
      </div>
    </div>
  );
}

export default async function DriverPage({ searchParams }: { searchParams: Promise<{ k?: string; cab?: string }> }) {
  const sp = await searchParams;
  if (!(await isDriverFormEnabled())) return <Closed title="The driver form is closed" text="Contact the owner." />;
  const key = await getDriverFormKey();
  if (sp.k !== key) return <Closed title="Link is invalid or outdated" text="Ask the owner for a new link." />;
  const found = sp.cab ? await lookupCabs(sp.cab) : [];
  const drivers = (await getActiveDrivers()).map((d) => ({ id: d.id, name: d.name }));
  return <DriverForm k={key} drivers={drivers} initial={found.length === 1 ? found[0] : null} />;
}
