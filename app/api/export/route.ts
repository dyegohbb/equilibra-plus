import { getSession } from "@/lib/auth/server";
import { exportData } from "@/modules/finance/service";

export const dynamic = "force-dynamic";
export async function GET() {
  const session = await getSession(); if (!session?.user?.id) return new Response("Não autorizado.", { status: 401 });
  const body = JSON.stringify(await exportData(session.user.id), null, 2);
  return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="equilibra-backup-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" } });
}
