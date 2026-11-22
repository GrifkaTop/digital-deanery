import { expect, it } from "vitest";
import { issueCsrf, validCsrf, sessionDigest, randomToken } from "../src/server/auth/crypto";
import { loginSchema } from "../src/contracts/auth";
import { hashPassword, verifyPassword } from "../src/server/auth/password";
it('binds CSRF to session, signature and expiry',()=>{const key=randomToken(),t=issueCsrf('a',key,1000);expect(validCsrf(t,'a',key,1001)).toBe(true);expect(validCsrf(t,'b',key,1001)).toBe(false);expect(validCsrf(t+'x','a',key,1001)).toBe(false);expect(validCsrf(t,'a',key,901000)).toBe(false);expect(validCsrf(t,'a',randomToken(),1001)).toBe(false);});
it('rejects client ownership and normalizes login',()=>{expect(loginSchema.parse({login:' A ',password:'x'}).login).toBe('a');expect(loginSchema.safeParse({login:'a',password:'x',role:'admin'}).success).toBe(false);});
it('uses salted Argon2id and opaque session digests',async()=>{const password=randomToken(),a=await hashPassword(password),b=await hashPassword(password);expect(a).not.toBe(b);expect(a).toContain('$argon2id$v=19$m=19456,t=2,p=1$');expect(await verifyPassword(a,password)).toBe(true);expect(await verifyPassword(a,randomToken())).toBe(false);expect(sessionDigest(randomToken()).length).toBe(32);});
