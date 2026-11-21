// ============================================================
//  trd-email  —  Supabase Edge Function (Trade Deluxe)
// ============================================================
//  Called by the database only (trd_notify), with the x-svc-hook secret:
//    {event:"booked"|"cancelled", id: job id}
//    {event:"quote_request"|"quote_sent"|"quote_declined", id: quote id}
//    {event:"lead", id: trd_lead_log id}        (sales-page enquiry)
//  It never trusts the body for recipients: it reads the record with
//  trd_email_payload (service role only) and emails from that.
//  Uses the same project secrets as Service Deluxe: RESEND_API_KEY, FROM_EMAIL
//  (+ TRD_APP_PAGE, LEAD_TO optional).
// ============================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL     = Deno.env.get("FROM_EMAIL") ?? "onboarding@resend.dev";
const SUPABASE_URL   = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LEAD_TO        = Deno.env.get("LEAD_TO") ?? "marc@webescapade.com";
const APP_PAGE       = Deno.env.get("TRD_APP_PAGE") ?? "https://webescapade.com/trades/app/";

type P = Record<string, any>;

async function rpc(fn: string, args: P): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${fn} ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const bare = (v: string) => { const m = v.match(/<([^>]+)>/); return (m ? m[1] : v).trim(); };
const deliverable = (a?: string | null) => !!a && /^\S+@\S+\.\S+$/.test(a) && !/\.(example|test|invalid|localhost)$/i.test(a.trim());

