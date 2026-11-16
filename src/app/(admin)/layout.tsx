import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { AdminLogin } from "@/components/AdminLogin";
import { isAdmin } from "@/lib/auth";
import { hasAdminPin } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!(await isAdmin())) return <AdminLogin />;
  return <AppShell hasPin={await hasAdminPin()}>{children}</AppShell>;
}
