import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, purchases, scheduledEntries, scheduledRules, transactions, wallets } from "@/db/schema";
import { addMonths, calculateCompetence, calculateInstallmentCompetences, calculateInstallments, type InstallmentMode } from "./domain";

type TransactionKind = "INCOME" | "EXPENSE";
const now = () => new Date();

export async function getFinanceData(userId: string, competence: string) {
  const db = getDb();
  const [walletRows, categoryRows, transactionRows, scheduleRows] = await Promise.all([
    db.select().from(wallets).where(eq(wallets.userId, userId)).orderBy(desc(wallets.active), asc(wallets.name)),
    db.select().from(categories).where(eq(categories.userId, userId)).orderBy(desc(categories.active), asc(categories.name)),
    db.select({ transaction: transactions, walletName: wallets.name, categoryName: categories.name })
      .from(transactions).innerJoin(wallets, and(eq(transactions.walletId, wallets.id), eq(wallets.userId, userId)))
      .leftJoin(categories, and(eq(transactions.categoryId, categories.id), eq(categories.userId, userId)))
      .where(and(eq(transactions.userId, userId), eq(transactions.competence, competence))).orderBy(desc(transactions.consumptionDate), desc(transactions.createdAt)),
    db.select({ entry: scheduledEntries, categoryName: categories.name }).from(scheduledEntries)
      .leftJoin(scheduledRules, and(eq(scheduledEntries.scheduledRuleId, scheduledRules.id), eq(scheduledRules.userId, userId)))
      .leftJoin(categories, and(eq(scheduledRules.categoryId, categories.id), eq(categories.userId, userId)))
      .where(and(eq(scheduledEntries.userId, userId), eq(scheduledEntries.competence, competence))).orderBy(asc(scheduledEntries.description)),
  ]);
  const real = transactionRows.filter(({ transaction }) => transaction.type !== "CARD_PAYMENT" && transaction.type !== "TRANSFER");
  const incomeCents = real.reduce((sum, row) => sum + Math.max(row.transaction.amountCents, 0), 0);
  const expenseCents = real.reduce((sum, row) => sum + Math.abs(Math.min(row.transaction.amountCents, 0)), 0);
  const pendingCents = scheduleRows.filter(({ entry }) => entry.status === "PENDING").reduce((sum, { entry }) => sum + Math.abs(entry.expectedAmountCents), 0);
  const cards = walletRows.filter((wallet) => wallet.type === "CREDIT_CARD").map((wallet) => ({ ...wallet, invoiceCents: Math.abs(transactionRows.filter(({ transaction }) => transaction.walletId === wallet.id && transaction.purchaseId).reduce((sum, { transaction }) => sum + transaction.amountCents, 0)) }));
  return { wallets: walletRows, categories: categoryRows, transactions: transactionRows, scheduled: scheduleRows, summary: { incomeCents, expenseCents, balanceCents: incomeCents - expenseCents, pendingCents }, cards };
}

export async function createWallet(userId: string, input: { name: string; type: "CASH_ACCOUNT" | "CREDIT_CARD"; closingDay?: number; dueDay?: number }) {
  const name = input.name.trim(); if (!name || name.length > 80) throw new Error("Informe um nome válido.");
  const card = input.type === "CREDIT_CARD";
  if (card && (!input.closingDay || input.closingDay < 1 || input.closingDay > 31 || !input.dueDay || input.dueDay < 1 || input.dueDay > 31)) throw new Error("Informe fechamento e vencimento válidos.");
  await getDb().insert(wallets).values({ userId, name, type: input.type, closingDay: card ? input.closingDay : null, dueDay: card ? input.dueDay : null });
}

