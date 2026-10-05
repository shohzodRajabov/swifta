-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "kpiBonusEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kpiBonusScale" JSONB;

-- AlterTable
ALTER TABLE "KpiSnapshot" ADD COLUMN     "bonusPct" DECIMAL(6,2),
ADD COLUMN     "bonusUzs" DECIMAL(18,2);

