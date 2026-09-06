ALTER TABLE "transactions" ADD COLUMN "external_id" text;
CREATE UNIQUE INDEX "transactions_user_external_unique" ON "transactions" ("user_id", "external_id");