export async function updateWallet(userId: string, id: string, input: { name?: string; active?: boolean; closingDay?: number; dueDay?: number }) {
  const patch: Record<string, unknown> = { updatedAt: now() };
  if (input.name !== undefined) { const name = input.name.trim(); if (!name || name.length > 80) throw new Error("Nome inválido."); patch.name = name; }
  if (input.active !== undefined) patch.active = input.active;
  if (input.closingDay !== undefined) patch.closingDay = input.closingDay;
  if (input.dueDay !== undefined) patch.dueDay = input.dueDay;
  await getDb().update(wallets).set(patch).where(and(eq(wallets.id, id), eq(wallets.userId, userId)));
}

export async function createCategory(userId: string, input: { name: string; type: "INCOME" | "EXPENSE" | "BOTH" }) {
  const name = input.name.trim(); if (!name || name.length > 60) throw new Error("Informe um nome válido.");
  await getDb().insert(categories).values({ userId, name, type: input.type });
}

export async function updateCategory(userId: string, id: string, input: { name?: string; active?: boolean }) {
  const patch: Record<string, unknown> = { updatedAt: now() };
  if (input.name !== undefined) { const name = input.name.trim(); if (!name || name.length > 60) throw new Error("Nome inválido."); patch.name = name; }
  if (input.active !== undefined) patch.active = input.active;
  await getDb().update(categories).set(patch).where(and(eq(categories.id, id), eq(categories.userId, userId)));
}

async function ownedWallet(userId: string, id: string) {
  const [wallet] = await getDb().select().from(wallets).where(and(eq(wallets.id, id), eq(wallets.userId, userId), eq(wallets.active, true))).limit(1);
  if (!wallet) throw new Error("Carteira não encontrada."); return wallet;
}

export async function createPurchase(userId: string, input: { description: string; amountCents: number; type: TransactionKind; walletId: string; categoryId?: string; consumptionDate: string; competence?: string; mode: "CASH" | InstallmentMode; quantity?: number }) {
  const description = input.description.trim(); if (!description || description.length > 120) throw new Error("Descrição inválida.");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Valor inválido.");
  const wallet = await ownedWallet(userId, input.walletId);
  const quantity = input.mode === "CASH" ? 1 : input.quantity ?? 0;
  const values = input.mode === "CASH" ? [input.amountCents] : calculateInstallments(input.mode, input.amountCents, quantity);
  const initial = input.competence ?? calculateCompetence(wallet.type, input.consumptionDate, wallet.closingDay);
  const competences = calculateInstallmentCompetences(initial, quantity);
  const purchaseId = crypto.randomUUID();
  const sign = input.type === "EXPENSE" ? -1 : 1;
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(purchases).values({ id: purchaseId, userId, description, mode: input.mode, totalAmountCents: values.reduce((a, b) => a + b, 0), installmentTotal: quantity });
    await tx.insert(transactions).values(values.map((value, index) => ({ userId, walletId: wallet.id, purchaseId, description, amountCents: value * sign, type: input.type, categoryId: input.categoryId || null, consumptionDate: input.consumptionDate, competence: competences[index], installmentNumber: quantity > 1 ? index + 1 : null, installmentTotal: quantity > 1 ? quantity : null })));
  });
  return { values, competences };
}

export async function createScheduledRule(userId: string, input: { description: string; amountCents: number; type: TransactionKind; categoryId?: string; startCompetence: string; endCompetence?: string }) {
  const description = input.description.trim(); if (!description || input.amountCents <= 0) throw new Error("Programado inválido.");
  const end = input.endCompetence || addMonths(input.startCompetence, 11);
  const competences: string[] = []; for (let current = input.startCompetence; current <= end && competences.length < 120; current = addMonths(current, 1)) competences.push(current);
  const ruleId = crypto.randomUUID(); const sign = input.type === "EXPENSE" ? -1 : 1;
  await getDb().transaction(async (tx) => {
    await tx.insert(scheduledRules).values({ id: ruleId, userId, description, defaultAmountCents: input.amountCents * sign, type: input.type, categoryId: input.categoryId || null, startCompetence: input.startCompetence, endCompetence: end });
    await tx.insert(scheduledEntries).values(competences.map((competence) => ({ userId, scheduledRuleId: ruleId, description, expectedAmountCents: input.amountCents * sign, competence })));
  });
}

