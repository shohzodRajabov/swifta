import type { ProjectStage } from "@prisma/client";

export const STAGES: ProjectStage[] = [
  "NEW_REQUEST",
  "SITE_VISIT",
  "TECH_SPEC",
  "ESTIMATION",
  "DESIGN",
  "PROPOSAL",
  "CONTRACT",
  "PROCUREMENT",
  "WAREHOUSE",
  "DELIVERY",
  "INSTALLATION",
  "COMMISSIONING",
  "TESTING",
  "HANDOVER",
  "FINAL_PAYMENT",
  "WARRANTY",
  "SERVICE",
  "COMPLETED",
];

export type StageGroup = "PRESALE" | "DESIGN" | "PROCUREMENT" | "INSTALLATION" | "CLOSING" | "COMPLETED";

export const STAGE_GROUP: Record<ProjectStage, StageGroup> = {
  NEW_REQUEST: "PRESALE",
  SITE_VISIT: "PRESALE",
  TECH_SPEC: "DESIGN",
  ESTIMATION: "DESIGN",
  DESIGN: "DESIGN",
  PROPOSAL: "DESIGN",
  CONTRACT: "DESIGN",
  PROCUREMENT: "PROCUREMENT",
  WAREHOUSE: "PROCUREMENT",
  DELIVERY: "PROCUREMENT",
  INSTALLATION: "INSTALLATION",
  COMMISSIONING: "INSTALLATION",
  TESTING: "INSTALLATION",
  HANDOVER: "INSTALLATION",
  FINAL_PAYMENT: "CLOSING",
  WARRANTY: "CLOSING",
  SERVICE: "CLOSING",
  COMPLETED: "COMPLETED",
};

export function stageIndex(stage: ProjectStage): number {
  return STAGES.indexOf(stage);
}

/** 0..100, based on position in the stage pipeline. */
export function stageProgress(stage: ProjectStage): number {
  return Math.round((stageIndex(stage) / (STAGES.length - 1)) * 100);
}
