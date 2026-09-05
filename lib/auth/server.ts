import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";

export function isAuthConfigured() {
  return Boolean(process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET);
}

let auth: ReturnType<typeof createNeonAuth> | undefined;

export function getAuth() {
  if (auth) return auth;
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret || secret.length < 32) {
    throw new Error("Configure NEON_AUTH_BASE_URL e NEON_AUTH_COOKIE_SECRET (32+ caracteres) no servidor.");
  }
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("NEON_AUTH_BASE_URL deve ser o endpoint HTTPS do Neon Auth.");
  }
  auth = createNeonAuth({ baseUrl, cookies: { secret } });
  return auth;
}

export async function getSession() {
  if (!isAuthConfigured()) return null;
  // Consulte o Neon mesmo quando houver cache assinado: revogação deve ser respeitada.
  const { data, error } = await getAuth().getSession({ query: { disableCookieCache: "true" } });
  if (error) throw new Error("Não foi possível verificar a sessão.");
  return data;
}
