import {randomBytes} from "node:crypto";
import {writeFileSync} from "node:fs";
const owner=randomBytes(32).toString("hex"), app=randomBytes(32).toString("hex");
writeFileSync(".env",`SITE_ADDRESS=localhost
APP_ORIGIN=https://localhost
POSTGRES_DB=deanery
POSTGRES_USER=deanery_owner
POSTGRES_PASSWORD=${owner}
APP_DB_PASSWORD=${app}
DATABASE_URL=postgresql://deanery_app:${app}@db:5432/deanery
MIGRATION_DATABASE_URL=postgresql://deanery_owner:${owner}@db:5432/deanery
`,{mode:0o600,flag:"wx"});
console.log("Created .env (secrets are not printed)");
