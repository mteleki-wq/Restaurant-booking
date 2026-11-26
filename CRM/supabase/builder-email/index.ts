// Webescapade Site Builder — Email Studio (owner sends to their own subscribed customers).
// POST (signed-in owner) { action, site_id, ... }
//   preview { site_id, campaign }            -> { html }        the exact email, for the editor preview
//   test    { site_id, campaign }            -> { ok, to }      sends one copy to the owner
//   send    { site_id, campaign_id }         -> { ok, sent, failed }   saved draft -> every subscribed customer
//   draft   { site_id, brief }               -> { content }     AI writes a first draft (Claude)
// Only Platinum websites whose booking connection points at a Deluxe business the owner runs
// (public.builder_hub_access). Every email carries the business name, a reply address and an
// unsubscribe link (Spam Act 2003); only customers who said yes (subscribed) are emailed.
// Secrets: RESEND_API_KEY, FROM_EMAIL (verified sender), ANTHROPIC_API_KEY (for drafts).

const SB = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const FROM = Deno.env.get("FROM_EMAIL") || "onboarding@resend.dev";
const AI = Deno.env.get("ANTHROPIC_API_KEY") || "";
const UNSUB = "https://webescapade.com/sites/unsubscribe.html";
const PER_SEND = 2000, PER_MONTH = 6000;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
class Fail extends Error { constructor(m: string, public code = 400) { super(m); } }

async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const t = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const one = async (p: string) => (await db(p))?.[0] ?? null;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const okEmail = (e: unknown) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(e || ""));
const okUrl = (u: unknown) => /^https:\/\/[^\s"'<>]+$/i.test(String(u || "")) || /^(mailto:|tel:)[^\s"'<>]+$/i.test(String(u || ""));
const txt = (v: unknown, n: number) => String(v ?? "").replace(/\r/g, "").slice(0, n);

// who is calling, and may they use the Email Studio for this website?
async function gate(req: Request, siteId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(siteId || "")) throw new Fail("Unknown website.");
  const auth = req.headers.get("Authorization") || "";
  const u = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: SR, Authorization: auth } });
  const user = u.ok ? await u.json() : null;
  if (!user?.id) throw new Fail("Please sign in again.", 401);
  const r = await fetch(`${SB}/rest/v1/rpc/builder_hub_access`, { method: "POST", headers: { apikey: ANON || SR, Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify({ p_site: siteId }) });
  const acc = await r.json().catch(() => null);
  if (!r.ok) throw new Fail(acc?.message || "Not your website.", 403);
  if (!acc?.crm) throw new Fail("Email Studio needs Platinum and a verified booking connection to a business you run.", 403);
  const site = await one(`builder_sites?id=eq.${siteId}&select=id,slug,name,published,draft`);
  return { user, site, acc };
}

function clean(c: any) {
  c = c || {};
  const accent = /^#[0-9a-f]{6}$/i.test(c.accent || "") ? c.accent : "#5b4bd6";
  return {
    subject: txt(c.subject, 140).trim(), preheader: txt(c.preheader, 160), headline: txt(c.headline, 140),
    message: txt(c.message, 6000), image: okUrl(c.image) && /^https:/.test(c.image) ? c.image : "",
    button_text: txt(c.button_text, 50), button_url: okUrl(c.button_url) ? c.button_url : "", accent,
  };
}

