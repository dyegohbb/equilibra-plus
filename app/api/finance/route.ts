import { z } from "zod";
import { getSession } from "@/lib/auth/server";
import { postgresUuid, zodErrorResponse } from "@/lib/api-validation";
import {
  adjustWalletBalance,
  billScheduledEntry,
  createCategory,
  createPurchase,
  createScheduledRule,
  createWallet,
  deleteScheduledRule,
  getCategories,
  getFinanceData,
  payCreditCard,
  removeTransaction,
  skipScheduledEntry,
  updateCategory,
  updateTransaction,
  updateWallet,
} from "@/modules/finance/service";

export const dynamic = "force-dynamic";
const id = postgresUuid;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const competenceDate = z.string().regex(/^\d{4}-\d{2}-01$/);
const money = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const purchaseInput = z.object({
  description: z.string(),
  amountCents: money,
  type: z.enum(["INCOME", "EXPENSE"]),
  walletId: id,
  categoryId: id.optional(),
  consumptionDate: date,
  competence: competenceDate,
  mode: z.enum(["CASH", "INSTALLMENT_VALUE", "TOTAL_VALUE"]),
  quantity: z.number().int().min(2).max(120).optional(),
});

async function userId() {
  const session = await getSession();
  if (!session?.user?.id)
    throw new Response("Não autorizado.", { status: 401 });
  return session.user.id;
}

export async function GET(request: Request) {
  try {
    const uid = await userId();
    const params = new URL(request.url).searchParams;
    if (params.get("resource") === "categories")
      return Response.json({ categories: await getCategories(uid) });
    const competence = params.get("competence");
    if (!competence || !/^\d{4}-\d{2}-01$/.test(competence))
      return Response.json({ error: "Competência inválida." }, { status: 400 });
    return Response.json(await getFinanceData(uid, competence));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const uid = await userId();
    const body: unknown = await request.json();
    const base = z.object({ action: z.string() }).passthrough().parse(body);
    switch (base.action) {
      case "createWallet": {
        const v = z
          .object({
            action: z.literal("createWallet"),
            name: z.string(),
            type: z.enum(["CASH_ACCOUNT", "CREDIT_CARD"]),
            closingDay: z.number().int().optional(),
            dueDay: z.number().int().optional(),
            initialBalanceCents: z.number().int().safe().optional(),
          })
          .parse(body);
        await createWallet(uid, v);
        break;
      }
      case "updateWallet": {
        const v = z
          .object({
            action: z.literal("updateWallet"),
            id,
            name: z.string().optional(),
            active: z.boolean().optional(),
            closingDay: z.number().int().optional(),
            dueDay: z.number().int().optional(),
          })
          .parse(body);
        await updateWallet(uid, v.id, v);
        break;
      }
      case "adjustWallet": {
        const v = z
          .object({
            action: z.literal("adjustWallet"),
            walletId: id,
            amountCents: z
              .number()
              .int()
              .safe()
              .refine((value) => value !== 0),
            description: z.string().max(120),
            date,
          })
          .parse(body);
        await adjustWalletBalance(uid, v.walletId, v);
        break;
      }
      case "createCategory": {
        const v = z
          .object({
            action: z.literal("createCategory"),
            name: z.string(),
            type: z.enum(["INCOME", "EXPENSE", "BOTH"]),
          })
          .parse(body);
        await createCategory(uid, v);
        break;
      }
      case "updateCategory": {
        const v = z
          .object({
            action: z.literal("updateCategory"),
            id,
            name: z.string().optional(),
            active: z.boolean().optional(),
          })
          .parse(body);
        await updateCategory(uid, v.id, v);
        break;
      }
      case "createPurchase": {
        const v = purchaseInput
          .extend({ action: z.literal("createPurchase") })
          .parse(body);
        await createPurchase(uid, v);
        break;
      }
      case "createPurchaseBatch": {
        const v = z
          .object({
            action: z.literal("createPurchaseBatch"),
            purchases: z.array(purchaseInput).min(1).max(100),
          })
          .parse(body);
        for (const purchase of v.purchases)
          await createPurchase(uid, purchase);
        break;
      }
      case "createSchedule": {
        const v = z
          .object({
            action: z.literal("createSchedule"),
            description: z.string(),
            amountCents: money,
            type: z.enum(["INCOME", "EXPENSE"]),
            categoryId: id.optional(),
            walletId: id.optional(),
            autoBillEnabled: z.boolean().default(false),
            autoBillDay: z.number().int().min(1).max(31).optional(),
            startCompetence: competenceDate,
            endCompetence: competenceDate.optional(),
          })
          .parse(body);
        await createScheduledRule(uid, v);
        break;
      }
      case "billSchedule": {
        const v = z
          .object({
            action: z.literal("billSchedule"),
            id,
            walletId: id,
            amountCents: money,
            consumptionDate: date,
            description: z.string().optional(),
            categoryId: id.optional(),
          })
          .parse(body);
        await billScheduledEntry(uid, v.id, v);
        break;
      }
      case "skipSchedule": {
        const v = z
          .object({ action: z.literal("skipSchedule"), id })
          .parse(body);
        await skipScheduledEntry(uid, v.id);
        break;
      }
      case "deleteScheduleRule": {
        const v = z
          .object({ action: z.literal("deleteScheduleRule"), id })
          .parse(body);
        await deleteScheduledRule(uid, v.id);
        break;
      }
      case "payCard": {
        const v = z
          .object({
            action: z.literal("payCard"),
            cardId: id,
            sourceWalletId: id,
            amountCents: money,
            date,
            competence: date,
          })
          .parse(body);
        await payCreditCard(uid, v.cardId, v);
        break;
      }
      case "removeTransaction": {
        const v = z
          .object({ action: z.literal("removeTransaction"), id })
          .parse(body);
        await removeTransaction(uid, v.id);
        break;
      }
      case "updateTransaction": {
        const v = z
          .object({
            action: z.literal("updateTransaction"),
            id,
            description: z.string().min(1).max(120),
            walletId: id,
            consumptionDate: date,
            competence: date,
            type: z.enum(["INCOME", "EXPENSE"]),
          })
          .parse(body);
        await updateTransaction(uid, v.id, v);
        break;
      }
      default:
        return Response.json({ error: "Operação inválida." }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

function apiError(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError) return zodErrorResponse(error);
  console.error(
    "Finance operation failed",
    error instanceof Error ? error.message : "unknown",
  );
  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a operação.",
    },
    { status: 400 },
  );
}
