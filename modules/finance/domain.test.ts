import { describe, expect, it } from "vitest";
import { calculateCompetence, calculateInstallmentCompetences, calculateInstallments, parseMoneyToCents } from "./domain";

describe("competência", () => {
  it("usa o mês do consumo em conta normal", () => expect(calculateCompetence("CASH_ACCOUNT", "2026-09-05")).toBe("2026-09-01"));
  it("vira o mês após fechamento do cartão", () => expect(calculateCompetence("CREDIT_CARD", "2026-09-05", 1)).toBe("2026-10-01"));
  it("mantém o mês até o fechamento", () => expect(calculateCompetence("CREDIT_CARD", "2026-09-05", 9)).toBe("2026-09-01"));
});

describe("parcelas", () => {
  it("mantém valor por parcela", () => expect(calculateInstallments("INSTALLMENT_VALUE", 1000, 3)).toEqual([1000, 1000, 1000]));
  it("distribui centavos sem alterar o total", () => expect(calculateInstallments("TOTAL_VALUE", 10000, 3)).toEqual([3334, 3334, 3332]));
  it("avança competências", () => expect(calculateInstallmentCompetences("2026-12-01", 3)).toEqual(["2026-12-01", "2027-01-01", "2027-02-01"]));
  it("converte moeda brasileira", () => expect(parseMoneyToCents("1.234,56")).toBe(123456));
});
