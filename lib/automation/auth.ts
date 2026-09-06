import "server-only";
import { timingSafeEqual } from "node:crypto";

export function authorizeAutomation(request: Request) {
  const expectedToken = process.env.AUTOMATION_API_TOKEN;
  const userId = process.env.AUTOMATION_USER_ID;
  if (!expectedToken || expectedToken.length < 32 || !userId) return null;
  const authorization = request.headers.get("authorization");
  const suppliedToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  return { userId };
}
