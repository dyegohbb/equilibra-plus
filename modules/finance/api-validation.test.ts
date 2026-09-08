import { describe, expect, it } from "vitest";
import { postgresUuid } from "../../lib/api-validation";

describe("postgresUuid", () => {
  it("aceita IDs legados válidos para o PostgreSQL", () => {
    expect(
      postgresUuid.safeParse("7fc15d96-a0d8-426b-e475-b16f3d90c807").success,
    ).toBe(true);
  });

  it("rejeita valores que não têm o formato UUID", () => {
    expect(postgresUuid.safeParse("categoria-invalida").success).toBe(false);
  });
});
