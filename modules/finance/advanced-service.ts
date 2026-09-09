import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  budgets,
  categories,
  goalEntries,
  goals,
  purchases,
  scheduledEntries,
  scheduledRules,
  transactions,
  wallets,
} from "@/db/schema";
import {
  addMonths,
  calculateInstallments,
  calculateProjectedBalance,
  scheduledDateForCompetence,
} from "./domain";

const now = () => new Date();
const activeTransaction = isNull(transactions.deletedAt);
type TransactionFilter = {
  page: number;
  pageSize: number;
  query?: string;
  competence?: string;
  from?: string;
  to?: string;
  walletId?: string;
  categoryId?: string;
  type?: string;
  minCents?: number;
  maxCents?: number;
  status?: "ACTIVE" | "DELETED" | "ALL";
};

export async function getTransactionsPage(
  userId: string,
  filter: TransactionFilter,
) {
  const conditions = [eq(transactions.userId, userId)];
  if (filter.query)
    conditions.push(ilike(transactions.description, `%${filter.query}%`));
  if (filter.competence)
    conditions.push(eq(transactions.competence, filter.competence));
  if (filter.from)
    conditions.push(gte(transactions.consumptionDate, filter.from));
  if (filter.to) conditions.push(lte(transactions.consumptionDate, filter.to));
  if (filter.walletId)
    conditions.push(eq(transactions.walletId, filter.walletId));
  if (filter.categoryId)
    conditions.push(eq(transactions.categoryId, filter.categoryId));
  if (filter.type)
    conditions.push(
      eq(
        transactions.type,
        filter.type as
          "INCOME" | "EXPENSE" | "TRANSFER" | "CARD_PAYMENT" | "ADJUSTMENT",
      ),
    );
  if (filter.minCents !== undefined)
    conditions.push(
      sql`abs(${transactions.amountCents}) >= ${filter.minCents}`,
    );
  if (filter.maxCents !== undefined)
    conditions.push(
      sql`abs(${transactions.amountCents}) <= ${filter.maxCents}`,
    );
  if (filter.status === "DELETED")
    conditions.push(isNotNull(transactions.deletedAt));
  else if (filter.status !== "ALL") conditions.push(activeTransaction);
  const where = and(...conditions);
  const offset = (filter.page - 1) * filter.pageSize;
  const [rows, countRows] = await Promise.all([
    getDb()
      .select({
        transaction: transactions,
        walletName: wallets.name,
        categoryName: categories.name,
      })
      .from(transactions)
      .innerJoin(
        wallets,
        and(eq(transactions.walletId, wallets.id), eq(wallets.userId, userId)),
      )
      .leftJoin(
        categories,
        and(
          eq(transactions.categoryId, categories.id),
          eq(categories.userId, userId),
        ),
      )
      .where(where)
      .orderBy(desc(transactions.consumptionDate), desc(transactions.createdAt))
      .limit(filter.pageSize)
      .offset(offset),
    getDb()
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(transactions)
      .where(where),
  ]);
  return {
    rows,
    total: countRows[0]?.count ?? 0,
    page: filter.page,
    pageSize: filter.pageSize,
    pages: Math.max(1, Math.ceil((countRows[0]?.count ?? 0) / filter.pageSize)),
  };
}

async function assertOwnedWallet(userId: string, id: string) {
  const [row] = await getDb()
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.id, id)))
    .limit(1);
  if (!row) throw new Error("Carteira não encontrada.");
}
async function assertOwnedCategory(userId: string, id: string) {
  const [row] = await getDb()
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.id, id)))
    .limit(1);
  if (!row) throw new Error("Categoria não encontrada.");
}

