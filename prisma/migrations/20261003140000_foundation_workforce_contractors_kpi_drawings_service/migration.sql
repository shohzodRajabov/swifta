-- CreateEnum
CREATE TYPE "StatusGroupCode" AS ENUM ('NEW', 'OFFER', 'CONTRACT', 'WORK', 'TESTING', 'LAUNCHED', 'DONE', 'SERVICE');

-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('GENERAL', 'TURNOVER');

-- CreateEnum
CREATE TYPE "SalaryInputMode" AS ENUM ('NET', 'GROSS');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('CONTRACT', 'SIGNED_CONTRACT', 'ADDITIONAL_AGREEMENT', 'COMMERCIAL_OFFER', 'TECH_SPEC', 'PROJECT_FILES', 'DRAWING', 'SPECIFICATION', 'SMETA', 'INVOICE', 'PURCHASE_ORDER', 'WAYBILL', 'ACT', 'COMPLETION_ACT', 'HIDDEN_WORKS_ACT', 'TEST_ACT', 'PAYMENT_PROOF', 'FINAL_DOCS', 'WARRANTY', 'PASSPORT', 'CERTIFICATE', 'PHOTO', 'CORRESPONDENCE', 'SERVICE_REPORT', 'CONTRACTOR_DOC', 'OTHER');

