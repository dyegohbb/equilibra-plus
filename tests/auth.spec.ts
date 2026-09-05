import { expect, test } from "@playwright/test";
import { randomBytes } from "node:crypto";

test("rota privada exige sessão validada no servidor", async ({ request }) => {
  const response = await request.get("/app", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain("/sign-in");
  expect(await response.text()).not.toContain("Hello World");
});

test("cookie forjado não concede acesso", async ({ request }) => {
  const response = await request.get("/app", {
    maxRedirects: 0,
    headers: { Cookie: "__Secure-neon-auth.session_token=forged; neon-auth.session_data=forged" },
  });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain("/sign-in");
});

for (const width of [375, 768, 1440]) {
  test(`login e cadastro sem overflow em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Bem-vindo de volta" })).toBeVisible();
    await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Criar conta" }).click();
    await expect(page.getByLabel("Confirmar senha")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("validação de senhas não envia cadastro", async ({ page }) => {
  await page.goto("/sign-up");
  test.skip(!await page.getByLabel("E-mail", { exact: true }).isEnabled(), "Neon DEV ainda não configurado");
  let submissions = 0;
  page.on("request", request => { if (request.url().includes("/sign-up/email")) submissions++; });
  await page.getByLabel("E-mail", { exact: true }).fill("validation@example.com");
  await page.getByLabel("Senha", { exact: true }).fill(randomBytes(16).toString("hex"));
  await page.getByLabel("Confirmar senha").fill(randomBytes(16).toString("hex"));
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("As senhas não coincidem");
  expect(submissions).toBe(0);
});

test("Neon rejeita credenciais inválidas com mensagem amigável", async ({ page }) => {
  await page.goto("/sign-in");
  test.skip(!await page.getByLabel("E-mail", { exact: true }).isEnabled(), "Neon DEV ainda não configurado");
  await page.getByLabel("E-mail", { exact: true }).fill(`invalid-${randomBytes(8).toString("hex")}@example.com`);
  await page.getByLabel("Senha", { exact: true }).fill(randomBytes(24).toString("base64url"));
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Não foi possível entrar com essas credenciais");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("cadastro, duplicidade, login, refresh, nova aba e logout reais no DEV", async ({ page, browser, baseURL }) => {
  test.skip(process.env.E2E_ALLOW_DEV_SIGNUP !== "1", "Cadastro de teste exige E2E_ALLOW_DEV_SIGNUP=1 e ambiente DEV");
  expect(new URL(baseURL!).hostname).toBe("localhost");
  const email = `equilibra-e2e-${randomBytes(8).toString("hex")}@example.com`;
  const password = randomBytes(24).toString("base64url");
  await page.goto("/sign-up");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByLabel("Confirmar senha").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("heading", { name: "Hello World" })).toBeVisible();
  await page.reload();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/app$/);

  // Apenas cookies persistentes; não grava tokens nem senhas em disco.
  const cookies = (await page.context().cookies()).filter(cookie => cookie.expires > Date.now() / 1000);
  expect(cookies.some(cookie => cookie.name.includes("session_token") && cookie.httpOnly)).toBe(true);
  const reopened = await browser.newContext({ baseURL });
  await reopened.addCookies(cookies);
  const newPage = await reopened.newPage();
  await newPage.goto("/app");
  await expect(newPage.getByRole("heading", { name: "Hello World" })).toBeVisible();
  await newPage.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(newPage).toHaveURL(/\/sign-in$/);
  await newPage.goto("/app");
  await expect(newPage).toHaveURL(/\/sign-in/);
  await page.reload();
  await expect(page).toHaveURL(/\/sign-in/);
  await reopened.close();

  await page.goto("/sign-up");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByLabel("Confirmar senha").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Não foi possível criar sua conta");
  await page.getByRole("link", { name: "Entrar", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hello World" })).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

