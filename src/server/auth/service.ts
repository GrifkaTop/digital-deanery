import "server-only";
import { z } from "zod";
import type { PoolClient } from "pg";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPool } from "../db";
import { bucketDigest, issueCsrf, randomToken, sessionDigest, validCsrf } from "./crypto";
import { hashPassword, verifyPassword } from "./password";
import { loginSchema, profileSchema, type Profile } from "../../contracts/auth";
const SESSION = "__Host-session", CSRF = "__Host-csrf";
const cookieOptions = {httpOnly:true, secure:true, sameSite:"lax" as const, path:"/"};
export class HttpError extends Error { constructor(public status:number, public code:string) { super(code); } }
function secret() { const key=process.env.AUTH_SECRET; if (!key || key.length < 64) throw new Error("Auth configuration missing"); return key; }
export function json(data:unknown, status=200) { return NextResponse.json(data,{status,headers:{"Cache-Control":"no-store, private"}}); }
export async function handle(fn:()=>Promise<NextResponse>) {
 try { return await fn(); } catch(e) { const r=json({code:e instanceof HttpError?e.code:"UNAVAILABLE"},e instanceof HttpError?e.status:503); if(e instanceof HttpError && e.status===429) r.headers.set("Retry-After","900"); return r; }
}
export type Actor = Profile & { session_id: string; account_id: string; group_id: string };
export async function requireActor(): Promise<Actor> {
 const token=(await cookies()).get(SESSION)?.value;
 if(!token || !/^[\w-]{43}$/.test(token)) throw new HttpError(401,"UNAUTHENTICATED");
 const result=await getPool().query<Actor>(`SELECT s.id AS session_id, a.id AS account_id, st.id, st.full_name AS "fullName", g.faculty, g.program, g.course, g.code AS "group", st.group_id FROM sessions s JOIN accounts a ON a.id=s.account_id JOIN students st ON st.account_id=a.id JOIN groups g ON g.id=st.group_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.is_active`,[sessionDigest(token)]);
 if(!result.rows[0]) throw new HttpError(401,"UNAUTHENTICATED");
 return result.rows[0];
}
async function binding() { const token=(await cookies()).get(SESSION)?.value; return token ? sessionDigest(token).toString("hex") : "prelogin"; }
export async function csrfResponse() {
 const token=issueCsrf(await binding(),secret()); const r=json({token}); r.cookies.set(CSRF,token,{...cookieOptions,maxAge:900}); return r;
}
export function checkOrigin(request:Request) {
 const origin=process.env.APP_ORIGIN;
 const localOrigin=process.env.LOCAL_APP_ORIGIN;
 if(!origin?.startsWith("https://") || ![origin, localOrigin].some(allowed => allowed?.startsWith("https://") && request.headers.get("origin")===allowed)) throw new HttpError(403,"CSRF_REJECTED");
}
export async function checkCsrf(request:Request) {
 checkOrigin(request);
 const token=request.headers.get("x-csrf-token");
 if(!token || token!==(await cookies()).get(CSRF)?.value || !validCsrf(token,await binding(),secret())) throw new HttpError(403,"CSRF_REJECTED");
}
let dummyHash:Promise<string>|undefined;
async function reserveAttempts(ip:string,login:string) {
 const client=await getPool().connect();
 try {
  await client.query("BEGIN");
  await client.query("DELETE FROM login_rate_limits WHERE window_start_at < now()-interval '30 minutes'");
  let blocked=false;
  for(const [scope,value,limit] of [["ip",ip,20],["ip_login",JSON.stringify([ip,login]),10]] as const) {
   const r=await client.query(`INSERT INTO login_rate_limits(scope,bucket_hash,window_start_at,count) VALUES($1,$2,date_bin('15 minutes',now(),'2000-01-01'::timestamptz),1) ON CONFLICT(scope,bucket_hash,window_start_at) DO UPDATE SET count=LEAST(login_rate_limits.count+1,1000000) RETURNING count`,[scope,bucketDigest(value,secret())]);
   if(r.rows[0].count>limit) blocked=true;
  }
  await client.query("COMMIT"); if(blocked) throw new HttpError(429,"RATE_LIMITED");
 } catch(e) { await client.query("ROLLBACK"); throw e; } finally {client.release();}
}
const demoLoginSchema = z.strictObject({ profile: z.enum(["a", "b"]).optional() });
const demoLoginEnabled = () => process.env.ENABLE_DEMO_LOGIN === "true";
const configuredDemoLogin = () => process.env.DEMO_MOBILE_LOGIN?.trim().toLowerCase() || "test3";

async function findDemoAccount(login: string, profile?: "a" | "b") {
  const number = profile === "a" ? 1 : profile === "b" ? 2 : 3;
  const { rows } = await getPool().query<{ id: string; is_active: boolean }>(`
    SELECT a.id, a.is_active FROM accounts a JOIN students st ON st.account_id=a.id
    WHERE a.id=$1 AND ($2::text IS NULL OR a.login=$2) AND st.student_number=$3 AND a.is_active
  `, [`10000000-0000-4000-8000-00000000000${number}`, profile ? null : login, `DEMO-${number}`]);
  return rows[0];
}