-- CreateEnum
CREATE TYPE "ActStatus" AS ENUM ('DRAFT', 'SIGNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OverheadCategory" AS ENUM ('OFFICE_RENT', 'OFFICE_SALARY', 'PAYROLL_UNALLOCATED', 'VEHICLE', 'FUEL', 'UTILITIES', 'COMMUNICATION', 'MARKETING', 'BANK_FEES', 'TAXES_FEES', 'TOOLS', 'WORKSHOP', 'OTHER');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('LEADER', 'SENIOR', 'WORKER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NEW', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'INSPECTION', 'APPROVED', 'REJECTED', 'REWORK', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssigneeKind" AS ENUM ('EMPLOYEE', 'GROUP', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "TaskEventType" AS ENUM ('CREATED', 'STATUS', 'START', 'PAUSE', 'PROGRESS', 'FINISH', 'COMMENT', 'PROBLEM', 'PHOTO');

-- CreateEnum
CREATE TYPE "ContributionMethod" AS ENUM ('EQUAL', 'LEADER', 'RULE', 'EFFICIENCY');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Confirmation" AS ENUM ('PENDING', 'CONFIRMED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('PASSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RemarkStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'FIXED', 'REINSPECTION', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "AttendanceType" AS ENUM ('OBJECT', 'WORKSHOP', 'TRAVEL', 'OFFICE', 'IDLE_MATERIAL', 'IDLE_CLIENT', 'IDLE_OTHER', 'ABSENT', 'LEAVE', 'SICK');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('FLOOR', 'ZONE', 'ROOM', 'OTHER');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ContractorKind" AS ENUM ('INDIVIDUAL', 'BRIGADE', 'COMPANY');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('AVAILABLE', 'BUSY', 'UNAVAILABLE', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "OutsourceStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KpiSubject" AS ENUM ('EMPLOYEE', 'GROUP', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "KpiRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KpiPeriodStatus" AS ENUM ('CALCULATED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ZoneKind" AS ENUM ('POINT', 'LINE', 'RECT', 'POLYGON');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ServiceTicketStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'ON_CALL');

-- CreateEnum
CREATE TYPE "ServiceContractStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CostCategory" ADD VALUE 'OUTSOURCING';
ALTER TYPE "CostCategory" ADD VALUE 'WAREHOUSE';
ALTER TYPE "CostCategory" ADD VALUE 'TAX';

-- AlterTable
ALTER TABLE "BomItem" ADD COLUMN     "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "BudgetLine" ADD COLUMN     "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "approvalThresholdUzs" DECIMAL(18,2) NOT NULL DEFAULT 10000000,
ADD COLUMN     "contractorPhoneRequired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "contractorRatingConfig" JSONB,
ADD COLUMN     "contractorReliabilityConfig" JSONB,
ADD COLUMN     "contributionWeights" JSONB,
ADD COLUMN     "defaultContribution" "ContributionMethod" NOT NULL DEFAULT 'EQUAL',
ADD COLUMN     "efficiencyMinSessions" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "incomeTaxRate" DECIMAL(5,2) NOT NULL DEFAULT 12,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "normHoursPerDay" DECIMAL(4,2) NOT NULL DEFAULT 8,
ADD COLUMN     "normWorkDays" INTEGER NOT NULL DEFAULT 22,
ADD COLUMN     "salaryInputMode" "SalaryInputMode" NOT NULL DEFAULT 'NET',
ADD COLUMN     "socialTaxRate" DECIMAL(5,2) NOT NULL DEFAULT 12,
ADD COLUMN     "telegramBotToken" TEXT,
ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramDigestHour" INTEGER NOT NULL DEFAULT 19,
ADD COLUMN     "telegramLastDigestAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "approval" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "chiefEngineerId" TEXT,
ADD COLUMN     "contractVatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "foremanId" TEXT,
ADD COLUMN     "legalEntityId" TEXT,
ADD COLUMN     "objectType" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "siteContactEmail" TEXT,
ADD COLUMN     "siteContactName" TEXT,
ADD COLUMN     "siteContactPhone" TEXT,
ADD COLUMN     "statusId" TEXT,
ADD COLUMN     "warrantyEnd" DATE,
ADD COLUMN     "warrantyMonths" INTEGER,
ADD COLUMN     "warrantyStart" DATE;

-- AlterTable
ALTER TABLE "ProjectStageEvent" ADD COLUMN     "statusId" TEXT,
ALTER COLUMN "stage" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "serviceTicketId" TEXT,
ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "taskId" TEXT,
ADD COLUMN     "unitCostNetUsd" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "unitCostNetUzs" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN     "approval" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "rejectReason" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "roleId" TEXT,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "role" DROP NOT NULL;

-- CreateTable
CREATE TABLE "RoleDef" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalEntity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tin" TEXT,
    "address" TEXT,
    "bankDetails" TEXT,
    "director" TEXT,
    "phone" TEXT,
    "taxRegime" "TaxRegime" NOT NULL DEFAULT 'GENERAL',
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 12,
    "turnoverTaxRate" DECIMAL(5,2) NOT NULL DEFAULT 4,
    "profitTaxRate" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusGroup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" "StatusGroupCode" NOT NULL,
    "letter" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StatusGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusDef" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "requiredDocs" "DocumentCategory"[],

    CONSTRAINT "StatusDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileObject" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "contractorId" TEXT,
    "category" "DocumentCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileId" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAmendment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UZS',
    "fxRate" DECIMAL(14,4) NOT NULL,
    "fxDate" DATE NOT NULL,
    "fxSource" TEXT NOT NULL DEFAULT 'CBU',
    "amountUzs" DECIMAL(18,2) NOT NULL,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Act" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "periodFrom" DATE,
    "periodTo" DATE,
    "status" "ActStatus" NOT NULL DEFAULT 'DRAFT',
    "signedAt" TIMESTAMP(3),
    "note" TEXT,
    "documentId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UZS',
    "fxRate" DECIMAL(14,4) NOT NULL,
    "fxDate" DATE NOT NULL,
    "fxSource" TEXT NOT NULL DEFAULT 'CBU',
    "amountUzs" DECIMAL(18,2) NOT NULL,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Act_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActLine" (
    "id" TEXT NOT NULL,
    "actId" TEXT NOT NULL,
    "taskId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "amountUzs" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ActLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverheadExpense" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "legalEntityId" TEXT,
    "category" "OverheadCategory" NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "supplier" TEXT,
    "reference" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "payrollMonthId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UZS',
    "fxRate" DECIMAL(14,4) NOT NULL,
    "fxDate" DATE NOT NULL,
    "fxSource" TEXT NOT NULL DEFAULT 'CBU',
    "amountUzs" DECIMAL(18,2) NOT NULL,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "approval" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OverheadExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'RUNNING',
    "storageKey" TEXT,
    "sizeBytes" INTEGER,
    "error" TEXT,
    "createdById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "position" TEXT,
    "department" TEXT,
    "salary" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "normDays" INTEGER,
    "hireDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkGroup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialization" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'WORKER',
    "fromDate" DATE NOT NULL,
    "toDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectLocation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" "LocationKind" NOT NULL DEFAULT 'ZONE',
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "workTypeId" TEXT,
    "locationId" TEXT,
    "unit" TEXT,
    "plannedQty" DECIMAL(14,3),
    "plannedValueUzs" DECIMAL(18,2),
    "weight" DECIMAL(8,3),
    "status" "TaskStatus" NOT NULL DEFAULT 'NEW',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "startDate" DATE,
    "deadline" DATE,
    "actualStart" TIMESTAMP(3),
    "actualFinish" TIMESTAMP(3),
    "reportedPercent" INTEGER,
    "responsibleId" TEXT,
    "inspectorId" TEXT,
    "approverId" TEXT,
    "recorderUserIds" TEXT[],
    "createdById" TEXT,
    "bomItemId" TEXT,
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "AssigneeKind" NOT NULL,
    "employeeId" TEXT,
    "groupId" TEXT,
    "contractorId" TEXT,
    "plannedQty" DECIMAL(14,3),
    "note" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "plannedCostUzs" DECIMAL(18,2),
    "agreedAmount" DECIMAL(18,2),
    "currency" "Currency" NOT NULL DEFAULT 'UZS',
    "fxRate" DECIMAL(14,4),
    "fxDate" DATE,
    "fxSource" TEXT,
    "agreedUzs" DECIMAL(18,2),
    "agreedUsd" DECIMAL(18,2),
    "actualUzs" DECIMAL(18,2),
    "actualUsd" DECIMAL(18,2),
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "outsourceStatus" "OutsourceStatus",
    "startDate" DATE,
    "deadline" DATE,
    "completedQty" DECIMAL(14,3),
    "completedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "qualityScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" "TaskEventType" NOT NULL,
    "userId" TEXT,
    "employeeId" TEXT,
    "percent" INTEGER,
    "note" TEXT,
    "fromStatus" "TaskStatus",
    "toStatus" "TaskStatus",
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "groupId" TEXT,
    "assignmentId" TEXT,
    "leaderId" TEXT,
    "date" DATE NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "hours" DECIMAL(5,2) NOT NULL DEFAULT 8,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "note" TEXT,
    "problems" TEXT,
    "method" "ContributionMethod" NOT NULL DEFAULT 'EQUAL',
    "status" "SessionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "recordedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "laborCostUzs" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "laborCostUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSessionMember" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'WORKER',
    "hours" DECIMAL(5,2) NOT NULL,
    "sharePercent" DECIMAL(7,4) NOT NULL,
    "contributionQty" DECIMAL(14,3) NOT NULL,
    "hourlyCostUzs" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "laborCostUzs" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "confirmation" "Confirmation" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "WorkSessionMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "inspectorId" TEXT,
    "result" "InspectionResult" NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remark" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "taskId" TEXT,
    "locationId" TEXT,
    "inspectionId" TEXT,
    "drawingVersionId" TEXT,
    "drawingPage" INTEGER,
    "posX" DOUBLE PRECISION,
    "posY" DOUBLE PRECISION,
    "description" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "RemarkStatus" NOT NULL DEFAULT 'NEW',
    "responsibleUserId" TEXT,
    "deadline" DATE,
    "createdById" TEXT,
    "fixedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Remark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceDay" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "AttendanceType" NOT NULL,
    "projectId" TEXT,
    "hours" DECIMAL(5,2),
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollMonth" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "monthId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "salary" DECIMAL(18,2) NOT NULL,
    "normDays" INTEGER NOT NULL,
    "workedDays" INTEGER NOT NULL,
    "dailyRateUzs" DECIMAL(18,2) NOT NULL,
    "earnedUzs" DECIMAL(18,2) NOT NULL,
    "employerCostUzs" DECIMAL(18,2) NOT NULL,
    "allocatedUzs" DECIMAL(18,2) NOT NULL,
    "unallocatedUzs" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmetaImport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'DRAFT',
    "rows" JSONB NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UZS',
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmetaImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" "ContractorKind" NOT NULL DEFAULT 'INDIVIDUAL',
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "phone2" TEXT,
    "email" TEXT,
    "address" TEXT,
    "specializations" TEXT[],
    "regions" TEXT[],
    "tin" TEXT,
    "bankDetails" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "availability" "Availability" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorContact" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT,

    CONSTRAINT "ContractorContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorPayment" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "projectId" TEXT,
    "date" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "note" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UZS',
    "fxRate" DECIMAL(14,4) NOT NULL,
    "fxDate" DATE NOT NULL,
    "fxSource" TEXT NOT NULL DEFAULT 'CBU',
    "amountUzs" DECIMAL(18,2) NOT NULL,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "approval" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractorPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorScore" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" DECIMAL(4,2) NOT NULL,
    "reliability" DECIMAL(5,2) NOT NULL,
    "components" JSONB NOT NULL,

    CONSTRAINT "ContractorScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subject" "KpiSubject" NOT NULL DEFAULT 'EMPLOYEE',
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "components" JSONB NOT NULL,
    "status" "KpiRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "subject" "KpiSubject" NOT NULL,
    "ruleId" TEXT NOT NULL,
    "status" "KpiPeriodStatus" NOT NULL DEFAULT 'CALCULATED',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "KpiPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiSnapshot" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "employeeId" TEXT,
    "groupId" TEXT,
    "contractorId" TEXT,
    "score" DECIMAL(6,2) NOT NULL,
    "components" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drawing" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discipline" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Drawing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingVersion" (
    "id" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileId" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingZone" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ZoneKind" NOT NULL,
    "geometry" JSONB NOT NULL,
    "locationId" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingZoneTask" (
    "zoneId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,

    CONSTRAINT "DrawingZoneTask_pkey" PRIMARY KEY ("zoneId","taskId")
);

-- CreateTable
CREATE TABLE "ServiceContract" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "number" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "frequency" "ServiceFrequency" NOT NULL DEFAULT 'MONTHLY',
    "slaResponseHours" INTEGER,
    "slaResolveHours" INTEGER,
    "slaText" TEXT,
    "status" "ServiceContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'UZS',
    "fxRate" DECIMAL(14,4) NOT NULL,
    "fxDate" DATE NOT NULL,
    "fxSource" TEXT NOT NULL DEFAULT 'CBU',
    "amountUzs" DECIMAL(18,2) NOT NULL,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTicket" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "clientId" TEXT,
    "projectId" TEXT,
    "serviceContractId" TEXT,
    "siteAddress" TEXT,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "diagnosis" TEXT,
    "solution" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ServiceTicketStatus" NOT NULL DEFAULT 'NEW',
    "isWarranty" BOOLEAN NOT NULL DEFAULT false,
    "responsibleUserId" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "laborHours" DECIMAL(6,2),
    "laborCostUzs" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherCostUzs" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "chargeUzs" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoleDef_companyId_name_key" ON "RoleDef"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RoleDef_companyId_key_key" ON "RoleDef"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "LegalEntity_companyId_name_key" ON "LegalEntity"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StatusGroup_companyId_code_key" ON "StatusGroup"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "StatusDef_groupId_code_key" ON "StatusDef"("groupId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_storageKey_key" ON "FileObject"("storageKey");

-- CreateIndex
CREATE INDEX "Document_companyId_projectId_category_idx" ON "Document"("companyId", "projectId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ContractAmendment_projectId_idx" ON "ContractAmendment"("projectId");

-- CreateIndex
CREATE INDEX "Act_projectId_date_idx" ON "Act"("projectId", "date");

-- CreateIndex
CREATE INDEX "OverheadExpense_companyId_date_idx" ON "OverheadExpense"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_companyId_fullName_idx" ON "Employee"("companyId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "WorkGroup_companyId_name_key" ON "WorkGroup"("companyId", "name");

-- CreateIndex
CREATE INDEX "GroupMember_groupId_fromDate_idx" ON "GroupMember"("groupId", "fromDate");

-- CreateIndex
CREATE INDEX "GroupMember_employeeId_idx" ON "GroupMember"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkType_companyId_name_key" ON "WorkType"("companyId", "name");

-- CreateIndex
CREATE INDEX "ProjectLocation_projectId_idx" ON "ProjectLocation"("projectId");

-- CreateIndex
CREATE INDEX "Task_projectId_status_idx" ON "Task"("projectId", "status");

-- CreateIndex
CREATE INDEX "Task_deadline_idx" ON "Task"("deadline");

-- CreateIndex
CREATE UNIQUE INDEX "Task_companyId_number_key" ON "Task"("companyId", "number");

-- CreateIndex
CREATE INDEX "TaskAssignment_taskId_idx" ON "TaskAssignment"("taskId");

-- CreateIndex
CREATE INDEX "TaskAssignment_contractorId_idx" ON "TaskAssignment"("contractorId");

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_at_idx" ON "TaskEvent"("taskId", "at");

-- CreateIndex
CREATE INDEX "TaskEvent_employeeId_at_idx" ON "TaskEvent"("employeeId", "at");

-- CreateIndex
CREATE INDEX "WorkSession_companyId_date_idx" ON "WorkSession"("companyId", "date");

-- CreateIndex
CREATE INDEX "WorkSession_taskId_date_idx" ON "WorkSession"("taskId", "date");

-- CreateIndex
CREATE INDEX "WorkSession_projectId_date_idx" ON "WorkSession"("projectId", "date");

-- CreateIndex
CREATE INDEX "WorkSessionMember_employeeId_idx" ON "WorkSessionMember"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSessionMember_sessionId_employeeId_key" ON "WorkSessionMember"("sessionId", "employeeId");

-- CreateIndex
CREATE INDEX "Inspection_taskId_idx" ON "Inspection"("taskId");

-- CreateIndex
CREATE INDEX "Remark_projectId_status_idx" ON "Remark"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Remark_companyId_number_key" ON "Remark"("companyId", "number");

-- CreateIndex
CREATE INDEX "AttendanceDay_companyId_date_idx" ON "AttendanceDay"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDay_employeeId_date_key" ON "AttendanceDay"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollMonth_companyId_month_key" ON "PayrollMonth"("companyId", "month");

-- CreateIndex
CREATE INDEX "Contractor_companyId_name_idx" ON "Contractor"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_companyId_number_key" ON "Contractor"("companyId", "number");

-- CreateIndex
CREATE INDEX "ContractorPayment_contractorId_date_idx" ON "ContractorPayment"("contractorId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "KpiRule_companyId_subject_version_key" ON "KpiRule"("companyId", "subject", "version");

-- CreateIndex
CREATE UNIQUE INDEX "KpiPeriod_companyId_month_subject_key" ON "KpiPeriod"("companyId", "month", "subject");

-- CreateIndex
CREATE INDEX "KpiSnapshot_periodId_idx" ON "KpiSnapshot"("periodId");

-- CreateIndex
CREATE INDEX "Drawing_projectId_idx" ON "Drawing"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawingVersion_drawingId_version_key" ON "DrawingVersion"("drawingId", "version");

-- CreateIndex
CREATE INDEX "DrawingZone_versionId_page_idx" ON "DrawingZone"("versionId", "page");

-- CreateIndex
CREATE INDEX "ServiceContract_companyId_endDate_idx" ON "ServiceContract"("companyId", "endDate");

-- CreateIndex
CREATE INDEX "ServiceTicket_companyId_status_idx" ON "ServiceTicket"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTicket_companyId_number_key" ON "ServiceTicket"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_phone_key" ON "User"("companyId", "phone");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "RoleDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleDef" ADD CONSTRAINT "RoleDef_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalEntity" ADD CONSTRAINT "LegalEntity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_chiefEngineerId_fkey" FOREIGN KEY ("chiefEngineerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_foremanId_fkey" FOREIGN KEY ("foremanId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "StatusDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStageEvent" ADD CONSTRAINT "ProjectStageEvent_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "StatusDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_serviceTicketId_fkey" FOREIGN KEY ("serviceTicketId") REFERENCES "ServiceTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusGroup" ADD CONSTRAINT "StatusGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusDef" ADD CONSTRAINT "StatusDef_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StatusGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAmendment" ADD CONSTRAINT "ContractAmendment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Act" ADD CONSTRAINT "Act_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Act" ADD CONSTRAINT "Act_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActLine" ADD CONSTRAINT "ActLine_actId_fkey" FOREIGN KEY ("actId") REFERENCES "Act"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverheadExpense" ADD CONSTRAINT "OverheadExpense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverheadExpense" ADD CONSTRAINT "OverheadExpense_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkGroup" ADD CONSTRAINT "WorkGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkType" ADD CONSTRAINT "WorkType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLocation" ADD CONSTRAINT "ProjectLocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLocation" ADD CONSTRAINT "ProjectLocation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProjectLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workTypeId_fkey" FOREIGN KEY ("workTypeId") REFERENCES "WorkType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ProjectLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_bomItemId_fkey" FOREIGN KEY ("bomItemId") REFERENCES "BomItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TaskAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSessionMember" ADD CONSTRAINT "WorkSessionMember_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSessionMember" ADD CONSTRAINT "WorkSessionMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remark" ADD CONSTRAINT "Remark_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remark" ADD CONSTRAINT "Remark_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remark" ADD CONSTRAINT "Remark_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remark" ADD CONSTRAINT "Remark_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ProjectLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remark" ADD CONSTRAINT "Remark_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remark" ADD CONSTRAINT "Remark_drawingVersionId_fkey" FOREIGN KEY ("drawingVersionId") REFERENCES "DrawingVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remark" ADD CONSTRAINT "Remark_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remark" ADD CONSTRAINT "Remark_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDay" ADD CONSTRAINT "AttendanceDay_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDay" ADD CONSTRAINT "AttendanceDay_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDay" ADD CONSTRAINT "AttendanceDay_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollMonth" ADD CONSTRAINT "PayrollMonth_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_monthId_fkey" FOREIGN KEY ("monthId") REFERENCES "PayrollMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmetaImport" ADD CONSTRAINT "SmetaImport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmetaImport" ADD CONSTRAINT "SmetaImport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmetaImport" ADD CONSTRAINT "SmetaImport_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorContact" ADD CONSTRAINT "ContractorContact_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorPayment" ADD CONSTRAINT "ContractorPayment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorPayment" ADD CONSTRAINT "ContractorPayment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TaskAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorPayment" ADD CONSTRAINT "ContractorPayment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorScore" ADD CONSTRAINT "ContractorScore_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiRule" ADD CONSTRAINT "KpiRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiPeriod" ADD CONSTRAINT "KpiPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiPeriod" ADD CONSTRAINT "KpiPeriod_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "KpiRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiSnapshot" ADD CONSTRAINT "KpiSnapshot_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "KpiPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiSnapshot" ADD CONSTRAINT "KpiSnapshot_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiSnapshot" ADD CONSTRAINT "KpiSnapshot_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiSnapshot" ADD CONSTRAINT "KpiSnapshot_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingVersion" ADD CONSTRAINT "DrawingVersion_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingVersion" ADD CONSTRAINT "DrawingVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingZone" ADD CONSTRAINT "DrawingZone_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DrawingVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingZone" ADD CONSTRAINT "DrawingZone_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ProjectLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingZoneTask" ADD CONSTRAINT "DrawingZoneTask_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DrawingZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingZoneTask" ADD CONSTRAINT "DrawingZoneTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_serviceContractId_fkey" FOREIGN KEY ("serviceContractId") REFERENCES "ServiceContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

