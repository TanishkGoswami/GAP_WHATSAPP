import * as fs from 'fs';
const content = fs.existsSync('../.env') ? fs.readFileSync('../.env', 'utf-8') : "NOT FOUND";
console.log("Parent env found:", fs.existsSync('../.env'));
console.log("Content len:", content.length);
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
console.log("Supabase URL:", process.env.SUPABASE_URL);