export async function demoLoginAvailable() {
  if (!demoLoginEnabled()) return { enabled: false, profiles: [] };
  const profiles = await Promise.all((["a", "b"] as const).map(async profile =>
    await findDemoAccount("", profile) ? profile : null));
  return { enabled: Boolean(await findDemoAccount(configuredDemoLogin())), profiles: profiles.filter(profile => profile !== null) };
}

export async function login(request:Request, demo = false) {
 if (demo && !demoLoginEnabled()) throw new HttpError(404, "NOT_FOUND");
 await checkCsrf(request);
 let body; try { const text=await request.text(); if(text.length>4096) throw new HttpError(422,"INVALID_FIELDS"); body=JSON.parse(text); } catch(e) { if(e instanceof HttpError) throw e; throw new HttpError(400,"INVALID_JSON"); }
 // Caddy overwrites X-Real-IP, and the app has no published port.
 const ip = request.headers.get("x-real-ip");
 const parsed = loginSchema.safeParse(body);
 const demoParsed = demoLoginSchema.safeParse(body);
 if (demo ? !demoParsed.success : !parsed.success) throw new HttpError(422, "INVALID_FIELDS");
 if (!ip) throw new HttpError(503, "PROXY_REQUIRED");
 let account;
 if (demo) {
   const profile = demoParsed.success ? demoParsed.data.profile : undefined;
   const demoLogin = profile ? `demo-profile-${profile}` : configuredDemoLogin();
   await reserveAttempts(ip, demoLogin);
   account = await findDemoAccount(demoLogin, profile);
 } else if (parsed.success) {
   await reserveAttempts(ip, parsed.data.login);
   account = (await getPool().query("SELECT id,password_hash,is_active FROM accounts WHERE login=$1", [parsed.data.login])).rows[0];
   const encoded = account?.password_hash ?? await (dummyHash ??= hashPassword(randomToken()));
   if (!await verifyPassword(encoded, parsed.data.password)) throw new HttpError(401, "INVALID_CREDENTIALS");
 }
 if (!account?.is_active) throw new HttpError(401, "INVALID_CREDENTIALS");
 const token=randomToken(); const old=(await cookies()).get(SESSION)?.value;
 const client=await getPool().connect();
 try {
  await client.query("BEGIN");
  if(old) await client.query("DELETE FROM sessions WHERE token_hash=$1",[sessionDigest(old)]);
  const active=await client.query("SELECT id FROM accounts WHERE id=$1 AND is_active FOR SHARE",[account.id]);
  if(!active.rowCount) throw new HttpError(401,"INVALID_CREDENTIALS");
  await client.query("INSERT INTO sessions(account_id,token_hash,expires_at) VALUES($1,$2,now()+interval '12 hours')",[account.id,sessionDigest(token)]);
  await client.query("COMMIT");
 } catch(e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
 const r=json({ok:true}); r.cookies.set(SESSION,token,{...cookieOptions,maxAge:43200}); r.cookies.set(CSRF,"",{...cookieOptions,maxAge:0}); return r;
}
export async function logout(request:Request) {
 await checkCsrf(request); const token=(await cookies()).get(SESSION)?.value;
 if(token) await getPool().query("DELETE FROM sessions WHERE token_hash=$1",[sessionDigest(token)]);
 const r=new NextResponse(null,{status:204,headers:{"Cache-Control":"no-store, private"}});
 for(const name of [SESSION,CSRF]) r.cookies.set(name,"",{...cookieOptions,maxAge:0}); return r;
}
export async function me(request:Request) {
 const actor=await requireActor();
 if(new URL(request.url).search) throw new HttpError(422,"INVALID_FIELDS");
 const { rows } = await getPool().query(`SELECT st.student_number AS "studentNumber", st.email,
   st.avatar_key AS "avatarKey", g.education_level AS "educationLevel", g.study_mode AS "studyMode",
   (SELECT label FROM semesters WHERE is_current LIMIT 1) AS "currentSemester"
   FROM students st JOIN groups g ON g.id = st.group_id WHERE st.id = $1`, [actor.id]);
 if (!rows[0]) throw new HttpError(401,"UNAUTHENTICATED");
 return json(profileSchema.parse({id:actor.id,fullName:actor.fullName,faculty:actor.faculty,program:actor.program,course:actor.course,group:actor.group,...rows[0]}));
}

export async function lockSession(client: PoolClient, actor: Actor) {
  const result = await client.query(`
    SELECT FROM sessions s JOIN accounts a ON a.id = s.account_id
    JOIN students st ON st.account_id = a.id
    WHERE s.id = $1 AND st.id = $2 AND s.expires_at > clock_timestamp() AND a.is_active
    FOR UPDATE OF s
  `, [actor.session_id, actor.id]);
  if (!result.rowCount) throw new HttpError(401, "UNAUTHENTICATED");
}
