-- AlterTable
ALTER TABLE "barbers" ADD COLUMN     "telegram_link_code_hash" TEXT,
ADD COLUMN     "telegram_link_expires_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE UNIQUE INDEX "barbers_telegram_link_code_hash_key" ON "barbers"("telegram_link_code_hash");
