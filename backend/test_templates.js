import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;
const stored = "bf700c3462300b2f26aa463e3cfcb51f:4464ec18249cd9429f1b0db810fe7c1debd56f15b033a58632ee087a0f23a4fd35d21cd7d5f1389208bae43cff4fc3bed37ae1439523b9c6b79f01633804e0b55017ca10876403ce27cce7b87186eb2d4210f5c35d0ba8f53dc3879c25e08111206c78cd1152149896340c76e9b0685c713a8fea3319e52f0cf6dcf452e055a03e9962ddab6608b4a5e5bd646725054cec775b51ab10a7bd80b9fcb2d19a45380e9804f3103358a73b1562191ca7d264d2d00abb1df7f833702a0b1f3418082e37272063d7e3c010f39a5178e848f5ca049db0e9da1700bcfd543c08e7839c043a9069c19f8cd9bd855a4d9fbfd3c8d6446a28b861ddbf693db0fc0e874387c4aa18b2285f8b1a3f7b7b102e171a903bd56f1f4076e8ec68ce64799a152a81ae";

const [ivHex, encHex] = stored.split(':');
const iv = Buffer.from(ivHex, 'hex');
const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
const token = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString();

async function run() {
  const waba_id = "1536195574879705";
  const url = `https://graph.facebook.com/v20.0/${waba_id}/message_templates`;
  console.log("Fetching", url);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await response.json();
  console.log(JSON.stringify(json, null, 2));
}

run();
