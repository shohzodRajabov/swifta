-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "maxDailyHours" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "overtimeMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.5;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "passportNumber" TEXT;

-- AlterTable
ALTER TABLE "WorkSessionMember" ADD COLUMN     "overtimeHours" DECIMAL(5,2) NOT NULL DEFAULT 0;