export async function batchTransactions(
  userId: string,
  ids: string[],
  action: "CATEGORY" | "WALLET" | "DELETE" | "RESTORE",
  targetId?: string,
) {
  if (!ids.length || ids.length > 200)
    throw new Error("Selecione entre 1 e 200 lançamentos.");
  if (action === "CATEGORY") {
    if (!targetId) throw new Error("Informe a categoria.");
    await assertOwnedCategory(userId, targetId);
    await getDb()
      .update(transactions)
      .set({ categoryId: targetId, updatedAt: now() })
      .where(
        and(
          eq(transactions.userId, userId),
          inArray(transactions.id, ids),
          activeTransaction,
        ),
      );
  }
  if (action === "WALLET") {
    if (!targetId) throw new Error("Informe a carteira.");
    await assertOwnedWallet(userId, targetId);
    await getDb()
      .update(transactions)
      .set({ walletId: targetId, updatedAt: now() })
      .where(
        and(
          eq(transactions.userId, userId),
          inArray(transactions.id, ids),
          activeTransaction,
          isNull(transactions.transferId),
        ),
      );
  }
  if (action === "DELETE")
    await getDb().transaction(async (tx) => {
      const affected = await tx
        .select({
          id: transactions.id,
          scheduledEntryId: transactions.scheduledEntryId,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            inArray(transactions.id, ids),
            activeTransaction,
            isNull(transactions.transferId),
          ),
        );
      if (!affected.length) return;
      await tx
        .update(transactions)
        .set({ deletedAt: now(), updatedAt: now() })
        .where(
          and(
            eq(transactions.userId, userId),
            inArray(
              transactions.id,
              affected.map((row) => row.id),
            ),
            activeTransaction,
          ),
        );
      const scheduleIds = affected.flatMap((row) =>
        row.scheduledEntryId ? [row.scheduledEntryId] : [],
      );
      if (scheduleIds.length)
        await tx
          .update(scheduledEntries)
          .set({
            status: "PENDING",
            billedTransactionId: null,
            updatedAt: now(),
          })
          .where(
            and(
              eq(scheduledEntries.userId, userId),
              inArray(scheduledEntries.id, scheduleIds),
            ),
          );
    });
  if (action === "RESTORE")
    await getDb()
      .update(transactions)
      .set({ deletedAt: null, updatedAt: now() })
      .where(
        and(
          eq(transactions.userId, userId),
          inArray(transactions.id, ids),
          isNotNull(transactions.deletedAt),
        ),
      );
}

export async function changeInstallments(
  userId: string,
  transactionId: string,
  scope: "THIS" | "FUTURE" | "ALL",
  mode: "EDIT" | "CANCEL",
  input: {
    description?: string;
    walletId?: string;
    categoryId?: string | null;
    type?: "INCOME" | "EXPENSE";
    totalAmountCents?: number;
  },
) {
  const [source] = await getDb()
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.id, transactionId),
        activeTransaction,
      ),
    )
    .limit(1);
  if (!source?.purchaseId)
    throw new Error("Este lançamento não pertence a uma compra parcelada.");
  const all = await getDb()
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.purchaseId, source.purchaseId),
        activeTransaction,
      ),
    )
    .orderBy(asc(transactions.installmentNumber));
  const selected =
    scope === "ALL"
      ? all
      : scope === "FUTURE"
        ? all.filter(
            (x) =>
              (x.installmentNumber ?? 1) >= (source.installmentNumber ?? 1),
          )
        : [source];
  const ids = selected.map((x) => x.id);
  if (mode === "CANCEL") {
    await getDb()
      .update(transactions)
      .set({ deletedAt: now(), updatedAt: now() })
      .where(
        and(eq(transactions.userId, userId), inArray(transactions.id, ids)),
      );
    return;
  }
  if (input.walletId) await assertOwnedWallet(userId, input.walletId);
  if (input.categoryId) await assertOwnedCategory(userId, input.categoryId);
  const selectedTotal =
    input.totalAmountCents ??
    selected.reduce((sum, x) => sum + Math.abs(x.amountCents), 0);
  const values = calculateInstallments(
    "TOTAL_VALUE",
    selectedTotal,
    selected.length,
  );
  const sign =
    input.type === "INCOME"
      ? 1
      : input.type === "EXPENSE"
        ? -1
        : source.amountCents < 0
          ? -1
          : 1;
  const db = getDb();
  await db.transaction(async (tx) => {
    for (let index = 0; index < selected.length; index++)
      await tx
        .update(transactions)
        .set({
          description: input.description?.trim() || selected[index].description,
          walletId: input.walletId ?? selected[index].walletId,
          categoryId:
            input.categoryId === undefined
              ? selected[index].categoryId
              : input.categoryId,
          type: input.type ?? (selected[index].type as "INCOME" | "EXPENSE"),
          amountCents: values[index] * sign,
          updatedAt: now(),
        })
        .where(
          and(
            eq(transactions.id, selected[index].id),
            eq(transactions.userId, userId),
          ),
        );
    if (scope === "ALL")
      await tx
        .update(purchases)
        .set({
          description: input.description?.trim() || source.description,
          totalAmountCents: selectedTotal,
          updatedAt: now(),
        })
        .where(
          and(
            eq(purchases.id, source.purchaseId!),
            eq(purchases.userId, userId),
          ),
        );
  });
}