export async function billScheduledEntry(userId: string, id: string, input: { walletId: string; amountCents: number; consumptionDate: string; description?: string; categoryId?: string }) {
  const db = getDb(); const wallet = await ownedWallet(userId, input.walletId);
  const [entry] = await db.select({ entry: scheduledEntries, rule: scheduledRules }).from(scheduledEntries).innerJoin(scheduledRules, and(eq(scheduledEntries.scheduledRuleId, scheduledRules.id), eq(scheduledRules.userId, userId))).where(and(eq(scheduledEntries.id, id), eq(scheduledEntries.userId, userId))).limit(1);
  if (!entry || entry.entry.status !== "PENDING") throw new Error("Este programado não está mais pendente.");
  const transactionId = crypto.randomUUID(); const sign = entry.rule.type === "EXPENSE" ? -1 : 1;
  await db.transaction(async (tx) => {
    await tx.insert(transactions).values({ id: transactionId, userId, walletId: wallet.id, scheduledEntryId: id, description: input.description?.trim() || entry.entry.description, amountCents: input.amountCents * sign, type: entry.rule.type as TransactionKind, categoryId: input.categoryId || entry.rule.categoryId, consumptionDate: input.consumptionDate, competence: entry.entry.competence });
    const updated = await tx.update(scheduledEntries).set({ status: "BILLED", billedTransactionId: transactionId, updatedAt: now() }).where(and(eq(scheduledEntries.id, id), eq(scheduledEntries.userId, userId), eq(scheduledEntries.status, "PENDING"))).returning({ id: scheduledEntries.id });
    if (!updated.length) throw new Error("Este programado já foi processado.");
  });
}

export async function skipScheduledEntry(userId: string, id: string) {
  await getDb().update(scheduledEntries).set({ status: "SKIPPED", updatedAt: now() }).where(and(eq(scheduledEntries.id, id), eq(scheduledEntries.userId, userId), eq(scheduledEntries.status, "PENDING")));
}

export async function payCreditCard(userId: string, cardId: string, input: { sourceWalletId: string; amountCents: number; date: string; competence: string }) {
  const [card, source] = await Promise.all([ownedWallet(userId, cardId), ownedWallet(userId, input.sourceWalletId)]);
  if (card.type !== "CREDIT_CARD" || source.type !== "CASH_ACCOUNT" || card.id === source.id || input.amountCents <= 0) throw new Error("Pagamento de cartão inválido.");
  const transferId = crypto.randomUUID();
  await getDb().transaction(async (tx) => tx.insert(transactions).values([
    { userId, walletId: source.id, transferId, description: `Pagamento ${card.name}`, amountCents: -input.amountCents, type: "CARD_PAYMENT", consumptionDate: input.date, competence: input.competence },
    { userId, walletId: card.id, transferId, description: `Pagamento recebido de ${source.name}`, amountCents: input.amountCents, type: "CARD_PAYMENT", consumptionDate: input.date, competence: input.competence },
  ]));
}

export async function exportData(userId: string) {
  const db = getDb();
  const [walletRows, categoryRows, purchaseRows, transactionRows, ruleRows, entryRows] = await Promise.all([db.select().from(wallets).where(eq(wallets.userId, userId)), db.select().from(categories).where(eq(categories.userId, userId)), db.select().from(purchases).where(eq(purchases.userId, userId)), db.select().from(transactions).where(eq(transactions.userId, userId)), db.select().from(scheduledRules).where(eq(scheduledRules.userId, userId)), db.select().from(scheduledEntries).where(eq(scheduledEntries.userId, userId))]);
  return { exportedAt: new Date().toISOString(), wallets: walletRows, categories: categoryRows, purchases: purchaseRows, transactions: transactionRows, scheduledRules: ruleRows, scheduledEntries: entryRows };
}
