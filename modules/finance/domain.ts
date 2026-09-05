export type WalletType = "CASH_ACCOUNT" | "CREDIT_CARD";
export type InstallmentMode = "INSTALLMENT_VALUE" | "TOTAL_VALUE";

function parseCivilDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Data inválida.");
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error("Data inválida.");
  return date;
}

export function monthKey(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

export function calculateCompetence(type: WalletType, consumptionDate: string, closingDay?: number | null) {
  const date = parseCivilDate(consumptionDate);
  let year = date.getUTCFullYear(); let month = date.getUTCMonth();
  if (type === "CREDIT_CARD") {
    if (!closingDay || closingDay < 1 || closingDay > 31) throw new Error("Dia de fechamento inválido.");
    if (date.getUTCDate() > closingDay) { month += 1; if (month === 12) { month = 0; year += 1; } }
  }
  return monthKey(year, month);
}

export function addMonths(competence: string, amount: number) {
  const date = parseCivilDate(competence);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return monthKey(date.getUTCFullYear(), date.getUTCMonth());
}

export function calculateInstallments(mode: InstallmentMode, amountCents: number, quantity: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !Number.isInteger(quantity) || quantity < 2 || quantity > 120) throw new Error("Parcelamento inválido.");
  if (mode === "INSTALLMENT_VALUE") return Array(quantity).fill(amountCents) as number[];
  const roundedUp = Math.ceil(amountCents / quantity);
  const values = Array(quantity).fill(roundedUp) as number[];
  values[quantity - 1] = amountCents - roundedUp * (quantity - 1);
  if (values[quantity - 1] <= 0) throw new Error("Valor insuficiente para a quantidade de parcelas.");
  return values;
}

export function calculateInstallmentCompetences(initial: string, quantity: number) {
  return Array.from({ length: quantity }, (_, index) => addMonths(initial, index));
}

export function parseMoneyToCents(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(/^R\$/, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("Valor inválido.");
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("Valor inválido.");
  return cents;
}