let domains: string[] | null = null;
async function sender(): Promise<string> {
  if (!domains) {
    try {
      const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${RESEND_API_KEY}` } });
      const d = await r.json().catch(() => null);
      domains = ((d?.data ?? []) as any[]).filter((x) => x?.status === "verified" && x?.name).map((x) => String(x.name).toLowerCase());
    } catch { domains = []; }
  }
  const conf = bare(FROM_EMAIL), dom = (conf.split("@")[1] || "").toLowerCase();
  if (!domains.length || domains.some((d) => dom === d || dom.endsWith("." + d))) return conf;
  return `bookings@${domains[0]}`;
}
async function send(to: string | null | undefined, subject: string, html: string, fromName: string, replyTo?: string | null) {
  if (!deliverable(to)) return false;
  const body: P = { from: `${fromName.replace(/[<>"]/g, "")} <${await sender()}>`, to, subject, html };
  if (replyTo && deliverable(replyTo)) body.reply_to = replyTo;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) console.error("Resend error", r.status, await r.text());
  return r.ok;
}

/* ---- formatting ---- */
const pad = (n: number) => (n < 10 ? "0" : "") + n;
const t12 = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}${mm ? ":" + pad(mm) : ""}${h >= 12 ? "pm" : "am"}`; };
const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const money = (n: number) => "$" + n.toLocaleString("en-AU", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const when = (p: P) => `${day(p.date)}, ${p.win_from != null ? `arriving between ${t12(p.win_from)} and ${t12(p.win_to)}` : `arriving at ${t12(p.start)}`}`;
const app = (p: P) => String((p.pages && p.pages.app) || APP_PAGE);
const link = (p: P, hash: string) => `${app(p)}?b=${encodeURIComponent(p.slug)}#${hash}`;

function wrap(title: string, inner: string, footer: string) {
  return `<div style="background:#F3F1EC;padding:28px 12px;font-family:Helvetica,Arial,sans-serif;color:#16202B">` +
    `<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px"><tr><td style="padding:28px 26px">` +
    `<div style="font-size:22px;font-weight:700;margin:0 0 14px">${title}</div>${inner}` +
    `<p style="font-size:13px;color:#65707B;margin:22px 0 0">${footer}</p></td></tr></table></div>`;
}
const rows = (r: (string | null | undefined)[][]) => `<table role="presentation" width="100%" style="font-size:14px;border-top:1px solid #E2DED6;border-bottom:1px solid #E2DED6;margin:0 0 16px">` +
  r.filter((x) => x && x[1]).map((x) => `<tr><td style="padding:7px 0;color:#65707B;width:120px;vertical-align:top">${esc(x[0])}</td><td style="padding:7px 0;font-weight:600">${esc(x[1])}</td></tr>`).join("") + `</table>`;
const btn = (href: string, label: string) => `<a href="${href}" style="display:inline-block;background:#E8591A;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700">${label}</a>`;
const para = (t: string) => `<p style="font-size:15px;line-height:1.55;margin:0 0 14px">${t}</p>`;

/* ---- jobs ---- */
async function job(p: P, ev: string) {
  const first = String(p.name || "").trim().split(/\s+/)[0] || "there";
  const where = [p.street, p.suburb].filter(Boolean).join(", ");
  const repeat = p.series_n > 1 ? `${p.series_n} visits, every ${p.repeat_every === 7 ? "week" : p.repeat_every === 14 ? "2 weeks" : "4 weeks"}` : null;
  const info = rows([["Job", p.title], ["When", when(p)], ["Where", where], ["Tradie", p.tech], ["Repeats", repeat], ["Reference", p.ref]]);
  const foot = `${esc(p.venue)}${p.venue_phone ? " · " + esc(p.venue_phone) : ""}${p.venue_email ? " · " + esc(p.venue_email) : ""}`;
  let customer = false, business = false;
  if (ev === "booked") {
    customer = await send(p.email, `Booked: ${p.title} — ${day(p.date)}`, wrap(`You're booked in, ${esc(first)}.`,
      (p.emergency ? para(`<b>Emergency call-out${p.after_hours ? " (after hours)" : ""}.</b> We'll call you shortly to confirm.`) : "") +
      info + para("We'll text you when we're on the way. Need to change or cancel? Use the button below (up to 24 hours before), or call us.") +
      btn(link(p, `cancel=${encodeURIComponent(p.ref)}&t=${p.cancel_token}`), "View or cancel"), foot), p.venue, p.venue_email);
    business = await send(p.venue_email, `${p.emergency ? "🚨 EMERGENCY · " : ""}New job: ${p.title} — ${p.suburb}, ${day(p.date)} ${t12(p.start)}`,
      wrap(p.emergency ? "Emergency job booked" : "New job booked", rows([["Customer", p.name], ["Mobile", p.phone], ["Email", p.email], ["Job", p.title],
        ["When", `${day(p.date)}, ${t12(p.start)} (${p.mins} min on site)`], ["Where", where], ["Tradie", p.tech], ["Repeats", repeat], ["Notes", p.notes], ["Reference", p.ref]]) +
        btn(`${app(p)}?b=${encodeURIComponent(p.slug)}#staff`, "Open the run sheet"), "Trade Deluxe by Webescapade"), "Trade Deluxe", p.email);
  } else {
    customer = await send(p.email, `Cancelled: ${p.title} — ${day(p.date)}`, wrap(`Your booking is cancelled, ${esc(first)}.`,
      info + para("If that wasn't meant to happen, just reply to this email or give us a call.") + btn(`${app(p)}?b=${encodeURIComponent(p.slug)}#book`, "Book another time"), foot),
      p.venue, p.venue_email);
    business = await send(p.venue_email, `Cancelled: ${p.title} — ${p.suburb}, ${day(p.date)}`,
      wrap("Job cancelled", rows([["Customer", p.name], ["Mobile", p.phone], ["Job", p.title], ["Was", `${day(p.date)}, ${t12(p.start)}`], ["Where", where], ["Reference", p.ref]]),
        "Trade Deluxe by Webescapade"), "Trade Deluxe", p.email);
  }
  return { customer, business };
}

/* ---- quotes ---- */
async function quote(p: P, ev: string) {
  const first = String(p.name || "").trim().split(/\s+/)[0] || "there";
  const where = [p.street, p.suburb].filter(Boolean).join(", ");
  const foot = `${esc(p.venue)}${p.venue_phone ? " · " + esc(p.venue_phone) : ""}${p.venue_email ? " · " + esc(p.venue_email) : ""}`;
  if (ev === "quote_request") {
    return { business: await send(p.venue_email, `New quote request: ${p.title} — ${p.suburb || ""}`,
      wrap("New quote request", rows([["Customer", p.name], ["Mobile", p.phone], ["Email", p.email], ["Job", p.title], ["Where", where],
        ["Details", p.description], ["Photos", p.photos ? `${p.photos} attached` : null], ["Reference", p.ref]]) +
        btn(`${app(p)}?b=${encodeURIComponent(p.slug)}#quotes`, "Price it up"), "Trade Deluxe by Webescapade"), "Trade Deluxe", p.email) };
  }
  if (ev === "quote_declined") {
    return { business: await send(p.venue_email, `Quote declined: ${p.title} (${p.ref})`,
      wrap("Quote declined", rows([["Customer", p.name], ["Mobile", p.phone], ["Job", p.title], ["Reference", p.ref]]), "Trade Deluxe by Webescapade"), "Trade Deluxe", p.email) };
  }
  let sub = 0; for (const l of (p.lines || [])) sub += (+l.q || 0) * (+l.u || 0);
  const gst = p.gst ? sub * 0.1 : 0;
  const items = (p.lines || []).filter((l: P) => (+l.q || 0) * (+l.u || 0)).map((l: P) =>
    `<tr><td style="padding:6px 0">${esc(l.d)}${+l.q !== 1 ? ` × ${esc(l.q)}` : ""}</td><td style="padding:6px 0;text-align:right">${money((+l.q || 0) * (+l.u || 0))}</td></tr>`).join("");
  const table = `<table role="presentation" width="100%" style="font-size:14px;margin:0 0 16px">${items}` +
    (p.gst ? `<tr><td style="padding:6px 0;color:#65707B">GST</td><td style="padding:6px 0;text-align:right;color:#65707B">${money(gst)}</td></tr>` : "") +
    `<tr><td style="padding:10px 0;border-top:2px solid #16202B;font-weight:800">Total</td><td style="padding:10px 0;border-top:2px solid #16202B;font-weight:800;text-align:right">${money(sub + gst)}</td></tr></table>`;
  return { customer: await send(p.email, `Your quote from ${p.venue}: ${p.title}`, wrap(`Your quote is ready, ${esc(first)}.`,
    para(`Here's our quote for <b>${esc(p.title)}</b> at ${esc(where)}. It's valid for ${esc(p.valid_days || 30)} days.`) + table +
    (p.note ? para(esc(p.note)) : "") + para("Happy to go ahead? Accept it online and pick a time that suits you.") +
    btn(link(p, `quote=${p.id}&t=${p.token}`), "View quote & book"), foot), p.venue, p.venue_email) };
}

/* ---- sales-page enquiry ---- */
async function lead(p: P) {
  const marc = await send(LEAD_TO, `🧰 Trade Deluxe enquiry — ${p.business}${p.existing ? " (already in CRM)" : ""}`,
    wrap("New Trade Deluxe enquiry", rows([["Name", p.name], ["Business", p.business], ["Email", p.email], ["Mobile", p.phone], ["Trade", p.type],
      ["Base suburb", p.suburb], ["Message", p.message]]) + para("It's in the Venue CRM under <b>Trade</b>."), "Trade Deluxe sales page"), "Trade Deluxe", p.email);
  const first = String(p.name || "").trim().split(/\s+/)[0] || "there";
  const receipt = await send(p.email, "Thanks — we've got your Trade Deluxe enquiry", wrap(`Thanks, ${esc(first)}.`,
    para(`Thanks for your interest in Trade Deluxe for <b>${esc(p.business)}</b>. I'll be in touch shortly to show you how it would work for your business.`) +
    para("Need to add something? Just reply to this email.") + para("Marc<br><span style=\"color:#65707B\">Webescapade · 0413 872 994 · marc@webescapade.com</span>"),
    "Webescapade · Sydney"), "Marc at Webescapade", LEAD_TO);
  return { marc, receipt };
}

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
  try {
    if (!(await rpc("svc_hook_ok", { p_secret: req.headers.get("x-svc-hook") ?? "" }))) return json({ error: "forbidden" }, 401);
    const body = await req.json().catch(() => ({}));
    const ev = String(body.event || ""), id = String(body.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !["booked", "cancelled", "quote_request", "quote_sent", "quote_declined", "lead"].includes(ev)) return json({ error: "bad request" }, 400);
    const p = await rpc("trd_email_payload", { p_event: ev, p_id: id });
    if (!p) return json({ ok: false, error: "not found" });
    if (p.kind === "job") return json({ ok: true, ...(await job(p, ev)) });
    if (p.kind === "quote") return json({ ok: true, ...(await quote(p, ev)) });
    return json({ ok: true, ...(await lead(p)) });
  } catch (e) {
    console.error("trd-email", e);
    return json({ ok: false, error: String(e) }, 200);
  }
});
