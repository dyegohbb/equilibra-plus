import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { isAuthConfigured } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Criar conta" };
export default function SignUpPage() {
  return <AuthForm mode="sign-up" available={isAuthConfigured()} />;
}
