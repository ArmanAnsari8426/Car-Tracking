import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { parseWorkbook, saveImport, type Overrides, type ParseResult } from "@/lib/importer";
import { isIsoDate, isUuid } from "@/lib/tracking";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function previewOf(p: ParseResult) {
  return {
    sheets: p.sheets.map((s) => ({
      name: s.name,
      kind: s.kind,
      headerRow: s.headerRow,
      columns: s.columns,
      count: s.kind === "master" ? s.master.length : s.kind === "drivers" ? s.driverRows.length : s.rows.length,
      errors: s.errors.slice(0, 15),
    })),
    counts: { attendance: p.rows.length, master: p.master.length, drivers: p.driverRows.length },
    attendancePreview: p.rows.slice(0, 30),
    masterPreview: p.master.slice(0, 60),
    driverPreview: p.driverRows.slice(0, 30),
    errors: p.errors.slice(0, 30),
  };
}

/** multipart: (file | uploadId) + mode=preview|save + overrides? + forceDate? */
export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const form = await request.formData();
    const mode = String(form.get("mode") ?? "preview");
    const forceDate = String(form.get("forceDate") ?? "");
    let overrides: Overrides | undefined;
    const ovRaw = form.get("overrides");
    if (typeof ovRaw === "string" && ovRaw) {
      try {
        overrides = JSON.parse(ovRaw) as Overrides;
      } catch {
        overrides = undefined;
      }
    }

    const file = form.get("file");
    const uploadId = String(form.get("uploadId") ?? "");
    let fileName: string;
    let buf: Buffer;
    let isNewFile = false;
    if (file instanceof File) {
      if (file.size > 15 * 1024 * 1024) {
        return NextResponse.json({ error: "File is larger than 15MB" }, { status: 400 });
      }
      fileName = file.name;
      buf = Buffer.from(await file.arrayBuffer());
      isNewFile = true;
    } else if (uploadId && isUuid(uploadId)) {
      const [u] = await db.select().from(uploads).where(eq(uploads.id, uploadId)).limit(1);
      if (!u?.fileData) {
        return NextResponse.json({ error: "This older upload's file was not saved — select the file again" }, { status: 404 });
      }
      fileName = u.fileName;
      buf = Buffer.from(u.fileData, "base64");
    } else {
      return NextResponse.json({ error: "Select a file" }, { status: 400 });
    }

    const parsed = parseWorkbook(buf, {
      forceDate: isIsoDate(forceDate) ? forceDate : undefined,
      overrides,
    });

    if (mode !== "save") {
      return NextResponse.json({ ok: true, fileName, ...previewOf(parsed) });
    }
    if (!parsed.rows.length && !parsed.master.length && !parsed.driverRows.length) {
      return NextResponse.json({ error: parsed.errors[0] ?? "No valid rows found" }, { status: 400 });
    }
    const summary = await saveImport(
      parsed,
      isNewFile ? fileName : `${fileName} (reprocessed)`,
      isNewFile ? buf.toString("base64") : null,
    );
    return NextResponse.json({ ok: true, fileName, ...summary, errors: parsed.errors.slice(0, 30) });
  } catch (error) {
    console.error("upload failed", error);
    return NextResponse.json({ error: "Could not read the file — please upload Excel (.xlsx/.xls) or CSV" }, { status: 500 });
  }
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const rows = await db
    .select({ id: uploads.id, fileName: uploads.fileName, createdAt: uploads.createdAt })
    .from(uploads)
    .orderBy(desc(uploads.createdAt))
    .limit(20);
  return NextResponse.json({ uploads: rows });
}
