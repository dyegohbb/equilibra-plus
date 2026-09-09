import { z } from "zod";
import { getSession } from "@/lib/auth/server";
import { postgresUuid, zodErrorResponse } from "@/lib/api-validation";
import {
  addGoalEntry,
  archiveGoal,
  batchTransactions,
  changeInstallments,
  createGoal,
  getGoals,
  getPendingCenter,
  getRecurringRules,
  getReports,
  getTransactionsPage,
  setBudget,
  setRecurringAutoBill,
  setRecurringState,
  updateRecurringRule,
} from "@/modules/finance/advanced-service";

export const dynamic = "force-dynamic";
const uuid = postgresUuid,
  date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  money = z.number().int().positive().safe();
async function userId() {
  const session = await getSession();
  if (!session?.user?.id)
    throw new Response("Não autorizado.", { status: 401 });
  return session.user.id;
}
export async function GET(request: Request) {
  try {
    const uid = await userId(),
      url = new URL(request.url),
      mode = url.searchParams.get("mode");
    if (mode === "transactions")
      return Response.json(
        await getTransactionsPage(uid, {
          page: Math.max(1, Number(url.searchParams.get("page")) || 1),
          pageSize: Math.min(
            100,
            Math.max(10, Number(url.searchParams.get("pageSize")) || 25),
          ),
          query: url.searchParams.get("query") || undefined,
          competence: url.searchParams.get("competence") || undefined,
          from: url.searchParams.get("from") || undefined,
          to: url.searchParams.get("to") || undefined,
          walletId: url.searchParams.get("walletId") || undefined,
          categoryId: url.searchParams.get("categoryId") || undefined,
          type: url.searchParams.get("type") || undefined,
          minCents: url.searchParams.has("minCents")
            ? Number(url.searchParams.get("minCents"))
            : undefined,
          maxCents: url.searchParams.has("maxCents")
            ? Number(url.searchParams.get("maxCents"))
            : undefined,
          status: (url.searchParams.get("status") || "ACTIVE") as
            "ACTIVE" | "DELETED" | "ALL",
        }),
      );
    if (mode === "recurring")
      return Response.json(await getRecurringRules(uid));
    if (mode === "goals") return Response.json(await getGoals(uid));
    if (mode === "reports")
      return Response.json(
        await getReports(
          uid,
          url.searchParams.get("from") || "2026-01-01",
          url.searchParams.get("to") || "2026-12-01",
        ),
      );
    if (mode === "pending") {
      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Recife",
      });
      return Response.json(await getPendingCenter(uid, today));
    }
    return Response.json({ error: "Consulta inválida." }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const uid = await userId(),
      body: unknown = await request.json(),
      base = z.object({ action: z.string() }).passthrough().parse(body);
    switch (base.action) {
      case "batchTransactions": {
        const v = z
          .object({
            action: z.literal("batchTransactions"),
            ids: z.array(uuid).min(1).max(200),
            operation: z.enum(["CATEGORY", "WALLET", "DELETE", "RESTORE"]),
            targetId: uuid.optional(),
          })
          .parse(body);
        await batchTransactions(uid, v.ids, v.operation, v.targetId);
        break;
      }
      case "changeInstallments": {
        const v = z
          .object({
            action: z.literal("changeInstallments"),
            transactionId: uuid,
            scope: z.enum(["THIS", "FUTURE", "ALL"]),
            mode: z.enum(["EDIT", "CANCEL"]),
            description: z.string().max(120).optional(),
            walletId: uuid.optional(),
            categoryId: uuid.nullable().optional(),
            type: z.enum(["INCOME", "EXPENSE"]).optional(),
            totalAmountCents: money.optional(),
          })
          .parse(body);
        await changeInstallments(uid, v.transactionId, v.scope, v.mode, v);
        break;
      }
      case "updateRecurring": {
        const v = z
          .object({
            action: z.literal("updateRecurring"),
            id: uuid,
            description: z.string().min(1).max(120),
            amountCents: money,
            type: z.enum(["INCOME", "EXPENSE"]),
            categoryId: uuid.nullable().optional(),
            walletId: uuid.nullable().optional(),
            autoBillEnabled: z.boolean(),
            autoBillDay: z.number().int().min(1).max(31).nullable().optional(),
            startCompetence: date,
            endCompetence: date.nullable().optional(),
            fromCompetence: date,
          })
          .parse(body);
        await updateRecurringRule(uid, v.id, v);
        break;
      }
      case "setRecurringAutoBill": {
        const v = z
          .object({
            action: z.literal("setRecurringAutoBill"),
            id: uuid,
            enabled: z.boolean(),
          })
          .parse(body);
        await setRecurringAutoBill(uid, v.id, v.enabled);
        break;
      }
      case "setRecurringState": {
        const v = z
          .object({
            action: z.literal("setRecurringState"),
            id: uuid,
            state: z.enum(["ACTIVE", "PAUSED", "ENDED"]),
            fromCompetence: date,
          })
          .parse(body);
        await setRecurringState(uid, v.id, v.state, v.fromCompetence);
        break;
      }
      case "createGoal": {
        const v = z
          .object({
            action: z.literal("createGoal"),
            name: z.string().min(1).max(80),
            targetAmountCents: money,
            targetDate: date.optional(),
          })
          .parse(body);
        await createGoal(uid, v);
        break;
      }
      case "addGoalEntry": {
        const v = z
          .object({
            action: z.literal("addGoalEntry"),
            goalId: uuid,
            amountCents: z
              .number()
              .int()
              .safe()
              .refine((x) => x !== 0),
            date,
            description: z.string().max(120),
          })
          .parse(body);
        await addGoalEntry(uid, v.goalId, v.amountCents, v.date, v.description);
        break;
      }
      case "archiveGoal": {
        const v = z
          .object({ action: z.literal("archiveGoal"), id: uuid })
          .parse(body);
        await archiveGoal(uid, v.id);
        break;
      }
      case "setBudget": {
        const v = z
          .object({
            action: z.literal("setBudget"),
            categoryId: uuid,
            competence: date,
            amountCents: money,
          })
          .parse(body);
        await setBudget(uid, v.categoryId, v.competence, v.amountCents);
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
    "Advanced finance operation failed",
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