export async function getRecurringRules(userId: string) {
  return getDb()
    .select({
      rule: scheduledRules,
      walletName: wallets.name,
      categoryName: categories.name,
    })
    .from(scheduledRules)
    .leftJoin(
      wallets,
      and(
        eq(scheduledRules.defaultWalletId, wallets.id),
        eq(wallets.userId, userId),
      ),
    )
    .leftJoin(
      categories,
      and(
        eq(scheduledRules.categoryId, categories.id),
        eq(categories.userId, userId),
      ),
    )
    .where(eq(scheduledRules.userId, userId))
    .orderBy(desc(scheduledRules.active), asc(scheduledRules.description));
}

export async function updateRecurringRule(
  userId: string,
  id: string,
  input: {
    description: string;
    amountCents: number;
    type: "INCOME" | "EXPENSE";
    categoryId?: string | null;
    walletId?: string | null;
    autoBillEnabled: boolean;
    autoBillDay?: number | null;
    startCompetence: string;
    endCompetence?: string | null;
    fromCompetence: string;
  },
) {
  const [rule] = await getDb()
    .select()
    .from(scheduledRules)
    .where(and(eq(scheduledRules.userId, userId), eq(scheduledRules.id, id)))
    .limit(1);
  if (!rule) throw new Error("Recorrência não encontrada.");
  if (input.walletId) await assertOwnedWallet(userId, input.walletId);
  if (input.autoBillEnabled && !input.walletId)
    throw new Error("Escolha uma carteira para ativar o faturamento automático.");
  if (
    input.autoBillEnabled &&
    (!input.autoBillDay || input.autoBillDay < 1 || input.autoBillDay > 31)
  )
    throw new Error("Informe um dia válido para o faturamento automático.");
  if (input.categoryId) await assertOwnedCategory(userId, input.categoryId);
  const sign = input.type === "EXPENSE" ? -1 : 1;
  const end = input.endCompetence ?? addMonths(input.fromCompetence, 59);
  const competences: string[] = [];
  for (
    let c = input.fromCompetence;
    c <= end && competences.length < 120;
    c = addMonths(c, 1)
  )
    competences.push(c);
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(scheduledRules)
      .set({
        description: input.description,
        defaultAmountCents: input.amountCents * sign,
        type: input.type,
        categoryId: input.categoryId || null,
        defaultWalletId: input.walletId || null,
        autoBillEnabled: input.autoBillEnabled,
        autoBillDay: input.autoBillDay ?? null,
        startCompetence: input.startCompetence,
        endCompetence: input.endCompetence || null,
        updatedAt: now(),
      })
      .where(and(eq(scheduledRules.id, id), eq(scheduledRules.userId, userId)));
    await tx
      .update(scheduledEntries)
      .set({
        description: input.description,
        expectedAmountCents: input.amountCents * sign,
        updatedAt: now(),
      })
      .where(
        and(
          eq(scheduledEntries.userId, userId),
          eq(scheduledEntries.scheduledRuleId, id),
          gte(scheduledEntries.competence, input.fromCompetence),
          lte(scheduledEntries.competence, end),
          or(
            eq(scheduledEntries.status, "PENDING"),
            eq(scheduledEntries.status, "PAUSED"),
          ),
        ),
      );
    if (input.endCompetence)
      await tx
        .update(scheduledEntries)
        .set({ status: "CANCELLED", updatedAt: now() })
        .where(
          and(
            eq(scheduledEntries.userId, userId),
            eq(scheduledEntries.scheduledRuleId, id),
            sql`${scheduledEntries.competence} > ${input.endCompetence}`,
            or(
              eq(scheduledEntries.status, "PENDING"),
              eq(scheduledEntries.status, "PAUSED"),
            ),
          ),
        );
    await tx
      .insert(scheduledEntries)
      .values(
        competences.map((competence) => ({
          userId,
          scheduledRuleId: id,
          description: input.description,
          expectedAmountCents: input.amountCents * sign,
          competence,
          status: rule.paused ? ("PAUSED" as const) : ("PENDING" as const),
        })),
      )
      .onConflictDoNothing({
        target: [scheduledEntries.scheduledRuleId, scheduledEntries.competence],
      });
  });
}
export async function setRecurringAutoBill(
  userId: string,
  id: string,
  enabled: boolean,
) {
  const [rule] = await getDb()
    .select({
      walletId: scheduledRules.defaultWalletId,
      autoBillDay: scheduledRules.autoBillDay,
    })
    .from(scheduledRules)
    .where(and(eq(scheduledRules.userId, userId), eq(scheduledRules.id, id)))
    .limit(1);
  if (!rule) throw new Error("Recorrência não encontrada.");
  if (enabled && (!rule.walletId || !rule.autoBillDay))
    throw new Error("Defina carteira e dia antes de ativar o faturamento automático.");
  await getDb()
    .update(scheduledRules)
    .set({ autoBillEnabled: enabled, updatedAt: now() })
    .where(and(eq(scheduledRules.userId, userId), eq(scheduledRules.id, id)));
}

