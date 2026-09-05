import { getAuth, isAuthConfigured } from "@/lib/auth/server";

type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Context) {
  if (!isAuthConfigured()) {
    return Response.json({ message: "Autenticação temporariamente indisponível." }, { status: 503 });
  }
  return getAuth().handler()[request.method === "GET" ? "GET" : "POST"](request, context);
}

export { handle as GET, handle as POST };
