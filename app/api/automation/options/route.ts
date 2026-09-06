import { getSession } from "@/lib/auth/server";
import { getFinanceData } from "@/modules/finance/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Recife" });
  const data = await getFinanceData(session.user.id, `${today.slice(0, 7)}-01`);
  return Response.json({ userId: session.user.id, wallets: data.wallets.filter((item) => item.active).map(({ id, name, type }) => ({ id, name, type })), categories: data.categories.filter((item) => item.active).map(({ id, name, type }) => ({ id, name, type })) }, { headers: { "cache-control": "no-store" } });
}
