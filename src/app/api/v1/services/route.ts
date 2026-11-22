import { serviceList } from "@/contracts/services";
import { handle, HttpError, json, requireActor } from "@/server/auth/service";
import { getPool } from "@/server/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(async () => {
    await requireActor();
    if (new URL(request.url).search) throw new HttpError(422, "INVALID_FIELDS");
    const { rows } = await getPool().query(`SELECT code,title,category,description,contract_version AS "contractVersion" FROM service_catalog WHERE active ORDER BY title,code`);
    return json(serviceList.parse({ items: rows }));
  });
}
