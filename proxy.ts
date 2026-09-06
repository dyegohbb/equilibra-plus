import { NextRequest, NextResponse } from "next/server";
import { getAuth, isAuthConfigured } from "@/lib/auth/server";

export default function proxy(request: NextRequest) {
  if (!isAuthConfigured()) return NextResponse.redirect(new URL("/sign-in", request.url));
  return getAuth().middleware({ loginUrl: "/sign-in" })(request);
}

export const config = { matcher: ["/app/:path*", "/lancamento"] };