export async function runScheduledAutoBilling(today: string) {
  const currentCompetence = `${today.slice(0, 7)}-01`;
  const db = getDb();
  const candidates = await db
    .select({ entry: scheduledEntries, rule: scheduledRules })
    .from(scheduledEntries)
    .innerJoin(
      scheduledRules,
      eq(scheduledEntries.scheduledRuleId, scheduledRules.id),
    )
    .where(
      and(
        eq(scheduledEntries.status, "PENDING"),
        lte(scheduledEntries.competence, currentCompetence),
        eq(scheduledRules.autoBillEnabled, true),
        eq(scheduledRules.active, true),
        eq(scheduledRules.paused, false),
        isNotNull(scheduledRules.defaultWalletId),
        isNotNull(scheduledRules.autoBillDay),
      ),
    );
  const due = candidates.filter(
    ({ entry, rule }) =>
      scheduledDateForCompetence(entry.competence, rule.autoBillDay!) <= today,
  );
  let billed = 0;
  for (const { entry, rule } of due) {
    const transactionId = crypto.randomUUID();
    const created = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(scheduledEntries)
        .set({
          status: "BILLED",
          billedTransactionId: transactionId,
          updatedAt: now(),
        })
        .where(
          and(
            eq(scheduledEntries.id, entry.id),
            eq(scheduledEntries.status, "PENDING"),
          ),
        )
        .returning({ id: scheduledEntries.id });
      if (!claimed.length) return false;
      await tx.insert(transactions).values({
        id: transactionId,
        userId: entry.userId,
        walletId: rule.defaultWalletId!,
        scheduledEntryId: entry.id,
        externalId: `auto-schedule:${entry.id}`,
        description: entry.description,
        amountCents: entry.expectedAmountCents,
        type: rule.type,
        categoryId: rule.categoryId,
        consumptionDate: scheduledDateForCompetence(
          entry.competence,
          rule.autoBillDay!,
        ),
        competence: entry.competence,
      });
      return true;
    });
    if (created) billed += 1;
  }
  return { checked: candidates.length, due: due.length, billed };
}
export async function setRecurringState(
  userId: string,
  id: string,
  state: "ACTIVE" | "PAUSED" | "ENDED",
  fromCompetence: string,
) {
  const db = getDb();
  const paused = state === "PAUSED",
    active = state !== "ENDED";
  await db.transaction(async (tx) => {
    await tx
      .update(scheduledRules)
      .set({ paused, active, updatedAt: now() })
      .where(and(eq(scheduledRules.userId, userId), eq(scheduledRules.id, id)));
    if (state === "ACTIVE")
      await tx
        .update(scheduledEntries)
        .set({ status: "PENDING", updatedAt: now() })
        .where(
          and(
            eq(scheduledEntries.userId, userId),
            eq(scheduledEntries.scheduledRuleId, id),
            gte(scheduledEntries.competence, fromCompetence),
            eq(scheduledEntries.status, "PAUSED"),
          ),
        );
    if (state === "PAUSED")
      await tx
        .update(scheduledEntries)
        .set({ status: "PAUSED", updatedAt: now() })
        .where(
          and(
            eq(scheduledEntries.userId, userId),
            eq(scheduledEntries.scheduledRuleId, id),
            gte(scheduledEntries.competence, fromCompetence),
            eq(scheduledEntries.status, "PENDING"),
          ),
        );
    if (state === "ENDED")
      await tx
        .update(scheduledEntries)
        .set({ status: "CANCELLED", updatedAt: now() })
        .where(
          and(
            eq(scheduledEntries.userId, userId),
            eq(scheduledEntries.scheduledRuleId, id),
            gte(scheduledEntries.competence, fromCompetence),
            or(
              eq(scheduledEntries.status, "PENDING"),
              eq(scheduledEntries.status, "PAUSED"),
            ),
          ),
        );
  });
}

