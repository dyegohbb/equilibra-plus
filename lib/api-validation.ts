import { z } from "zod";

// PostgreSQL accepts any hexadecimal UUID representation, including legacy IDs
// whose version or variant bits do not conform to the stricter RFC validator.
export const postgresUuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "ID inválido.",
  );

export function zodErrorResponse(error: z.ZodError) {
  const issue = error.issues[0];
  const field = issue?.path.join(".");
  return Response.json(
    {
      error: field
        ? `Verifique o campo \"${field}\".`
        : "Verifique os dados informados.",
      fields: error.flatten().fieldErrors,
    },
    { status: 422 },
  );
}
