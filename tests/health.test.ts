import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/server/db",()=>({getPool:()=>({query})}));
const query=vi.fn();
const {GET}=await import("../src/app/api/health/route");
afterEach(()=>vi.resetAllMocks());
it("returns health only after database responds",async()=>{query.mockResolvedValue({});const r=await GET();expect(r.status).toBe(200);expect(await r.json()).toEqual({status:"ok"});});
it("hides connection details on failure and disables caching",async()=>{query.mockRejectedValue(new Error("secret connection string"));const r=await GET();expect(r.status).toBe(503);expect(await r.json()).toEqual({status:"unavailable"});expect(r.headers.get("cache-control")).toBe("no-store");});
