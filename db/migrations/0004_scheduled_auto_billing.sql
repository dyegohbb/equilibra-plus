ALTER TABLE "scheduled_rules" ADD COLUMN "auto_bill_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "scheduled_rules" ADD COLUMN "auto_bill_day" integer;
ALTER TABLE "scheduled_rules" ADD CONSTRAINT "scheduled_rule_auto_bill_day" CHECK (("auto_bill_day" IS NULL OR "auto_bill_day" BETWEEN 1 AND 31) AND ("auto_bill_enabled" = false OR ("auto_bill_day" IS NOT NULL AND "default_wallet_id" IS NOT NULL)));
CREATE INDEX "scheduled_rules_auto_bill_idx" ON "scheduled_rules" ("auto_bill_enabled", "active", "paused");
CREATE INDEX "scheduled_entries_auto_bill_idx" ON "scheduled_entries" ("status", "competence");
