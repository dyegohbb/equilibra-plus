import { describe, expect, it } from "vitest";
import { calculateCompetence, calculateInstallmentCompetences, calculateInstallments, calculateProjectedBalance, parseMoneyToCents, scheduledDateForCompetence } from "./domain";

describe("competência", () => {
  it("usa o mês do consumo em conta normal", () => expect(calculateCompetence("CASH_ACCOUNT", "2026-09-05")).toBe("2026-09-01"));
  it("vira o mês após fechamento do cartão", () => expect(calculateCompetence("CREDIT_CARD", "2026-09-05", 1)).toBe("2026-10-01"));
  it("mantém o mês até o fechamento", () => expect(calculateCompetence("CREDIT_CARD", "2026-09-05", 9)).toBe("2026-09-01"));
});

describe("saldo previsto acumulado", () => {
  it("diferencia entradas e saídas do mês atual", () => expect(calculateProjectedBalance(0, 200000, 0, 100000, 0, 0)).toBe(100000));
  it("acumula entradas e saídas dos meses anteriores", () => expect(calculateProjectedBalance(1000000, 100000, 200000, 100000, 400000, 0)).toBe(800000));
  it("desconta também o total devido nos cartões", () => expect(calculateProjectedBalance(1000000, 100000, 0, 100000, 200000, 300000)).toBe(500000));
});

describe("parcelas", () => {
  it("mantém valor por parcela", () => expect(calculateInstallments("INSTALLMENT_VALUE", 1000, 3)).toEqual([1000, 1000, 1000]));
  it("distribui centavos sem alterar o total", () => expect(calculateInstallments("TOTAL_VALUE", 10000, 3)).toEqual([3334, 3334, 3332]));
  it("avança competências", () => expect(calculateInstallmentCompetences("2026-12-01", 3)).toEqual(["2026-12-01", "2027-01-01", "2027-02-01"]));
  it("converte moeda brasileira", () => expect(parseMoneyToCents("1.234,56")).toBe(123456));
});

describe("data de faturamento automático", () => {
  it("usa o dia configurado", () => expect(scheduledDateForCompetence("2026-10-01", 10)).toBe("2026-10-10"));
  it("ajusta o dia 31 para o último dia do mês", () => expect(scheduledDateForCompetence("2027-02-01", 31)).toBe("2027-02-28"));
});
