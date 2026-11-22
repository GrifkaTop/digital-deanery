import { Pool } from "pg";
import { z } from "zod";
import { hashPassword } from "../src/server/auth/password";
const env=z.object({MIGRATION_DATABASE_URL:z.string().min(1),DEMO_A_LOGIN:z.string().trim().toLowerCase().min(1),DEMO_B_LOGIN:z.string().trim().toLowerCase().min(1),DEMO_A_PASSWORD:z.string().min(16),DEMO_B_PASSWORD:z.string().min(16)}).parse(process.env);
async function main(){
 if(env.DEMO_A_LOGIN===env.DEMO_B_LOGIN) throw new Error("Distinct accounts required");
 const pool=new Pool({connectionString:env.MIGRATION_DATABASE_URL}); const c=await pool.connect();
 try { await c.query("BEGIN"); await c.query("SELECT pg_advisory_xact_lock(8112026)");
 for(const [i,login,password,name,group,faculty,program,course] of [
 [1,env.DEMO_A_LOGIN,env.DEMO_A_PASSWORD,"Студент Астра-01","Маяк-21","Факультет учебной аналитики","Прикладной анализ",2],
 [2,env.DEMO_B_LOGIN,env.DEMO_B_PASSWORD,"Студент Кварц-02","Орбита-11","Факультет прикладных коммуникаций","Моделирование коммуникаций",1],
 ...(process.env.DEMO_MOBILE_PASSWORD ? [[3, z.string().trim().toLowerCase().min(1).parse((process.env.DEMO_MOBILE_LOGIN?.trim() || "test3")), z.string().min(16).parse(process.env.DEMO_MOBILE_PASSWORD),
   "Миронов Александр Сергеевич", "ИС-31", "Факультет цифровых технологий", "Информационные системы и технологии", 3] as const] : []),
 ] as const){
 const id=`10000000-0000-4000-8000-00000000000${i}`;
 await c.query("INSERT INTO accounts(id,login,password_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[id,login,await hashPassword(password)]);
 const account = await c.query("SELECT id FROM accounts WHERE id=$3::uuid AND ($2<>3 OR login=$1)", [login, i, id]);
 if (!account.rowCount) throw new Error("Conflicting demo login");
 const g=await c.query("INSERT INTO groups(code,faculty,program,course) VALUES($1,$2,$3,$4) ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code RETURNING id",[group,faculty,program,course]);
 await c.query("INSERT INTO students(account_id,group_id,full_name,student_number,email) VALUES($1,$2,$3,$4,$5) ON CONFLICT(account_id) DO UPDATE SET group_id=CASE WHEN EXCLUDED.student_number='DEMO-3' AND students.student_number='DEMO-3' THEN EXCLUDED.group_id ELSE students.group_id END, full_name=CASE WHEN EXCLUDED.student_number='DEMO-3' AND students.student_number='DEMO-3' THEN EXCLUDED.full_name ELSE students.full_name END, student_number=COALESCE(students.student_number,EXCLUDED.student_number), email=COALESCE(students.email,EXCLUDED.email)",[account.rows[0].id,g.rows[0].id,name,`DEMO-${i}`,`student${i}@example.invalid`]);
 await c.query("UPDATE groups SET education_level=COALESCE(education_level, $2), study_mode=COALESCE(study_mode, $3) WHERE id=$1",[g.rows[0].id,"Бакалавриат","Очная"]);
 }
 await c.query("COMMIT"); console.log("Synthetic profiles ready");
 }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();await pool.end();}
}
main().catch(()=>{console.error("Seed failed; verify environment and database");process.exitCode=1;});
