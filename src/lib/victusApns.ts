import "server-only";
import { createPrivateKey, sign } from "node:crypto";
import { connect } from "node:http2";
let cached: { token: string; at: number; keyId: string | undefined; team: string | undefined } | undefined;

export function apnsConfigured() {
  return process.env.VICTUS_APNS_ENABLED === "true" && !!process.env.APNS_KEY_ID && !!process.env.APNS_TEAM_ID && !!process.env.APNS_PRIVATE_KEY;
}
export async function sendVictusStart(token: string, payload: unknown): Promise<number> {
  if (!apnsConfigured()) throw new Error("APNs not configured");
  if (!cached || Date.now() - cached.at > 45 * 60_000 || cached.keyId !== process.env.APNS_KEY_ID || cached.team !== process.env.APNS_TEAM_ID) {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: process.env.APNS_KEY_ID })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) })).toString("base64url");
  const input = `${header}.${claims}`;
  const key = createPrivateKey(process.env.APNS_PRIVATE_KEY!.replace(/\\n/g, "\n"));
  const signature = sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  cached = { token: `${input}.${signature}`, at: Date.now(), keyId: process.env.APNS_KEY_ID, team: process.env.APNS_TEAM_ID };
  }
  const jwt = cached.token;
  return new Promise((resolve, reject) => {
    const session = connect("https://api.push.apple.com");
    const timer = setTimeout(() => { session.destroy(); reject(new Error("APNs timeout")); }, 8000);
    const finish = () => { clearTimeout(timer); session.close(); };
    session.on("error", () => { finish(); reject(new Error("APNs connection failed")); });
    const req = session.request({ ":method": "POST", ":path": `/3/device/${token}`,
      authorization: `bearer ${jwt}`, "apns-push-type": "liveactivity",
      "apns-topic": "com.zamoriane.takingcare.push-type.liveactivity", "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 60) });
    let status = 0;
    req.on("response", headers => { status = Number(headers[":status"]); });
    req.on("data", () => {}); // Never log token, private key or response contents.
    req.on("end", () => { finish(); resolve(status); });
    req.on("error", () => { finish(); reject(new Error("APNs request failed")); });
    req.end(JSON.stringify(payload));
  });
}
