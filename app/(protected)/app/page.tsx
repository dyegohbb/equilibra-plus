import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";
import { FinanceApp } from "@/components/finance/finance-app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finanças" };

export default async function AppPage() {
  const session = await getSession();
  if (!session?.user) redirect("/sign-in");
  return <FinanceApp email={session.user.email ?? ""} />;
}
