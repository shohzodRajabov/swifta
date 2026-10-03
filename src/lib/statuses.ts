import type { DocumentCategory, ProjectStage, StatusGroupCode } from "@prisma/client";

// Default object statuses (groups A–H). Admins can rename, add, reorder and deactivate sub-statuses;
// business logic only relies on the group `code`.

export const STATUS_GROUP_ORDER: StatusGroupCode[] = [
  "NEW",
  "OFFER",
  "CONTRACT",
  "WORK",
  "TESTING",
  "LAUNCHED",
  "DONE",
  "SERVICE",
];

/** Groups in which a project counts as finished (not delayed, not "active work"). */
export const FINISHED_GROUPS: StatusGroupCode[] = ["DONE", "SERVICE"];
/** Groups before the contract is signed (sales pipeline). */
export const PRESALE_GROUPS: StatusGroupCode[] = ["NEW", "OFFER"];

export type DefaultStatus = { code: string; name: string; requiredDocs?: DocumentCategory[] };

const SIGNED: DocumentCategory[] = ["SIGNED_CONTRACT"];
const CLOSING: DocumentCategory[] = ["COMPLETION_ACT", "PAYMENT_PROOF", "FINAL_DOCS"];

export const DEFAULT_STATUS_GROUPS: {
  code: StatusGroupCode;
  letter: string;
  name: string;
  color: string;
  statuses: DefaultStatus[];
}[] = [
  {
    code: "NEW",
    letter: "A",
    name: "Yangi",
    color: "#64748b",
    statuses: [
      { code: "A1", name: "Info yig'ilmoqda" },
      { code: "A2", name: "Loyiha chizmasi kutilmoqda" },
      { code: "A3", name: "KP tayyorlash kerak" },
      { code: "A4", name: "Zavoddan narx kutilmoqda" },
    ],
  },
  {
    code: "OFFER",
    letter: "B",
    name: "KP taqdim etilgan",
    color: "#0ea5e9",
    statuses: [
      { code: "B1", name: "Zakazchik javobi kutilmoqda" },
      { code: "B2", name: "Tender yakunlanishi kutilmoqda" },
      { code: "B3", name: "Kelishuv kutilmoqda" },
      { code: "B4", name: "Shartnoma tayyorlanmoqda" },
      { code: "B5", name: "Shartnoma imzolanishi kutilmoqda" },
    ],
  },
  {
    code: "CONTRACT",
    letter: "C",
    name: "Shartnoma imzolangan",
    color: "#6366f1",
    statuses: [
      { code: "C1", name: "Avans olindi", requiredDocs: SIGNED },
      { code: "C2", name: "Materiallarga zayavka berildi", requiredDocs: SIGNED },
      { code: "C3", name: "Komanda shakllantirildi", requiredDocs: SIGNED },
      { code: "C4", name: "Ish boshlandi", requiredDocs: SIGNED },
    ],
  },
  {
    code: "WORK",
    letter: "D",
    name: "Ish olib borilmoqda",
    color: "#f59e0b",
    statuses: [
      { code: "D1", name: "Mas'ul xodimlar belgilandi" },
      { code: "D2", name: "Materiallar yetkazildi" },
      { code: "D3", name: "Montaj boshlandi" },
      { code: "D4", name: "Shartnomadagi ishlar yakunlandi" },
      { code: "D5", name: "Qo'shimcha ishlar yakunlandi" },
      { code: "D6", name: "Puskonaladka ishlari yakunlandi" },
      { code: "D7", name: "Montaj to'liq yakunlandi" },
    ],
  },
  {
    code: "TESTING",
    letter: "E",
    name: "Testlash",
    color: "#a855f7",
    statuses: [
      { code: "E1", name: "Azot bilan testlash" },
      { code: "E2", name: "Pusk bilan testlash" },
      { code: "E3", name: "Pojar holati uchun testlash" },
      { code: "E4", name: "Qo'shimcha testlash" },
    ],
  },
  {
    code: "LAUNCHED",
    letter: "F",
    name: "Muvaffaqiyatli ishga tushgan",
    color: "#14b8a6",
    statuses: [
      { code: "F1", name: "Test muvaffaqiyatli" },
      { code: "F2", name: "Forma 1/2/3" },
      { code: "F3", name: "Yakuniy hisob-kitob kutilmoqda" },
      { code: "F4", name: "To'lov kutilmoqda" },
    ],
  },
  {
    code: "DONE",
    letter: "G",
    name: "Yakunlangan",
    color: "#22c55e",
    statuses: [
      { code: "G", name: "Yakunlangan", requiredDocs: CLOSING },
      { code: "G1", name: "Kafolat davri", requiredDocs: CLOSING },
    ],
  },
  {
    code: "SERVICE",
    letter: "H",
    name: "Servis",
    color: "#0891b2",
    statuses: [{ code: "H", name: "Servis" }],
  },
];

/** How the old fixed 18 stages map onto the new statuses. */
export const LEGACY_STAGE_TO_STATUS: Record<ProjectStage, string> = {
  NEW_REQUEST: "A1",
  SITE_VISIT: "A1",
  TECH_SPEC: "A2",
  ESTIMATION: "A3",
  DESIGN: "A3",
  PROPOSAL: "B1",
  CONTRACT: "B5",
  PROCUREMENT: "C2",
  WAREHOUSE: "D2",
  DELIVERY: "D2",
  INSTALLATION: "D3",
  COMMISSIONING: "D6",
  TESTING: "E2",
  HANDOVER: "F2",
  FINAL_PAYMENT: "F4",
  WARRANTY: "G1",
  SERVICE: "H",
  COMPLETED: "G",
};

export function groupIndex(code: StatusGroupCode): number {
  return STATUS_GROUP_ORDER.indexOf(code);
}