export async function getGoals(userId: string) {
  return getDb()
    .select({
      goal: goals,
      savedCents:
        sql<number>`coalesce(sum(${goalEntries.amountCents}),0)`.mapWith(
          Number,
        ),
    })
    .from(goals)
    .leftJoin(
      goalEntries,
      and(eq(goals.id, goalEntries.goalId), eq(goalEntries.userId, userId)),
    )
    .where(eq(goals.userId, userId))
    .groupBy(goals.id)
    .orderBy(desc(goals.active), asc(goals.targetDate));
}
export async function createGoal(
  userId: string,
  input: { name: string; targetAmountCents: number; targetDate?: string },
) {
  await getDb()
    .insert(goals)
    .values({
      userId,
      name: input.name.trim(),
      targetAmountCents: input.targetAmountCents,
      targetDate: input.targetDate || null,
    });
}
export async function addGoalEntry(
  userId: string,
  goalId: string,
  amountCents: number,
  date: string,
  description: string,
) {
  const [goal] = await getDb()
    .select({ id: goals.id })
    .from(goals)
    .where(
      and(
        eq(goals.userId, userId),
        eq(goals.id, goalId),
        eq(goals.active, true),
      ),
    )
    .limit(1);
  if (!goal) throw new Error("Meta não encontrada.");
  const [balance] = await getDb()
    .select({
      amount: sql<number>`coalesce(sum(${goalEntries.amountCents}),0)`.mapWith(
        Number,
      ),
    })
    .from(goalEntries)
    .where(and(eq(goalEntries.userId, userId), eq(goalEntries.goalId, goalId)));
  if ((balance?.amount ?? 0) + amountCents < 0)
    throw new Error("A retirada não pode superar o valor reservado.");
  await getDb()
    .insert(goalEntries)
    .values({
      userId,
      goalId,
      amountCents,
      entryDate: date,
      description: description.trim() || "Aporte",
    });
}
export async function archiveGoal(userId: string, id: string) {
  await getDb()
    .update(goals)
    .set({ active: false, updatedAt: now() })
    .where(and(eq(goals.userId, userId), eq(goals.id, id)));
}
export async function setBudget(
  userId: string,
  categoryId: string,
  competence: string,
  amountCents: number,
) {
  await assertOwnedCategory(userId, categoryId);
  await getDb()
    .insert(budgets)
    .values({ userId, categoryId, competence, amountCents })
    .onConflictDoUpdate({
      target: [budgets.userId, budgets.categoryId, budgets.competence],
      set: { amountCents, updatedAt: now() },
    });
}

