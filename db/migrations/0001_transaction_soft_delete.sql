ALTER TABLE "transactions" ADD COLUMN "deleted_at" timestamptz;
CREATE INDEX "transactions_user_deleted_idx" ON "transactions" ("user_id", "deleted_at");
