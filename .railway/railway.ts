import { defineRailway, preserve, project, service } from "railway/iac";

// Infrastructure as Code for the Swifta web service (replaces railway.json).
// This repository manages only its own resources in the environment (partial "web");
// the Postgres database and the storage bucket are managed in the Railway dashboard.
// Secret values live only in Railway: every variable is declared with preserve() so
// `railway config apply` never changes or deletes them. Add new variables here the same way.
// Preview: `railway config plan`, apply: `railway config apply` (needs Node 22+).
export const partial = "web";

const KEEP = [
  "AUTH_SECRET",
  "DATABASE_URL",
  "ENABLE_SCHEDULER",
  "S3_ACCESS_KEY_ID",
  "S3_BUCKET",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_SECRET_ACCESS_KEY",
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
  "SEED_COMPANY_NAME",
  "SEED_DEMO",
  "STORAGE_DRIVER",
] as const;

export default defineRailway(() => {
  const web = service("web", {
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    deploy: {
      healthcheckPath: "/api/health",
      healthcheckTimeout: 120,
      // Restart policy type is Railway's default (ON_FAILURE); only the retry limit is set.
      restartPolicyMaxRetries: 5,
    },
    env: Object.fromEntries(KEEP.map((k) => [k, preserve()])),
  });
  return project("swifta", {
    resources: [web],
  });
});
