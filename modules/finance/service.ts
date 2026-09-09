import "server-only";
import { and, asc, desc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  categories,
  goalEntries,
  purchases,
  scheduledEntries,
  scheduledRules,
  transactions,
  wallets,
} from "@/db/schema";
import {
  addMonths,
  calculateCompetence,
  calculateInstallmentCompetences,
  calculateInstallments,
  calculateProjectedBalance,
  type InstallmentMode,
} from "./domain";

type TransactionKind = "INCOME" | "EXPENSE";
const now = () => new Date();

export async function getCategories(userId: string) {
  return getDb()
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(desc(categories.active), asc(categories.name));
}

export async function getFinanceData(userId: string, competence: string) {
  const db = getDb();
  const [
    walletRows,
    categoryRows,
    transactionRows,
    scheduleRows,
    balanceRows,
    pendingBalanceRows,
    reservedRows,
    cardInvoiceRows,
    monthSummaryRows,
  ] = await Promise.all([
    db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .orderBy(desc(wallets.active), asc(wallets.name)),
    db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(desc(categories.active), asc(categories.name)),
    db
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
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.competence, competence),
          isNull(transactions.deletedAt),
        ),
      )
      .orderBy(desc(transactions.consumptionDate), desc(transactions.createdAt)),
    db
      .select({
        entry: scheduledEntries,
        categoryName: categories.name,
        defaultWalletId: scheduledRules.defaultWalletId,
      })
      .from(scheduledEntries)
      .leftJoin(
        scheduledRules,
        and(
          eq(scheduledEntries.scheduledRuleId, scheduledRules.id),
          eq(scheduledRules.userId, userId),
        ),
      )
      .leftJoin(
        categories,
        and(
          eq(scheduledRules.categoryId, categories.id),
          eq(categories.userId, userId),
        ),
      )
      .where(
        and(
          eq(scheduledEntries.userId, userId),
          eq(scheduledEntries.competence, competence),
        ),
      )
      .orderBy(asc(scheduledEntries.description)),
    db
      .select({
        walletId: transactions.walletId,
        balanceCents:
          sql<number>`coalesce(sum(${transactions.amountCents}), 0)`.mapWith(
            Number,
          ),
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          lte(transactions.competence, competence),
          isNull(transactions.deletedAt),
        ),
      )
      .groupBy(transactions.walletId),
    db
      .select({
        incomeCents:
          sql<number>`coalesce(sum(case when ${scheduledEntries.expectedAmountCents} > 0 then ${scheduledEntries.expectedAmountCents} else 0 end), 0)`.mapWith(
            Number,
          ),
        expenseCents:
          sql<number>`coalesce(sum(case when ${scheduledEntries.expectedAmountCents} < 0 then -${scheduledEntries.expectedAmountCents} else 0 end), 0)`.mapWith(
            Number,
          ),
        count:
          sql<number>`count(*) filter (where ${scheduledEntries.expectedAmountCents} < 0)`.mapWith(
            Number,
          ),
        oldestCompetence: sql<
          string | null
        >`min(${scheduledEntries.competence}) filter (where ${scheduledEntries.expectedAmountCents} < 0)`,
      })
      .from(scheduledEntries)
      .where(
        and(
          eq(scheduledEntries.userId, userId),
          lte(scheduledEntries.competence, competence),
          eq(scheduledEntries.status, "PENDING"),
        ),
      ),
    db
      .select({
        amountCents:
          sql<number>`coalesce(sum(${goalEntries.amountCents}), 0)`.mapWith(
            Number,
          ),
      })
      .from(goalEntries)
      .where(eq(goalEntries.userId, userId)),
    db
      .select({
        walletId: transactions.walletId,
        amountCents:
          sql<number>`coalesce(sum(${transactions.amountCents}), 0)`.mapWith(
            Number,
          ),
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.competence, competence),
          isNotNull(transactions.purchaseId),
          isNull(transactions.deletedAt),
        ),
      )
      .groupBy(transactions.walletId),
    db
      .select({
        incomeCents:
          sql<number>`coalesce(sum(case when ${transactions.amountCents} > 0 and ${transactions.type} not in ('CARD_PAYMENT','TRANSFER') then ${transactions.amountCents} else 0 end), 0)`.mapWith(
            Number,
          ),
        expenseCents:
          sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 and ${transactions.type} not in ('CARD_PAYMENT','TRANSFER') then -${transactions.amountCents} else 0 end), 0)`.mapWith(
            Number,
          ),
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.competence, competence),
          isNull(transactions.deletedAt),
        ),
      ),
  ]);
  const incomeCents = monthSummaryRows[0]?.incomeCents ?? 0;
  const expenseCents = monthSummaryRows[0]?.expenseCents ?? 0;
  const pendingCurrentExpenseCents = scheduleRows
    .filter(
      ({ entry }) =>
        entry.status === "PENDING" && entry.expectedAmountCents < 0,
    )
    .reduce((sum, { entry }) => sum + Math.abs(entry.expectedAmountCents), 0);
  const balances = new Map(
    balanceRows.map((row) => [row.walletId, row.balanceCents]),
  );
  const walletBalances = walletRows.map((wallet) => ({
    ...wallet,
    balanceCents: balances.get(wallet.id) ?? 0,
  }));
  const availableBalanceCents = walletBalances
    .filter((wallet) => wallet.type === "CASH_ACCOUNT")
    .reduce((sum, wallet) => sum + wallet.balanceCents, 0);
  const cardDebtCents = walletBalances
    .filter((wallet) => wallet.type === "CREDIT_CARD")
    .reduce(
      (sum, wallet) => sum + Math.abs(Math.min(wallet.balanceCents, 0)),
      0,
    );
  const netWorthCents = walletBalances.reduce(
    (sum, wallet) => sum + wallet.balanceCents,
    0,
  );
  const pendingIncomeAccumulatedCents = pendingBalanceRows[0]?.incomeCents ?? 0;
  const pendingExpenseAccumulatedCents =
    pendingBalanceRows[0]?.expenseCents ?? 0;
  const pendingPreviousExpenseCents = Math.max(
    0,
    pendingExpenseAccumulatedCents - pendingCurrentExpenseCents,
  );
  const pendingAccumulatedCount = pendingBalanceRows[0]?.count ?? 0;
  const pendingOldestCompetence =
    pendingBalanceRows[0]?.oldestCompetence ?? null;
  const pendingAccumulatedCents =
    pendingIncomeAccumulatedCents - pendingExpenseAccumulatedCents;
  const reservedCents = Math.max(0, reservedRows[0]?.amountCents ?? 0);
  const unreservedBalanceCents = availableBalanceCents - reservedCents;
  const invoiceByWallet = new Map(
    cardInvoiceRows.map((row) => [row.walletId, row.amountCents]),
  );
  const cards = walletBalances
    .filter((wallet) => wallet.type === "CREDIT_CARD")
    .map((wallet) => ({
      ...wallet,
      invoiceCents: Math.abs(invoiceByWallet.get(wallet.id) ?? 0),
      outstandingCents: Math.abs(Math.min(wallet.balanceCents, 0)),
    }));
  const projectedAvailableBalanceCents = calculateProjectedBalance(
    availableBalanceCents,
    pendingCurrentExpenseCents,
    pendingPreviousExpenseCents,
    cardDebtCents,
  );
  const categoryMap = new Map<string, number>();
  for (const row of transactionRows) {
    if (
      row.transaction.type !== "EXPENSE" ||
      row.transaction.amountCents >= 0
    )
      continue;
    const name = row.categoryName ?? "Sem categoria";
    categoryMap.set(
      name,
      (categoryMap.get(name) ?? 0) + Math.abs(row.transaction.amountCents),
    );
  }
  const categoryExpenses = Array.from(categoryMap, ([name, amountCents]) => ({
    name,
    amountCents,
  })).sort((a, b) => b.amountCents - a.amountCents);
  return {
    wallets: walletRows,
    walletBalances,
    categories: categoryRows,
    transactions: transactionRows,
    scheduled: scheduleRows,
    summary: {
      incomeCents,
      expenseCents,
      balanceCents: incomeCents - expenseCents,
      pendingCents: pendingCurrentExpenseCents,
      pendingCurrentExpenseCents,
      pendingPreviousExpenseCents,
      pendingAccumulatedCents,
      pendingIncomeAccumulatedCents,
      pendingExpenseAccumulatedCents,
      pendingAccumulatedCount,
      pendingOldestCompetence,
      projectedAvailableBalanceCents,
      availableBalanceCents,
      reservedCents,
      unreservedBalanceCents,
      cardDebtCents,
      netWorthCents,
    },
    categoryExpenses,
    cards,
  };
}

export async function createWallet(
  userId: string,
  input: {
    name: string;
    type: "CASH_ACCOUNT" | "CREDIT_CARD";
    closingDay?: number;
    dueDay?: number;
    initialBalanceCents?: number;
  },
) {
  const name = input.name.trim();
  if (!name || name.length > 80) throw new Error("Informe um nome válido.");
  const card = input.type === "CREDIT_CARD";
  if (
    card &&
    (!input.closingDay ||
      input.closingDay < 1 ||
      input.closingDay > 31 ||
      !input.dueDay ||
      input.dueDay < 1 ||
      input.dueDay > 31)
  )
    throw new Error("Informe fechamento e vencimento válidos.");
  const initialBalanceCents = input.initialBalanceCents ?? 0;
  if (!Number.isSafeInteger(initialBalanceCents))
    throw new Error("Saldo inicial inválido.");
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Recife",
  });
  await getDb().transaction(async (tx) => {
    const [wallet] = await tx
      .insert(wallets)
      .values({
        userId,
        name,
        type: input.type,
        closingDay: card ? input.closingDay : null,
        dueDay: card ? input.dueDay : null,
      })
      .returning({ id: wallets.id });
    if (initialBalanceCents !== 0)
      await tx.insert(transactions).values({
        userId,
        walletId: wallet.id,
        description: "Saldo inicial",
        amountCents: initialBalanceCents,
        type: "ADJUSTMENT",
        consumptionDate: today,
        competence: `${today.slice(0, 7)}-01`,
      });
  });
}

export async function updateWallet(
  userId: string,
  id: string,
  input: {
    name?: string;
    active?: boolean;
    closingDay?: number;
    dueDay?: number;
  },
) {
  const patch: Record<string, unknown> = { updatedAt: now() };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 80) throw new Error("Nome inválido.");
    patch.name = name;
  }
  if (input.active !== undefined) patch.active = input.active;
  if (input.closingDay !== undefined) patch.closingDay = input.closingDay;
  if (input.dueDay !== undefined) patch.dueDay = input.dueDay;
  await getDb()
    .update(wallets)
    .set(patch)
    .where(and(eq(wallets.id, id), eq(wallets.userId, userId)));
}

export async function adjustWalletBalance(
  userId: string,
  walletId: string,
  input: { amountCents: number; description: string; date: string },
) {
  const wallet = await ownedWallet(userId, walletId);
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents === 0)
    throw new Error("Ajuste inválido.");
  const description = input.description.trim() || "Ajuste de saldo";
  await getDb()
    .insert(transactions)
    .values({
      userId,
      walletId: wallet.id,
      description,
      amountCents: input.amountCents,
      type: "ADJUSTMENT",
      consumptionDate: input.date,
      competence: `${input.date.slice(0, 7)}-01`,
    });
}

export async function createCategory(
  userId: string,
  input: { name: string; type: "INCOME" | "EXPENSE" | "BOTH" },
) {
  const name = input.name.trim();
  if (!name || name.length > 60) throw new Error("Informe um nome válido.");
  await getDb().insert(categories).values({ userId, name, type: input.type });
}

export async function updateCategory(
  userId: string,
  id: string,
  input: { name?: string; active?: boolean },
) {
  const patch: Record<string, unknown> = { updatedAt: now() };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 60) throw new Error("Nome inválido.");
    patch.name = name;
  }
  if (input.active !== undefined) patch.active = input.active;
  await getDb()
    .update(categories)
    .set(patch)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)));
}

async function ownedWallet(userId: string, id: string) {
  const [wallet] = await getDb()
    .select()
    .from(wallets)
    .where(
      and(
        eq(wallets.id, id),
        eq(wallets.userId, userId),
        eq(wallets.active, true),
      ),
    )
    .limit(1);
  if (!wallet) throw new Error("Carteira não encontrada.");
  return wallet;
}

async function ownedCategory(userId: string, id?: string) {
  if (!id) return null;
  const [category] = await getDb()
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.id, id),
        eq(categories.userId, userId),
        eq(categories.active, true),
      ),
    )
    .limit(1);
  if (!category) throw new Error("Categoria não encontrada.");
  return category.id;
}

export async function createPurchase(
  userId: string,
  input: {
    description: string;
    amountCents: number;
    type: TransactionKind;
    walletId: string;
    categoryId?: string;
    consumptionDate: string;
    competence?: string;
    mode: "CASH" | InstallmentMode;
    quantity?: number;
    externalId?: string;
  },
) {
  const description = input.description.trim();
  if (!description || description.length > 120)
    throw new Error("Descrição inválida.");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
    throw new Error("Valor inválido.");
  const wallet = await ownedWallet(userId, input.walletId);
  const categoryId = await ownedCategory(userId, input.categoryId);
  if (input.externalId) {
    const [existing] = await getDb()
      .select({
        id: transactions.id,
        purchaseId: transactions.purchaseId,
        competence: transactions.competence,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.externalId, input.externalId),
        ),
      )
      .limit(1);
    if (existing)
      return {
        purchaseId: existing.purchaseId,
        values: [],
        competences: [existing.competence],
        duplicate: true,
      };
  }
  const quantity = input.mode === "CASH" ? 1 : (input.quantity ?? 0);
  const values =
    input.mode === "CASH"
      ? [input.amountCents]
      : calculateInstallments(input.mode, input.amountCents, quantity);
  const initial =
    input.competence ??
    calculateCompetence(wallet.type, input.consumptionDate, wallet.closingDay);
  const competences = calculateInstallmentCompetences(initial, quantity);
  const purchaseId = crypto.randomUUID();
  const sign = input.type === "EXPENSE" ? -1 : 1;
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(purchases).values({
      id: purchaseId,
      userId,
      description,
      mode: input.mode,
      totalAmountCents: values.reduce((a, b) => a + b, 0),
      installmentTotal: quantity,
    });
    await tx.insert(transactions).values(
      values.map((value, index) => ({
        userId,
        walletId: wallet.id,
        purchaseId,
        externalId: index === 0 ? input.externalId : null,
        description,
        amountCents: value * sign,
        type: input.type,
        categoryId,
        consumptionDate: input.consumptionDate,
        competence: competences[index],
        installmentNumber: quantity > 1 ? index + 1 : null,
        installmentTotal: quantity > 1 ? quantity : null,
      })),
    );
  });
  return { purchaseId, values, competences, duplicate: false };
}

export async function createScheduledRule(
  userId: string,
  input: {
    description: string;
    amountCents: number;
    type: TransactionKind;
    categoryId?: string;
    walletId?: string;
    startCompetence: string;
    endCompetence?: string;
  },
) {
  const description = input.description.trim();
  if (!description || input.amountCents <= 0)
    throw new Error("Programado inválido.");
  const end = input.endCompetence || addMonths(input.startCompetence, 119);
  if (end < input.startCompetence)
    throw new Error("A competência final não pode ser anterior à inicial.");
  if (input.walletId) await ownedWallet(userId, input.walletId);
  const categoryId = await ownedCategory(userId, input.categoryId);
  const competences: string[] = [];
  for (
    let current = input.startCompetence;
    current <= end && competences.length < 120;
    current = addMonths(current, 1)
  )
    competences.push(current);
  const ruleId = crypto.randomUUID();
  const sign = input.type === "EXPENSE" ? -1 : 1;
  await getDb().transaction(async (tx) => {
    await tx.insert(scheduledRules).values({
      id: ruleId,
      userId,
      description,
      defaultAmountCents: input.amountCents * sign,
      type: input.type,
      categoryId,
      defaultWalletId: input.walletId || null,
      startCompetence: input.startCompetence,
      endCompetence: input.endCompetence || null,
    });
    await tx.insert(scheduledEntries).values(
      competences.map((competence) => ({
        userId,
        scheduledRuleId: ruleId,
        description,
        expectedAmountCents: input.amountCents * sign,
        competence,
      })),
    );
  });
}

export async function billScheduledEntry(
  userId: string,
  id: string,
  input: {
    walletId: string;
    amountCents: number;
    consumptionDate: string;
    description?: string;
    categoryId?: string;
  },
) {
  const db = getDb();
  const wallet = await ownedWallet(userId, input.walletId);
  const [entry] = await db
    .select({ entry: scheduledEntries, rule: scheduledRules })
    .from(scheduledEntries)
    .innerJoin(
      scheduledRules,
      and(
        eq(scheduledEntries.scheduledRuleId, scheduledRules.id),
        eq(scheduledRules.userId, userId),
      ),
    )
    .where(
      and(eq(scheduledEntries.id, id), eq(scheduledEntries.userId, userId)),
    )
    .limit(1);
  if (!entry || entry.entry.status !== "PENDING")
    throw new Error("Este programado não está mais pendente.");
  const transactionId = crypto.randomUUID();
  const sign = entry.rule.type === "EXPENSE" ? -1 : 1;
  await db.transaction(async (tx) => {
    await tx.insert(transactions).values({
      id: transactionId,
      userId,
      walletId: wallet.id,
      scheduledEntryId: id,
      description: input.description?.trim() || entry.entry.description,
      amountCents: input.amountCents * sign,
      type: entry.rule.type as TransactionKind,
      categoryId: input.categoryId || entry.rule.categoryId,
      consumptionDate: input.consumptionDate,
      competence: entry.entry.competence,
    });
    const updated = await tx
      .update(scheduledEntries)
      .set({
        status: "BILLED",
        billedTransactionId: transactionId,
        updatedAt: now(),
      })
      .where(
        and(
          eq(scheduledEntries.id, id),
          eq(scheduledEntries.userId, userId),
          eq(scheduledEntries.status, "PENDING"),
        ),
      )
      .returning({ id: scheduledEntries.id });
    if (!updated.length) throw new Error("Este programado já foi processado.");
  });
}

export async function skipScheduledEntry(userId: string, id: string) {
  await getDb()
    .update(scheduledEntries)
    .set({ status: "SKIPPED", updatedAt: now() })
    .where(
      and(
        eq(scheduledEntries.id, id),
        eq(scheduledEntries.userId, userId),
        eq(scheduledEntries.status, "PENDING"),
      ),
    );
}

export async function deleteScheduledRule(userId: string, id: string) {
  const db = getDb();
  const [rule] = await db
    .select({ id: scheduledRules.id })
    .from(scheduledRules)
    .where(
      and(
        eq(scheduledRules.id, id),
        eq(scheduledRules.userId, userId),
        eq(scheduledRules.active, true),
      ),
    )
    .limit(1);
  if (!rule) throw new Error("Recorrência não encontrada.");
  const changedAt = now();
  await db.transaction(async (tx) => {
    await tx
      .update(scheduledRules)
      .set({ active: false, updatedAt: changedAt })
      .where(and(eq(scheduledRules.id, id), eq(scheduledRules.userId, userId)));
    await tx
      .update(scheduledEntries)
      .set({ status: "CANCELLED", updatedAt: changedAt })
      .where(
        and(
          eq(scheduledEntries.scheduledRuleId, id),
          eq(scheduledEntries.userId, userId),
          eq(scheduledEntries.status, "PENDING"),
        ),
      );
  });
}

export async function removeTransaction(userId: string, id: string) {
  const db = getDb();
  const [transaction] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
      ),
    )
    .limit(1);
  if (!transaction) throw new Error("Lançamento não encontrado.");
  const removedAt = now();
  await db.transaction(async (tx) => {
    if (transaction.transferId) {
      await tx
        .update(transactions)
        .set({ deletedAt: removedAt, updatedAt: removedAt })
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.transferId, transaction.transferId),
            isNull(transactions.deletedAt),
          ),
        );
    } else {
      await tx
        .update(transactions)
        .set({ deletedAt: removedAt, updatedAt: removedAt })
        .where(
          and(
            eq(transactions.id, id),
            eq(transactions.userId, userId),
            isNull(transactions.deletedAt),
          ),
        );
    }
    if (transaction.scheduledEntryId) {
      await tx
        .update(scheduledEntries)
        .set({
          status: "PENDING",
          billedTransactionId: null,
          updatedAt: removedAt,
        })
        .where(
          and(
            eq(scheduledEntries.id, transaction.scheduledEntryId),
            eq(scheduledEntries.userId, userId),
            eq(scheduledEntries.billedTransactionId, id),
          ),
        );
    }
  });
}

export async function updateTransaction(
  userId: string,
  id: string,
  input: {
    description: string;
    walletId: string;
    consumptionDate: string;
    competence: string;
    type: TransactionKind;
  },
) {
  const db = getDb();
  const [transaction] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
      ),
    )
    .limit(1);
  if (!transaction) throw new Error("Lançamento não encontrado.");
  if (
    transaction.transferId ||
    transaction.type === "CARD_PAYMENT" ||
    transaction.type === "TRANSFER"
  )
    throw new Error(
      "Movimentações vinculadas não podem ser editadas isoladamente.",
    );
  const wallet = await ownedWallet(userId, input.walletId);
  const description = input.description.trim();
  if (!description || description.length > 120)
    throw new Error("Descrição inválida.");
  const amountCents =
    Math.abs(transaction.amountCents) * (input.type === "EXPENSE" ? -1 : 1);
  await db
    .update(transactions)
    .set({
      description,
      walletId: wallet.id,
      consumptionDate: input.consumptionDate,
      competence: input.competence,
      type: input.type,
      amountCents,
      updatedAt: now(),
    })
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
      ),
    );
}

export async function payCreditCard(
  userId: string,
  cardId: string,
  input: {
    sourceWalletId: string;
    amountCents: number;
    date: string;
    competence: string;
  },
) {
  const [card, source] = await Promise.all([
    ownedWallet(userId, cardId),
    ownedWallet(userId, input.sourceWalletId),
  ]);
  if (
    card.type !== "CREDIT_CARD" ||
    source.type !== "CASH_ACCOUNT" ||
    card.id === source.id ||
    input.amountCents <= 0
  )
    throw new Error("Pagamento de cartão inválido.");
  const transferId = crypto.randomUUID();
  await getDb().transaction(async (tx) =>
    tx.insert(transactions).values([
      {
        userId,
        walletId: source.id,
        transferId,
        description: `Pagamento ${card.name}`,
        amountCents: -input.amountCents,
        type: "CARD_PAYMENT",
        consumptionDate: input.date,
        competence: input.competence,
      },
      {
        userId,
        walletId: card.id,
        transferId,
        description: `Pagamento recebido de ${source.name}`,
        amountCents: input.amountCents,
        type: "CARD_PAYMENT",
        consumptionDate: input.date,
        competence: input.competence,
      },
    ]),
  );
}

export async function exportData(userId: string) {
  const db = getDb();
  const [
    walletRows,
    categoryRows,
    purchaseRows,
    transactionRows,
    ruleRows,
    entryRows,
  ] = await Promise.all([
    db.select().from(wallets).where(eq(wallets.userId, userId)),
    db.select().from(categories).where(eq(categories.userId, userId)),
    db.select().from(purchases).where(eq(purchases.userId, userId)),
    db.select().from(transactions).where(eq(transactions.userId, userId)),
    db.select().from(scheduledRules).where(eq(scheduledRules.userId, userId)),
    db
      .select()
      .from(scheduledEntries)
      .where(eq(scheduledEntries.userId, userId)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    wallets: walletRows,
    categories: categoryRows,
    purchases: purchaseRows,
    transactions: transactionRows,
    scheduledRules: ruleRows,
    scheduledEntries: entryRows,
  };
}