export async function getReports(userId: string, from: string, to: string) {
  const base = and(
    eq(transactions.userId, userId),
    activeTransaction,
    gte(transactions.competence, from),
    lte(transactions.competence, to),
  );
  const [monthly, byCategory, budgetRows, reservedRows, pendingRows] =
    await Promise.all([
      getDb()
        .select({
          competence: transactions.competence,
          income:
            sql<number>`coalesce(sum(case when ${transactions.amountCents}>0 and ${transactions.type} not in ('TRANSFER','CARD_PAYMENT') then ${transactions.amountCents} else 0 end),0)`.mapWith(
              Number,
            ),
          expense:
            sql<number>`coalesce(sum(case when ${transactions.amountCents}<0 and ${transactions.type} not in ('TRANSFER','CARD_PAYMENT') then -${transactions.amountCents} else 0 end),0)`.mapWith(
              Number,
            ),
          net: sql<number>`coalesce(sum(case when ${transactions.type} not in ('TRANSFER','CARD_PAYMENT') then ${transactions.amountCents} else 0 end),0)`.mapWith(
            Number,
          ),
        })
        .from(transactions)
        .where(base)
        .groupBy(transactions.competence)
        .orderBy(transactions.competence),
      getDb()
        .select({
          categoryId: transactions.categoryId,
          name: sql<string>`coalesce(${categories.name},'Sem categoria')`,
          expense:
            sql<number>`coalesce(sum(-${transactions.amountCents}),0)`.mapWith(
              Number,
            ),
        })
        .from(transactions)
        .leftJoin(
          categories,
          and(
            eq(transactions.categoryId, categories.id),
            eq(categories.userId, userId),
          ),
        )
        .where(
          and(
            base,
            sql`${transactions.amountCents}<0`,
            eq(transactions.type, "EXPENSE"),
          ),
        )
        .groupBy(transactions.categoryId, categories.name)
        .orderBy(desc(sql`sum(-${transactions.amountCents})`)),
      getDb()
        .select({
          categoryId: budgets.categoryId,
          name: categories.name,
          competence: budgets.competence,
          budget: budgets.amountCents,
          actual:
            sql<number>`coalesce(sum(case when ${transactions.amountCents}<0 and ${transactions.type}='EXPENSE' then -${transactions.amountCents} else 0 end),0)`.mapWith(
              Number,
            ),
        })
        .from(budgets)
        .innerJoin(
          categories,
          and(
            eq(budgets.categoryId, categories.id),
            eq(categories.userId, userId),
          ),
        )
        .leftJoin(
          transactions,
          and(
            eq(transactions.userId, userId),
            eq(transactions.categoryId, budgets.categoryId),
            eq(transactions.competence, budgets.competence),
            activeTransaction,
          ),
        )
        .where(
          and(
            eq(budgets.userId, userId),
            gte(budgets.competence, from),
            lte(budgets.competence, to),
          ),
        )
        .groupBy(budgets.id, categories.name),
      getDb()
        .select({
          amount:
            sql<number>`coalesce(sum(${goalEntries.amountCents}),0)`.mapWith(
              Number,
            ),
        })
        .from(goalEntries)
        .where(eq(goalEntries.userId, userId)),
      getDb()
        .select({
          competence: scheduledEntries.competence,
          amount:
            sql<number>`coalesce(sum(${scheduledEntries.expectedAmountCents}),0)`.mapWith(
              Number,
            ),
        })
        .from(scheduledEntries)
        .where(
          and(
            eq(scheduledEntries.userId, userId),
            eq(scheduledEntries.status, "PENDING"),
            gte(scheduledEntries.competence, from),
            lte(scheduledEntries.competence, to),
          ),
        )
        .groupBy(scheduledEntries.competence)
        .orderBy(scheduledEntries.competence),
    ]);
  let cumulative = 0;
  const evolution = monthly.map((row) => ({
    ...row,
    balance: (cumulative += row.net),
  }));
  return {
    monthly,
    evolution,
    byCategory,
    budgets: budgetRows,
    reservedCents: reservedRows[0]?.amount ?? 0,
    projection: pendingRows,
  };
}

