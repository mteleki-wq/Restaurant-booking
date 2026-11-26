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

import WBMail from "./mail.js";

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
const _okUrl = (u: unknown) => /^https:\/\/[^\s"'<>]+$/i.test(String(u || "")) || /^(mailto:|tel:)[^\s"'<>]+$/i.test(String(u || ""));
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
  const o: any = WBMail.clean(c);
  o.subject = txt(c.subject, 140).trim();
  return o;
}
const render = (c: any, biz: any, first: string, unsub: string) => WBMail.render(c, biz, first, unsub);
const subj = (s: string, first: string) => s.replace(/\{first_name\}/g, first || "there");

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

const KINDS: Record<string, string> = { restaurant: "restaurant or café", function: "function and events venue", service: "salon, spa or clinic", trades: "trades or home-services business", shop: "shop", general: "small business" };
async function draft(site: any, brief: string, kind: string, images: string[], book: string) {
  if (!AI) throw new Fail("AI is not set up.", 503);
  const facts = JSON.stringify(site.published || site.draft || {}).replace(/"(src|image|images|url|href|bg)":"[^"]*"/g, "").slice(0, 9000);
  const imgs = (Array.isArray(images) ? images : []).filter((u) => WBMail.okImg(u)).slice(0, 24);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": AI, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 2200,
      system: `You write friendly marketing emails for a ${KINDS[kind] || KINDS.general}, sent to customers who asked to hear from it. Australian English. Plain, warm words, no hype, short paragraphs.
Use {first_name} at most twice. Use only facts from the brief and the website content. Never invent prices, discounts, dates, times, numbers, names, codes, awards or reviews: where a detail is needed but unknown, write a short placeholder in square brackets, e.g. [date] or [price per person].
Pictures: the website has ${imgs.length} photos, numbered 0 to ${Math.max(0, imgs.length - 1)}. Refer to them only by number; use -1 for none. Use each photo at most once.
Return ONLY JSON:
{"subject":"under 60 chars","preheader":"under 100 chars","eyebrow":"1-3 words","hero":0,"headline":"","intro":"1-2 short paragraphs separated by a blank line","button_text":"2-4 words",
 "sections":[ 2 to 4 of:
   {"t":"pictext","img":1,"title":"","text":"","side":"left|right"}
   {"t":"gallery","imgs":[2,3,4],"caption":""}
   {"t":"cards","title":"","items":[{"img":-1,"title":"","text":""}, … 3 items]}
   {"t":"highlight","title":"","text":""}
   {"t":"text","title":"","text":""} ],
 "signoff":"e.g. See you soon,\nThe team at <business>"}`,
      messages: [{ role: "user", content: `Business: ${site.name}\nWhat the owner wants to say: ${brief}\n\nWebsite content (for facts only): ${facts}` }] }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) { console.error("[builder-email] ai", r.status, JSON.stringify(j).slice(0, 300)); throw new Fail("The AI couldn't write a draft just now.", 502); }
  const t = (j?.content || []).map((x: any) => x.text || "").join("").replace(/```(json)?/g, "");
  let o: any;
  try { o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); } catch { throw new Fail("The AI draft came back in the wrong shape. Please try again."); }
  const pic = (n: unknown) => (typeof n === "number" && n >= 0 && n < imgs.length ? imgs[n] : "");
  const secs = (Array.isArray(o.sections) ? o.sections : []).slice(0, 5).map((s: any) => {
    if (!s) return null;
    if (s.t === "pictext") return { ...s, img: pic(s.img), btn_text: "", btn_url: "" };
    if (s.t === "gallery") return { ...s, imgs: (Array.isArray(s.imgs) ? s.imgs : []).map(pic).filter(Boolean) };
    if (s.t === "cards") return { ...s, items: (Array.isArray(s.items) ? s.items : []).map((i: any) => ({ ...i, img: pic(i?.img) })) };
    return s;
  }).filter(Boolean);
  const c = WBMail.clean({ ...o, hero: pic(o.hero), sections: secs, button_url: WBMail.okUrl(book) ? book : "" });
  return { ...c, subject: txt(o.subject, 140) };
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
      return json({ content: await draft(site, brief, String(b.kind || ""), b.images, String(b.book || "")) });
    }
    if (action === "test") {
      const c = clean(b.campaign);
      if (!c.subject) throw new Fail("Add a subject first.");
      if (!okEmail(user.email)) throw new Fail("Your account has no email address.");
      const unsub = UNSUB + "?t=test";
      const [ok] = await resend([msg(biz, user.email, { ...c, subject: "[Test] " + subj(c.subject, "Sam") }, render(c, biz, "Sam", unsub), unsub)]);
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
      if (!c.subject || !WBMail.hasBody(c)) throw new Fail("Add a subject and a message first.");
      const gaps = WBMail.blanks(c).concat(c.subject.match(/\[[^\]]{2,60}\]/g) || []);
      if (gaps.length) throw new Fail("Fill in the parts in [square brackets] first: " + gaps.slice(0, 4).join(", "));
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
        const res = await resend(part.map((p: any) => { const unsub = `${UNSUB}?t=${p.token}`; return msg(biz, p.email, { ...c, subject: subj(c.subject, firstName(p.name)) }, render(c, biz, firstName(p.name), unsub), unsub); }));
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
