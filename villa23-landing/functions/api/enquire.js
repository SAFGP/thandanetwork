/* Cloudflare Pages Function: POST /api/enquire
   Receives an enquiry from any South Africa | Forbes Global Properties listing
   page, emails it to the principal broker, and files it in the Notion CRM.
   Serves the whole catalogue: pass a "listing" field and one endpoint handles
   every property. Works for both the JavaScript fetch (returns JSON) and a
   plain no-JavaScript form post (returns a thank you page).

   Set these as Pages environment variables (Settings, Variables and Secrets):
     RESEND_API_KEY   email delivery, your Resend API key
     ENQUIRY_TO       optional, defaults to info@southafricafgp.com
     ENQUIRY_FROM     optional, defaults to "South Africa | Forbes Global Properties <enquiries@southafricafgp.com>"
     NOTION_TOKEN     Notion internal integration secret (CRM write)
     NOTION_DB_ID     the CRM database id the integration can access
     TURNSTILE_SECRET_KEY  Cloudflare Turnstile secret, verification is skipped when unset

   A lead is never dropped: if either email or Notion succeeds the enquirer sees
   success. Only if the enquiry is captured nowhere does the page show its email
   fallback. Missing credentials simply skip that channel. */

const esc = (s) =>
  String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function wantsJson(request) {
  const a = request.headers.get("accept") || "";
  const c = request.headers.get("content-type") || "";
  return a.includes("application/json") || c.includes("application/json");
}

async function readBody(request) {
  const c = request.headers.get("content-type") || "";
  if (c.includes("application/json")) {
    const j = await request.json().catch(() => ({}));
    return { name: j.name, email: j.email, note: j.note, listing: j.listing, turnstile: j.turnstile };
  }
  const f = await request.formData();
  return { name: f.get("name"), email: f.get("email"), note: f.get("note"), listing: f.get("listing"), turnstile: f.get("cf-turnstile-response") };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Turnstile siteverify, verify or flag: a signal on the enquiry, never a gate.
   A token that Cloudflare confirms means verified. A missing token, a rejected
   token or an unreachable siteverify means unverified, and the enquiry still
   proceeds, flagged for judgment. A real buyer is never blocked by a widget
   failure. Skipped when TURNSTILE_SECRET_KEY is unset (local dev). The secret
   goes only to Cloudflare and is never logged. */
async function verifyTurnstile(env, request, token) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  const params = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) params.set("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const j = await r.json().catch(() => ({}));
    return j.success === true;
  } catch { return false; }
}

const thankYouPage = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Thank you</title>
<style>body{margin:0;background:#0a0a0a;color:#fff;font-family:system-ui,sans-serif;display:flex;
min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:2rem}
a{color:#cdaa8b}h1{font-weight:300;font-size:2rem}</style></head>
<body><div><h1>Thank you</h1><p>A principal broker will be in touch.</p>
<p><a href="/">Return to the residence</a></p></div></body></html>`;

async function sendEmail(env, { name, email, note, listing, verified }) {
  if (!env.RESEND_API_KEY) return false;
  const to = env.ENQUIRY_TO || "info@southafricafgp.com";
  const from = env.ENQUIRY_FROM || "South Africa | Forbes Global Properties <enquiries@southafricafgp.com>";
  const html =
    `<h2>New enquiry${listing ? ", " + esc(listing) : ""}</h2>` +
    (verified ? "" : `<p>Verification: not confirmed, treat with judgment.</p>`) +
    `<p><strong>Name:</strong> ${esc(name)}</p>` +
    `<p><strong>Email:</strong> ${esc(email)}</p>` +
    `<p><strong>Message:</strong><br>${esc(note) || "(none)"}</p>` +
    `<hr><p>Sent from the ${esc(listing) || "South Africa | Forbes Global Properties"} listing page.</p>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [to], reply_to: email,
        subject: `${verified ? "" : "[unverified] "}${listing || "South Africa | Forbes Global Properties"} enquiry from ${name}`,
        html,
      }),
    });
    return r.ok;
  } catch { return false; }
}

async function fileInNotion(env, { name, email, note, listing, verified }) {
  if (!env.NOTION_TOKEN || !env.NOTION_DB_ID) return false;
  let message = (note || "").slice(0, 1900);
  if (!verified) message = message ? message + " [unverified]" : "[unverified]";
  try {
    const r = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: env.NOTION_DB_ID },
        properties: {
          "Name": { title: [{ text: { content: name.slice(0, 200) } }] },
          "Email": { email },
          "Message": { rich_text: [{ text: { content: message } }] },
          "Listing": { select: { name: (listing || "General").slice(0, 100) } },
          "Source": { rich_text: [{ text: { content: "Website enquiry form" } }] },
        },
      }),
    });
    return r.ok;
  } catch { return false; }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const json = wantsJson(request);
  const reply = (status, obj, html) =>
    json
      ? new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } })
      : new Response(html || obj.error || "", { status, headers: { "content-type": "text/html; charset=utf-8" } });

  let data;
  try { data = await readBody(request); }
  catch { return reply(400, { ok: false, error: "Could not read the form." }); }

  const verified = await verifyTurnstile(env, request, (data.turnstile || "").toString().trim());

  const name = (data.name || "").toString().trim();
  const email = (data.email || "").toString().trim();
  const note = (data.note || "").toString().trim();
  const listing = (data.listing || "").toString().trim();

  if (!name) return reply(400, { ok: false, error: "Name is required." });
  if (!EMAIL_RE.test(email)) return reply(400, { ok: false, error: "A valid email is required." });

  const payload = { name, email, note, listing, verified };
  const [emailed, filed] = await Promise.all([sendEmail(env, payload), fileInNotion(env, payload)]);

  if (!emailed && !filed) {
    return reply(503, { ok: false, error: "Enquiry delivery is not configured yet." });
  }
  return reply(200, { ok: true }, thankYouPage);
}

export const onRequest = async (context) => {
  if (context.request.method === "POST") return onRequestPost(context);
  return new Response("Method not allowed", { status: 405, headers: { "Allow": "POST" } });
};