export async function getPlanning(
  userId: string,
  from: string,
  months: number,
) {
  const horizon = Math.min(72, Math.max(1, months));
  const to = addMonths(from, horizon - 1);
  const db = getDb();
  const [transactionFlows, monthlyActual, pendingRows, categoryActual, categoryPlanned] =
    await Promise.all([
      db
        .select({
          competence: transactions.competence,
          walletType: wallets.type,
          amountCents:
            sql<number>`coalesce(sum(${transactions.amountCents}),0)`.mapWith(Number),
        })
        .from(transactions)
        .innerJoin(
          wallets,
          and(eq(transactions.walletId, wallets.id), eq(wallets.userId, userId)),
        )
        .where(
          and(
            eq(transactions.userId, userId),
            activeTransaction,
            lte(transactions.competence, to),
          ),
        )
        .groupBy(transactions.competence, wallets.type)
        .orderBy(transactions.competence),
      db
        .select({
          competence: transactions.competence,
          incomeCents:
            sql<number>`coalesce(sum(case when ${transactions.amountCents}>0 and ${transactions.type} not in ('TRANSFER','CARD_PAYMENT') then ${transactions.amountCents} else 0 end),0)`.mapWith(Number),
          expenseCents:
            sql<number>`coalesce(sum(case when ${transactions.amountCents}<0 and ${transactions.type} not in ('TRANSFER','CARD_PAYMENT') then -${transactions.amountCents} else 0 end),0)`.mapWith(Number),
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            activeTransaction,
            gte(transactions.competence, from),
            lte(transactions.competence, to),
          ),
        )
        .groupBy(transactions.competence),
      db
        .select({
          competence: scheduledEntries.competence,
          incomeCents:
            sql<number>`coalesce(sum(case when ${scheduledEntries.expectedAmountCents}>0 then ${scheduledEntries.expectedAmountCents} else 0 end),0)`.mapWith(Number),
          expenseCents:
            sql<number>`coalesce(sum(case when ${scheduledEntries.expectedAmountCents}<0 then -${scheduledEntries.expectedAmountCents} else 0 end),0)`.mapWith(Number),
        })
        .from(scheduledEntries)
        .where(
          and(
            eq(scheduledEntries.userId, userId),
            eq(scheduledEntries.status, "PENDING"),
            lte(scheduledEntries.competence, to),
          ),
        )
        .groupBy(scheduledEntries.competence),
      db
        .select({
          competence: transactions.competence,
          name: sql<string>`coalesce(${categories.name},'Sem categoria')`,
          amountCents:
            sql<number>`coalesce(sum(-${transactions.amountCents}),0)`.mapWith(Number),
        })
        .from(transactions)
        .leftJoin(
          categories,
          and(eq(transactions.categoryId, categories.id), eq(categories.userId, userId)),
        )
        .where(
          and(
            eq(transactions.userId, userId),
            activeTransaction,
            eq(transactions.type, "EXPENSE"),
            sql`${transactions.amountCents}<0`,
            gte(transactions.competence, from),
            lte(transactions.competence, to),
          ),
        )
        .groupBy(transactions.competence, transactions.categoryId, categories.name),
      db
        .select({
          competence: scheduledEntries.competence,
          name: sql<string>`coalesce(${categories.name},'Sem categoria')`,
          amountCents:
            sql<number>`coalesce(sum(-${scheduledEntries.expectedAmountCents}),0)`.mapWith(Number),
        })
        .from(scheduledEntries)
        .innerJoin(
          scheduledRules,
          and(
            eq(scheduledEntries.scheduledRuleId, scheduledRules.id),
            eq(scheduledRules.userId, userId),
          ),
        )
        .leftJoin(
          categories,
          and(eq(scheduledRules.categoryId, categories.id), eq(categories.userId, userId)),
        )
        .where(
          and(
            eq(scheduledEntries.userId, userId),
            eq(scheduledEntries.status, "PENDING"),
            sql`${scheduledEntries.expectedAmountCents}<0`,
            gte(scheduledEntries.competence, from),
            lte(scheduledEntries.competence, to),
          ),
        )
        .groupBy(scheduledEntries.competence, scheduledRules.categoryId, categories.name),
    ]);

  const actualByMonth = new Map(monthlyActual.map((row) => [row.competence, row]));
  const pendingByMonth = new Map(pendingRows.map((row) => [row.competence, row]));
  const categoryMap = new Map<string, { name: string; actualCents: number; plannedCents: number }>();
  for (const row of categoryActual) {
    const key = `${row.competence}:${row.name}`;
    categoryMap.set(key, { name: row.name, actualCents: row.amountCents, plannedCents: 0 });
  }
  for (const row of categoryPlanned) {
    const key = `${row.competence}:${row.name}`;
    const current = categoryMap.get(key) ?? { name: row.name, actualCents: 0, plannedCents: 0 };
    current.plannedCents += row.amountCents;
    categoryMap.set(key, current);
  }

  let cashBalanceCents = 0;
  let cardBalanceCents = 0;
  for (const row of transactionFlows.filter((row) => row.competence < from)) {
    if (row.walletType === "CASH_ACCOUNT") cashBalanceCents += row.amountCents;
    else cardBalanceCents += row.amountCents;
  }
  const flowByMonth = new Map<string, typeof transactionFlows>();
  for (const row of transactionFlows.filter((row) => row.competence >= from)) {
    const list = flowByMonth.get(row.competence) ?? [];
    list.push(row);
    flowByMonth.set(row.competence, list);
  }
  const overdue = pendingRows
    .filter((row) => row.competence < from)
    .reduce(
      (sum, row) => ({
        incomeCents: sum.incomeCents + row.incomeCents,
        expenseCents: sum.expenseCents + row.expenseCents,
      }),
      { incomeCents: 0, expenseCents: 0 },
    );
  let plannedIncomeAccumulatedCents = overdue.incomeCents;
  let plannedExpenseAccumulatedCents = overdue.expenseCents;
  const categoryTotals = Array.from(categoryMap.values())
    .reduce((map, category) => {
      const current = map.get(category.name) ?? { name: category.name, actualCents: 0, plannedCents: 0 };
      current.actualCents += category.actualCents;
      current.plannedCents += category.plannedCents;
      map.set(category.name, current);
      return map;
    }, new Map<string, { name: string; actualCents: number; plannedCents: number }>())
    .values();
  const timeline = Array.from({ length: horizon }, (_, index) => {
    const competence = addMonths(from, index);
    for (const flow of flowByMonth.get(competence) ?? []) {
      if (flow.walletType === "CASH_ACCOUNT") cashBalanceCents += flow.amountCents;
      else cardBalanceCents += flow.amountCents;
    }
    const actual = actualByMonth.get(competence);
    const planned = pendingByMonth.get(competence);
    plannedIncomeAccumulatedCents += planned?.incomeCents ?? 0;
    plannedExpenseAccumulatedCents += planned?.expenseCents ?? 0;
    const cardDebtCents = Math.abs(Math.min(cardBalanceCents, 0));
    return {
      competence,
      actualIncomeCents: actual?.incomeCents ?? 0,
      actualExpenseCents: actual?.expenseCents ?? 0,
      realBalanceCents: cashBalanceCents,
      cardDebtCents,
      plannedIncomeCents: planned?.incomeCents ?? 0,
      plannedExpenseCents: planned?.expenseCents ?? 0,
      overdueIncomeCents: index === 0 ? overdue.incomeCents : 0,
      overdueExpenseCents: index === 0 ? overdue.expenseCents : 0,
      plannedBalanceCents: calculateProjectedBalance(
        cashBalanceCents,
        plannedIncomeAccumulatedCents,
        0,
        plannedExpenseAccumulatedCents,
        0,
        cardDebtCents,
      ),
      categories: Array.from(categoryMap.entries())
        .filter(([key]) => key.startsWith(`${competence}:`))
        .map(([, value]) => value)
        .sort((a, b) => b.actualCents + b.plannedCents - (a.actualCents + a.plannedCents))
        .slice(0, 5),
    };
  });
  return {
    from,
    to,
    months: horizon,
    timeline,
    categoryTotals: Array.from(categoryTotals).sort(
      (a, b) =>
        b.actualCents + b.plannedCents - (a.actualCents + a.plannedCents),
    ),
  };
}

