import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { isAuthConfigured } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Entrar" };
export default function SignInPage() {
  return <AuthForm mode="sign-in" available={isAuthConfigured()} />;
}
