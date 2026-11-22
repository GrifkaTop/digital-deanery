import {readFileSync,appendFileSync} from "node:fs";
import {randomBytes} from "node:crypto";
const current=readFileSync('.env','utf8');
const values={AUTH_SECRET:randomBytes(32).toString('hex'),DEMO_A_LOGIN:`demo-a-${randomBytes(4).toString('hex')}`,DEMO_B_LOGIN:`demo-b-${randomBytes(4).toString('hex')}`,DEMO_A_PASSWORD:randomBytes(24).toString('base64url'),DEMO_B_PASSWORD:randomBytes(24).toString('base64url')};
for(const [key,value] of Object.entries(values)) if(!new RegExp(`^${key}=.+$`,'m').test(current)) appendFileSync('.env',`\n${key}=${value}\n`);
console.log('Auth environment prepared; values are only in .env');
