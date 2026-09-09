import { runScheduledAutoBilling } from "@/modules/finance/advanced-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Recife",
    });
    return Response.json({ ok: true, ...(await runScheduledAutoBilling(today)) });
  } catch (error) {
    console.error(
      "Scheduled auto billing failed",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json(
      { error: "Não foi possível executar o faturamento automático." },
      { status: 500 },
    );
  }
}
