import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [domain, output = ".env.server", ...extra] = process.argv.slice(2);
if (extra.length || !domain || domain.length > 253 || !domain.includes(".")
    || !domain.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
    || /^\d+(?:\.\d+){3}$/.test(domain) || domain.endsWith(".localhost")) {
  console.error("Usage: node scripts/init-server-env.mjs site.example.org [new-env-file]");
  process.exit(1);
}
const secret = () => randomBytes(32).toString("hex");
const owner = secret(), app = secret();
const content = `# Generated for a future deployment. Keep outside source control.
SITE_ADDRESS=${domain.toLowerCase()}
APP_ORIGIN=https://${domain.toLowerCase()}
LOCAL_APP_ORIGIN=
BIND_ADDRESS=0.0.0.0
POSTGRES_PASSWORD=${owner}
APP_DB_PASSWORD=${app}
DATABASE_URL=postgresql://deanery_app:${app}@db:5432/deanery
MIGRATION_DATABASE_URL=postgresql://deanery_owner:${owner}@db:5432/deanery
AUTH_SECRET=${secret()}
DEMO_A_LOGIN=demo-a-${randomBytes(4).toString("hex")}
DEMO_A_PASSWORD=${secret()}
DEMO_B_LOGIN=demo-b-${randomBytes(4).toString("hex")}
DEMO_B_PASSWORD=${secret()}
DEMO_MOBILE_PASSWORD=
ENABLE_DEMO_LOGIN=false
DEMO_ACADEMIC_NOW=
ASSISTANT_DOCUMENTS_DIR=./documents
# Qwen stays disabled until explicitly enabled on a restricted stand.
ASSISTANT_QWEN_BASE_URL=
ASSISTANT_QWEN_MODEL=deanery-compare-36-q4-4k
ASSISTANT_QWEN_API_KEY=
TESLA_QWEN_SSH_HOST=host.docker.internal
TESLA_QWEN_SSH_PORT=8022
TESLA_QWEN_SSH_USER=modelonly
TESLA_QWEN_SSH_KEY=
TESLA_QWEN_KNOWN_HOSTS=
`;
try {
  writeFileSync(resolve(output), content, { flag: "wx", mode: 0o600 });
  console.log("Server environment created; no services started and no secrets printed.");
} catch (error) {
  console.error(error.code === "EEXIST" ? "File already exists; refusing to overwrite." : "Cannot create server environment file.");
  process.exitCode = 1;
}