// the email itself: one column, table layout, works in Outlook, Gmail and Apple Mail
function render(c: any, biz: { name: string; site: string; reply: string }, first: string, unsub: string) {
  const fill = (t: string) => esc(t).replace(/\{first_name\}/g, esc(first || "there"));
  const paras = c.message.split(/\n{2,}/).map((p: string) => p.trim()).filter(Boolean)
    .map((p: string) => `<p style="margin:0 0 16px;font:16px/1.6 Arial,Helvetica,sans-serif;color:#2b2b33">${fill(p).replace(/\n/g, "<br>")}</p>`).join("");
  const btn = c.button_text && c.button_url ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr><td style="border-radius:999px;background:${c.accent}"><a href="${esc(c.button_url)}" style="display:inline-block;padding:14px 26px;font:bold 16px Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:999px">${esc(c.button_text)}</a></td></tr></table>` : "";
  const img = c.image ? `<tr><td><img src="${esc(c.image)}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f2f7">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f2f7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="padding:22px 32px;border-bottom:4px solid ${c.accent};font:bold 20px Arial,Helvetica,sans-serif;color:#17142b">${esc(biz.name)}</td></tr>
${img}
<tr><td style="padding:30px 32px 26px">
${c.headline ? `<h1 style="margin:0 0 18px;font:bold 28px/1.2 Arial,Helvetica,sans-serif;color:#17142b">${fill(c.headline)}</h1>` : ""}
${paras}${btn}
</td></tr>
<tr><td style="padding:20px 32px 26px;background:#faf9fc;border-top:1px solid #ece9f3;font:13px/1.6 Arial,Helvetica,sans-serif;color:#6b6880">
<b style="color:#2b2b33">${esc(biz.name)}</b>${biz.site ? ` · <a href="${esc(biz.site)}" style="color:#6b6880">${esc(biz.site.replace(/^https:\/\//, ""))}</a>` : ""}<br>
You are receiving this because you asked to hear from ${esc(biz.name)}. Reply to this email to contact us.<br>
<a href="${esc(unsub)}" style="color:#6b6880">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`;
}

function bizOf(site: any, user: any) {
  return { name: site.name || "Our business", site: `https://webescapade.com/sites/?s=${site.slug}`, reply: user.email || "" };
}

async function resend(list: any[]) {
  if (!RESEND) throw new Fail("Email sending is not set up yet.", 503);
  const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: JSON.stringify(list) });
  if (!r.ok) { console.error("[builder-email] resend", r.status, (await r.text()).slice(0, 300)); return list.map(() => false); }
  return list.map(() => true);
}
const msg = (biz: any, to: string, c: any, html: string, unsub: string) => ({
  from: `${biz.name.replace(/[<>"]/g, "").slice(0, 60)} <${FROM}>`, to, subject: c.subject, html,
  ...(okEmail(biz.reply) ? { reply_to: biz.reply } : {}),
  headers: { "List-Unsubscribe": `<${unsub}>` },
});
const firstName = (n: unknown) => String(n || "").trim().split(/\s+/)[0] || "";

