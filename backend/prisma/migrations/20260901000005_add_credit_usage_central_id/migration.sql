ALTER TABLE "CreditUsage" ADD COLUMN "central_id" INTEGER;
CREATE UNIQUE INDEX "CreditUsage_central_id_key" ON "CreditUsage"("central_id");
