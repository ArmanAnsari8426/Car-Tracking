import { isAdmin } from "@/lib/auth";
import { desc, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { cabShifts, uploads } from "@/db/schema";
import { PageHeader } from "@/components/AppShell";
import { Uploader, type UploadHistoryRow } from "@/components/Uploader";
import { Card, CardHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

async function UploadPage() {
  const [rows, linkCount, cabCount] = await Promise.all([
    db
      .select({
        id: uploads.id,
        fileName: uploads.fileName,
        createdAt: uploads.createdAt,
        totalRows: uploads.totalRows,
        inserted: uploads.inserted,
        updated: uploads.updated,
        cabsCreated: uploads.cabsCreated,
        driversCreated: uploads.driversCreated,
        skipped: uploads.skipped,
        hasFile: isNotNull(uploads.fileData),
      })
      .from(uploads)
      .orderBy(desc(uploads.createdAt))
      .limit(25),
    db.select({ n: sql<number>`count(*)::int` }).from(cabShifts).where(isNotNull(cabShifts.defaultDriverId)),
    db.execute(sql`select count(*)::int as n from cabs`),
  ]);
  const history: UploadHistoryRow[] = rows.map((r) => ({
    ...r,
    hasFile: Boolean(r.hasFile),
    createdAt: r.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }),
  }));
  const cabs = Number((cabCount.rows[0] as { n?: number } | undefined)?.n ?? 0);
  const needsReupload = cabs > 0 && (linkCount[0]?.n ?? 0) === 0 && history.length > 0 && !history.some((h) => h.hasFile);

  return (
    <>
      <PageHeader
        title="Upload real data"
        subtitle="Upload your Excel / CSV — cabs, drivers and timings are applied everywhere automatically"
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Uploader history={history} needsReupload={needsReupload} />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader icon="📘" title="How it works" />
            <ul className="space-y-2.5 px-5 py-4 text-[12.5px] leading-relaxed text-slate-600">
              <li>🔗 When you upload a <b>cab list</b>, each cab's <b>day driver, night driver, owner and timing</b> are saved — names appear automatically on the daily sheet, dashboard, reports and driver form.</li>
              <li>🧠 Even if column names differ, values are used to detect them. If a column is misread, change it with the <b>dropdown in the preview</b>.</li>
              <li>⏰ Timings in any format: <code>8 AM - 8 PM</code>, <code>8-8</code>, <code>20:00 to 08:00</code>, <code>7.30</code>.</li>
              <li>👥 Two drivers in one cell (<code>Raja / Sahil</code>) = Day / Night driver.</li>
              <li>📅 Daily record: date + cab + in/out. If the driver is blank, the cab's regular driver is used.</li>
              <li>✅ <b>Merged:</b> the same cab + date + shift is updated if it appears again, or added if new — nothing is deleted.</li>
              <li>💾 The <b>Full backup</b> button downloads everything as Excel — uploading that same file restores it all.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

export default async function Page() {
  if (!(await isAdmin())) return null;
  return UploadPage();
}