async function draft(site: any, brief: string) {
  if (!AI) throw new Fail("AI is not set up.", 503);
  const facts = JSON.stringify(site.published || site.draft || {}).replace(/"(src|image|images|url|href|bg)":"[^"]*"/g, "").slice(0, 9000);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": AI, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 900,
      system: `You write short, friendly marketing emails for a small business, to customers who asked to hear from it. Australian English. Plain words, no hype. Use {first_name} at most once. Use only facts from the brief and the website content; never invent prices, discounts, dates, codes, awards or reviews. Return ONLY JSON: {"subject":"under 60 chars","preheader":"under 100 chars","headline":"","message":"2-4 short paragraphs separated by a blank line","button_text":"2-4 words"}`,
      messages: [{ role: "user", content: `Business: ${site.name}\nWhat the owner wants to say: ${brief}\n\nWebsite content (for facts only): ${facts}` }] }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) { console.error("[builder-email] ai", r.status, JSON.stringify(j).slice(0, 300)); throw new Fail("The AI couldn't write a draft just now.", 502); }
  const t = (j?.content || []).map((x: any) => x.text || "").join("").replace(/```(json)?/g, "");
  try { const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); return { subject: txt(o.subject, 140), preheader: txt(o.preheader, 160), headline: txt(o.headline, 140), message: txt(o.message, 6000), button_text: txt(o.button_text, 50) }; }
  catch { throw new Fail("The AI draft came back in the wrong shape. Please try again."); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const action = String(b?.action || "");
    const { user, site } = await gate(req, String(b?.site_id || ""));
    const biz = bizOf(site, user);

    if (action === "preview") {
      const c = clean(b.campaign);
      return json({ html: render(c, biz, firstName(user.user_metadata?.name) || "Sam", UNSUB + "?t=preview") });
    }
    if (action === "draft") {
      const brief = txt(b.brief, 1200).trim();
      if (brief.length < 5) throw new Fail("Tell the AI what the email is about.");
      return json({ content: await draft(site, brief) });
    }
    if (action === "test") {
      const c = clean(b.campaign);
      if (!c.subject) throw new Fail("Add a subject first.");
      if (!okEmail(user.email)) throw new Fail("Your account has no email address.");
      const unsub = UNSUB + "?t=test";
      const [ok] = await resend([msg(biz, user.email, { ...c, subject: "[Test] " + c.subject }, render(c, biz, "Sam", unsub), unsub)]);
      if (!ok) throw new Fail("The test email could not be sent. Please try again.", 502);
      return json({ ok: true, to: user.email });
    }
    if (action === "send") {
      const id = String(b.campaign_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Fail("Save the campaign first.");
      const camp = await one(`builder_campaigns?id=eq.${id}&site_id=eq.${site.id}&select=*`);
      if (!camp) throw new Fail("Campaign not found.", 404);
      if (camp.status !== "draft") throw new Fail("This campaign has already been sent.");
      const c = clean({ ...camp.content, subject: camp.subject });
      if (!c.subject || !c.message.trim()) throw new Fail("Add a subject and a message first.");
      const recent = await db(`builder_campaigns?site_id=eq.${site.id}&status=neq.draft&sent_at=gte.${new Date(Date.now() - 10 * 60e3).toISOString()}&select=id`);
      if (recent?.length) throw new Fail("Please wait 10 minutes between campaigns.");
      const people = (await db(`builder_contacts?site_id=eq.${site.id}&subscribed=is.true&select=email,name,token&limit=${PER_SEND + 1}`) || []).filter((p: any) => okEmail(p.email));
      if (!people.length) throw new Fail("No one has agreed to receive emails yet.");
      if (people.length > PER_SEND) throw new Fail(`Campaigns can go to up to ${PER_SEND} people at a time. Ask Marc to raise your limit.`);
      const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
      const cnt = await fetch(`${SB}/rest/v1/builder_email_sends?site_id=eq.${site.id}&created_at=gte.${start.toISOString()}&select=id`, { method: "HEAD", headers: { apikey: SR, Authorization: `Bearer ${SR}`, Prefer: "count=exact" } });
      const used = Number((cnt.headers.get("content-range") || "*/0").split("/")[1] || 0);
      if (used + people.length > PER_MONTH) throw new Fail(`This would go over your ${PER_MONTH} emails this month (${used} used).`);
      // claim the campaign so a double click can't send it twice
      const claimed = await db(`builder_campaigns?id=eq.${id}&status=eq.draft`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "sending", recipients: people.length, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
      if (!claimed?.length) throw new Fail("This campaign is already sending.");
      let sent = 0, failed = 0;
      for (let i = 0; i < people.length; i += 100) {
        const part = people.slice(i, i + 100);
        const res = await resend(part.map((p: any) => { const unsub = `${UNSUB}?t=${p.token}`; return msg(biz, p.email, c, render(c, biz, firstName(p.name), unsub), unsub); }));
        res.forEach((ok) => ok ? sent++ : failed++);
        await db("builder_email_sends", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(part.map((p: any, k: number) => ({ site_id: site.id, campaign_id: id, email: p.email, ok: res[k] }))) });
      }
      await db(`builder_campaigns?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "sent", delivered: sent, updated_at: new Date().toISOString() }) });
      return json({ ok: true, sent, failed });
    }
    throw new Fail("Unknown action.");
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message }, e.code);
    console.error("[builder-email]", e);
    return json({ error: "Sorry, something went wrong. Please try again." }, 500);
  }
});
