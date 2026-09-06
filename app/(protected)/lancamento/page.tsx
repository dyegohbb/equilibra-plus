import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FinanceApp } from "@/components/finance/finance-app";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Novo lançamento" };

export default async function NewTransactionPage() {
  const session = await getSession();
  if (!session?.user) redirect("/sign-in");
  return <FinanceApp email={session.user.email ?? ""} initialTab="new" />;
}