export async function getPendingCenter(userId: string, today: string) {
  const competence = `${today.slice(0, 7)}-01`;
  const [overdue, uncategorized, duplicates, cards] = await Promise.all([
    getDb()
      .select()
      .from(scheduledEntries)
      .where(
        and(
          eq(scheduledEntries.userId, userId),
          eq(scheduledEntries.status, "PENDING"),
          sql`${scheduledEntries.competence}<${competence}`,
        ),
      )
      .orderBy(scheduledEntries.competence)
      .limit(100),
    getDb()
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          activeTransaction,
          isNull(transactions.categoryId),
          or(eq(transactions.type, "INCOME"), eq(transactions.type, "EXPENSE")),
        ),
      )
      .orderBy(desc(transactions.consumptionDate))
      .limit(100),
    getDb()
      .select({
        description: transactions.description,
        amountCents: transactions.amountCents,
        consumptionDate: transactions.consumptionDate,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), activeTransaction))
      .groupBy(
        transactions.description,
        transactions.amountCents,
        transactions.consumptionDate,
      )
      .having(sql`count(*)>1`)
      .limit(50),
    getDb()
      .select({
        id: wallets.id,
        name: wallets.name,
        dueDay: wallets.dueDay,
        balance:
          sql<number>`coalesce(sum(${transactions.amountCents}),0)`.mapWith(
            Number,
          ),
      })
      .from(wallets)
      .leftJoin(
        transactions,
        and(
          eq(wallets.id, transactions.walletId),
          eq(transactions.userId, userId),
          activeTransaction,
        ),
      )
      .where(
        and(
          eq(wallets.userId, userId),
          eq(wallets.type, "CREDIT_CARD"),
          eq(wallets.active, true),
        ),
      )
      .groupBy(wallets.id),
  ]);
  return {
    overdue,
    uncategorized,
    duplicates,
    cards: cards
      .filter((x) => x.balance < 0)
      .map((x) => ({
        ...x,
        dueSoon: (x.dueDay ?? 32) - Number(today.slice(8, 10)) <= 7,
      })),
  };
}
