import { z } from "zod";
import { authorizeAutomation } from "@/lib/automation/auth";
import { createPurchase } from "@/modules/finance/service";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  idempotencyKey: z.string().min(8).max(200),
  description: z.string().trim().min(1).max(120),
  amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  type: z.enum(["INCOME", "EXPENSE"]).default("EXPENSE"),
  walletId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  consumptionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  competence: z.string().regex(/^\d{4}-\d{2}-01$/).optional(),
}).strict();

export async function POST(request: Request) {
  const automation = authorizeAutomation(request);
  if (!automation) return Response.json({ error: "Não autorizado." }, { status: 401, headers: { "cache-control": "no-store" } });
  try {
    const input = payloadSchema.parse(await request.json());
    const result = await createPurchase(automation.userId, { ...input, externalId: `iphone-sms:${input.idempotencyKey}`, mode: "CASH" });
    return Response.json({ ok: true, duplicate: result.duplicate, purchaseId: result.purchaseId, competence: result.competences[0] }, { status: result.duplicate ? 200 : 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Payload inválido.", fields: error.flatten().fieldErrors }, { status: 422 });
    console.error("Automation transaction failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível criar o lançamento." }, { status: 400 });
  }
}
