// supabase/functions/rd-control/index.ts
//
// Back end for the Restaurant Deluxe Venue CRM and the Email Studio's
// AI co-pilot. One function, guarded by the SAME studio secret as
// resend-send, so Marc's tools share one password.
//
// ---------------------------------------------------------------------------
// DEPLOY
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
//   (STUDIO_SECRET is already set for resend-send — secrets are shared
//    across functions in a project, so nothing else to add)
//   supabase functions deploy rd-control --no-verify-jwt
//
// Optional:
//   supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5-5
//
// URL: https://tehxobdokbvqtwtgqzrh.supabase.co/functions/v1/rd-control
//
// PRIVACY: the AI only ever receives AGGREGATES (counts, trends, venue
// names) and the campaign text being edited. Prospect names, email
// addresses and phone numbers are never sent to the model.
// ---------------------------------------------------------------------------

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-studio-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// --------------------------------------------------------------- database
async function db(path: string, init: RequestInit = {}) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("This function has no Supabase credentials");
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) {
    if (/rd_platform_health|rd_venue_accounts/.test(text) && res.status === 404) {
      throw new Error("The Venue CRM tables are not set up yet — run platform-crm-setup.sql");
    }
    throw new Error(`Database said ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

const STAGES = ["onboarding", "trial", "paying", "at_risk", "paused", "churned"];
const PROSPECT_STATUSES = ["New", "Contacted", "Replied", "Demo booked", "Trial", "Won", "Lost"];

// Supabase returns at most 1000 rows per request, so page through.
async function readAll(path: string, cap = 20000) {
  const out: any[] = [];
  for (let offset = 0; offset < cap; offset += 1000) {
    const rows = await db(`${path}${path.includes("?") ? "&" : "?"}limit=1000&offset=${offset}`);
    if (!Array.isArray(rows)) break;
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function snapshot() {
  const [venues, prospects, campaigns, deliveries, optouts, badDeliveries, badEvents] = await Promise.all([
    db("rpc/rd_platform_health", { method: "POST", body: "{}" }),
    readAll("crm_prospects?select=id,restaurant,name,email,phone,website,suburb,venue_type,priority,crm_status,crm_notes,follow_up_at,crm_updated_at,created_at&order=created_at.desc,id.desc"),
    db("email_marketing_campaigns?select=name,subject,status,sent_at,created_at&order=created_at.desc&limit=12"),
    db(`crm_email_deliveries?select=status,campaign,subject,created_at&created_at=gte.${new Date(Date.now() - 60 * 864e5).toISOString()}&limit=1000`),
    readAll("email_optouts?select=email&order=id.asc"),
    readAll("crm_email_deliveries?select=recipient_email&status=in.(bounced,complained,suppressed)&order=id.asc"),
    readAll("email_events?select=to_email&event_type=in.(email.bounced,email.complained,email.suppressed)&order=id.asc"),
  ]);
  // Addresses that must never be emailed again. Only prospects' own
  // addresses are returned, so restaurant guests' opt-outs never leave the server.
  const bad = new Set<string>([
    ...optouts.map((r: any) => r.email),
    ...badDeliveries.map((r: any) => r.recipient_email),
    ...badEvents.map((r: any) => r.to_email),
  ].filter(Boolean).map((e: string) => String(e).trim().toLowerCase()));
  const blocked = [...new Set(prospects.map((p: any) => String(p.email || "").trim().toLowerCase()))].filter((e) => bad.has(e));
  return { venues: venues || [], prospects, campaigns: campaigns || [], deliveries: deliveries || [], blocked };
}

// Every email in the send log, for the CRM's per-restaurant history and
// campaign results. Browser only — never sent to the AI.
async function emailLog() {
  return await readAll("crm_email_deliveries?select=recipient_email,subject,campaign,status,sent_at,created_at&order=created_at.desc,id.desc", 10000);
}

const EXIT_STATUSES = ["Replied", "Demo booked", "Trial", "Won", "Lost"];
const ACCEPTED = ["sent", "delivered", "opened", "clicked", "delayed"];

// Keeps the pipeline in step with the send log:
//  - New prospects who were emailed become Contacted
//  - a click in the last 14 days adds a note and makes them due for a call today (once per campaign)
//  - bounced, spam-complaint or unsubscribed addresses get a do-not-email note (once)
// Prospects marked Replied, Demo booked, Trial, Won or Lost are left alone.
async function pipelineSync() {
  const [prospects, rows, snap] = await Promise.all([
    readAll("crm_prospects?select=id,email,crm_status,crm_notes,follow_up_at&order=id.asc"),
    emailLog(),
    snapshot(),
  ]);
  const bad = new Set<string>(snap.blocked || []);
  const byEmail = new Map<string, any[]>();
  for (const r of rows) {
    const e = String(r.recipient_email || "").trim().toLowerCase();
    if (!e) continue;
    if (!byEmail.has(e)) byEmail.set(e, []);
    byEmail.get(e)!.push(r);
  }
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short" });
  let contacted = 0, hot = 0, flagged = 0, updated = 0;
  for (const p of prospects) {
    const email = String(p.email || "").trim().toLowerCase();
    const ds = byEmail.get(email);
    if (!email || !ds || !ds.length) continue;
    const status = p.crm_status || "New";
    if (EXIT_STATUSES.includes(status)) continue;
    let notes = String(p.crm_notes || "");
    const patch: any = {};
    if (status === "New" && ds.some((d) => ACCEPTED.includes(d.status))) { patch.crm_status = "Contacted"; contacted++; }
    const clicks = ds.filter((d) => d.status === "clicked" && Date.parse(d.sent_at || d.created_at) > now.getTime() - 14 * 864e5);
    for (const c of clicks) {
      const stamp = `Clicked \u201c${c.subject}\u201d`;
      if (notes.includes(stamp)) continue;
      notes = (notes ? notes + "\n" : "") + `${stamp} (${day.format(new Date(c.sent_at || c.created_at))}) \u2014 call them.`;
      patch.crm_notes = notes;
      if (!p.follow_up_at || Date.parse(p.follow_up_at) > now.getTime()) patch.follow_up_at = now.toISOString();
      hot++;
    }
    const warn = "Email bounced, marked as spam or unsubscribed";
    if (bad.has(email) && !notes.includes(warn)) {
      notes = (notes ? notes + "\n" : "") + `\u26a0 ${warn} \u2014 do not email; call instead.`;
      patch.crm_notes = notes; flagged++;
    }
    if (!Object.keys(patch).length) continue;
    patch.crm_updated_at = now.toISOString();
    await db(`crm_prospects?id=eq.${p.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });
    updated++;
  }
  return { ok: true, updated, contacted, hot, flagged };
}

// ---------------------------------------------------------------- calls
const CALL_LABEL: Record<string, string> = {
  no_answer: "No answer", call_back: "Call back", interested: "Interested",
  demo: "Demo booked", not_interested: "Not interested", note: "Note",
};
const sydDay = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short" });

// One phone call (or note) on a prospect: saved to rd_prospect_calls, and the
// pipeline moves on from it (status, next follow-up date, a dated note).
async function logCall(body: any) {
  const id = String(body.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("No prospect was named");
  const outcome = String(body.outcome || "");
  if (!CALL_LABEL[outcome]) throw new Error("Choose what happened on the call");
  const note = clip(body.note, 1000);
  const rows = await db(`crm_prospects?id=eq.${id}&select=id,crm_status,crm_notes,follow_up_at`);
  const p = rows?.[0];
  if (!p) throw new Error("That prospect no longer exists");
  const now = new Date();
  const inDays = (n: number) => new Date(now.getTime() + n * 864e5).toISOString();
  let next: string | null = null;
  if (body.next_at) { const d = new Date(body.next_at); if (!isNaN(d.getTime())) next = d.toISOString(); }
  const st = p.crm_status || "New";
  const patch: any = { crm_updated_at: now.toISOString() };
  switch (outcome) {
    case "no_answer": patch.follow_up_at = next || inDays(1); if (st === "New") patch.crm_status = "Contacted"; break;
    case "call_back": patch.follow_up_at = next || inDays(2); if (st === "New") patch.crm_status = "Contacted"; break;
    case "interested": patch.follow_up_at = next || inDays(2); if (st === "New" || st === "Contacted") patch.crm_status = "Replied"; break;
    case "demo": patch.follow_up_at = next || inDays(1); if (st !== "Trial" && st !== "Won") patch.crm_status = "Demo booked"; break;
    case "not_interested": patch.follow_up_at = null; patch.crm_status = "Lost"; break;
    case "note": if (next) patch.follow_up_at = next; break;
  }
  patch.crm_notes = (p.crm_notes ? p.crm_notes + "\n" : "") + `\u{1F4DE} ${sydDay.format(now)}: ${CALL_LABEL[outcome]}${note ? " \u2014 " + note : ""}`;
  const call = await db("rd_prospect_calls", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ prospect_id: id, outcome, note, next_at: patch.follow_up_at ?? next ?? null }),
  });
  const up = await db(`crm_prospects?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
  return { ok: true, prospect: up?.[0] || null, call: call?.[0] || null };
}

// --------------------------------------------------------- weekly report
const REPORT_TO = Deno.env.get("REPORT_TO") || "sales@webescapade.com";
const CRM_LINK = "https://webescapade.com/CRM/venue-crm.html";
const h = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

async function resendApi(path: string, init: RequestInit = {}) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch("https://api.resend.com" + path, {
    ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `Resend returned ${res.status}`);
  return data;
}

async function weeklyReport(send: boolean) {
  const [snap, emails, calls, founding] = await Promise.all([
    snapshot(), emailLog(),
    readAll("rd_prospect_calls?select=prospect_id,outcome,created_at&order=created_at.desc", 5000),
    readAll("rd_venue_accounts?select=venue_id&founding=is.true"),
  ]);
  const now = Date.now(), wk = 7 * 864e5;
  const t = (r: any) => Date.parse(r.sent_at || r.created_at) || 0;
  const week = (a: number, b: number) => {
    const rs = emails.filter((r: any) => t(r) >= now - b && t(r) < now - a);
    const c = { sent: rs.length, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
    for (const r of rs) {
      if (["delivered", "opened", "clicked"].includes(r.status)) c.delivered++;
      if (["opened", "clicked"].includes(r.status)) c.opened++;
      if (r.status === "clicked") c.clicked++;
      if (["bounced", "complained", "suppressed"].includes(r.status)) c.bounced++;
    }
    return c;
  };
  const tw = week(0, wk), lw = week(wk, 2 * wk);
  const prospects: any[] = snap.prospects || [];
  const byEmail = new Map(prospects.map((p) => [String(p.email || "").trim().toLowerCase(), p]));
  const open = (p: any) => p && !["Won", "Lost"].includes(p.crm_status || "New");
  const hotMap = new Map<string, any>();
  for (const r of emails) if (r.status === "clicked" && t(r) > now - wk) { const e = String(r.recipient_email).toLowerCase(); if (!hotMap.has(e)) hotMap.set(e, r); }
  const hot = [...hotMap.entries()].map(([e, r]) => ({ p: byEmail.get(e), r })).filter((x) => open(x.p));
  const callsW = calls.filter((c: any) => Date.parse(c.created_at) > now - wk);
  const callsLW = calls.filter((c: any) => { const x = Date.parse(c.created_at); return x > now - 2 * wk && x <= now - wk; });
  const demos = callsW.filter((c: any) => c.outcome === "demo").length;
  const newLeads = prospects.filter((p) => Date.parse(p.created_at) > now - wk);
  const web = newLeads.filter((p) => p.source === "Website enquiry");
  const due = prospects.filter((p) => open(p) && p.follow_up_at && Date.parse(p.follow_up_at) <= now + 864e5)
    .sort((a, b) => Date.parse(a.follow_up_at) - Date.parse(b.follow_up_at));
  const trials = (snap.venues || []).filter((v: any) => v.stage === "trial" && v.trial_ends_on)
    .map((v: any) => ({ v, d: Math.ceil((Date.parse(v.trial_ends_on) - now) / 864e5) })).filter((x: any) => x.d <= 7)
    .sort((a: any, b: any) => a.d - b.d);
  const status: Record<string, number> = {};
  for (const p of prospects) status[p.crm_status || "New"] = (status[p.crm_status || "New"] || 0) + 1;

  const from = new Date(now - wk), range = `${sydDay.format(from)} \u2013 ${sydDay.format(new Date(now))}`;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "\u2014");
  const diff = (a: number, b: number) => (b || a ? (a >= b ? "\u25B2 " : "\u25BC ") + Math.abs(a - b) + " vs last week" : "");
  const F = "Arial,Helvetica,sans-serif";
  const kpi = (label: string, n: number | string, sub: string) =>
    `<td style="width:33%;padding:6px"><div style="border:1px solid #e6e3f3;border-radius:10px;padding:12px;background:#faf9ff"><div style="font:600 10px ${F};letter-spacing:.12em;text-transform:uppercase;color:#7b7699">${h(label)}</div><div style="font:700 24px ${F};color:#1b1730;margin-top:4px">${h(n)}</div><div style="font:12px ${F};color:#6b6788;margin-top:2px">${h(sub)}</div></div></td>`;
  const list = (title: string, rows: string[], empty: string) =>
    `<h3 style="font:700 16px ${F};color:#1b1730;margin:22px 0 8px">${h(title)}</h3>` +
    (rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows.join("")}</table>` : `<p style="font:13px ${F};color:#8a86a3;margin:0">${h(empty)}</p>`);
  const row = (a: string, b: string) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eeecf6;font:14px ${F};color:#1b1730">${a}</td><td style="padding:8px 0;border-bottom:1px solid #eeecf6;font:13px ${F};color:#6b6788;text-align:right">${b}</td></tr>`;
  const phone = (p: any) => (p?.phone ? `<a href="tel:${h(String(p.phone).replace(/[^0-9+]/g, ""))}" style="color:#0f8f7e;text-decoration:none;font-weight:700">${h(p.phone)}</a>` : "no phone");

  const html = `<!doctype html><html><body style="margin:0;background:#f3f2f8"><div style="max-width:640px;margin:0 auto;padding:24px 16px">
  <div style="background:#ffffff;border-radius:14px;padding:24px;border:1px solid #e6e3f3">
  <div style="font:700 11px ${F};letter-spacing:.16em;text-transform:uppercase;color:#7c5cf0">Restaurant Deluxe \u00b7 weekly report</div>
  <h1 style="font:700 24px ${F};color:#1b1730;margin:6px 0 2px">Your week in marketing</h1>
  <div style="font:13px ${F};color:#6b6788">${h(range)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr>
    ${kpi("Emails sent", tw.sent, diff(tw.sent, lw.sent))}${kpi("Opened", tw.opened, pct(tw.opened, tw.delivered) + " of delivered")}${kpi("Clicked", tw.clicked, pct(tw.clicked, tw.delivered) + " of delivered")}
  </tr><tr>
    ${kpi("Calls logged", callsW.length, diff(callsW.length, callsLW.length))}${kpi("Demos booked", demos, "from calls this week")}${kpi("New leads", newLeads.length, web.length + " from the website")}
  </tr></table>
  ${list("\u{1F525} Call these first \u2014 they clicked", hot.slice(0, 10).map((x) => row(`<b>${h(x.p.restaurant || x.p.name || "")}</b><br><span style="font-size:12px;color:#6b6788">clicked \u201c${h(x.r.subject)}\u201d</span>`, phone(x.p))), "Nobody clicked an email this week.")}
  ${list("\u{1F310} New website enquiries", web.slice(0, 10).map((p) => row(`<b>${h(p.restaurant)}</b>${p.name ? " \u00b7 " + h(p.name) : ""}`, phone(p))), "No website enquiries this week.")}
  ${list("\u23F0 Follow-ups due (today and tomorrow)", due.slice(0, 12).map((p) => row(`<b>${h(p.restaurant || p.name || "")}</b> <span style="font-size:12px;color:#6b6788">${h(p.crm_status || "New")}</span>`, phone(p))), "No follow-ups due.")}
  ${trials.length ? list("\u23F3 Trials ending within 7 days", trials.map((x: any) => row(`<b>${h(x.v.name)}</b>`, x.d < 0 ? "ended " + -x.d + " days ago" : x.d === 0 ? "ends today" : "ends in " + x.d + " days")), "") : ""}
  <h3 style="font:700 16px ${F};color:#1b1730;margin:22px 0 8px">Founding 5 and pipeline</h3>
  <p style="font:14px ${F};color:#1b1730;margin:0 0 6px"><b>${founding.length} of 5</b> founding places taken.</p>
  <p style="font:13px ${F};color:#6b6788;margin:0">${["New", "Contacted", "Replied", "Demo booked", "Trial", "Won", "Lost"].map((k) => `${k}: <b style="color:#1b1730">${status[k] || 0}</b>`).join(" \u00b7 ")}</p>
  <div style="margin-top:24px"><a href="${CRM_LINK}" style="display:inline-block;background:#6d4df2;color:#ffffff;font:700 14px ${F};padding:12px 20px;border-radius:10px;text-decoration:none">Open the Venue CRM \u2192</a></div>
  </div><p style="font:11px ${F};color:#9a96b3;text-align:center;margin:14px 0 0">Sent automatically every Monday morning by your Restaurant Deluxe CRM.</p></div></body></html>`;
  const subject = `Your marketing week: ${tw.sent} sent \u00b7 ${tw.clicked} clicked \u00b7 ${hot.length + web.length} to call`;
  if (!send) return { ok: true, subject, html, to: REPORT_TO };
  const domains = await resendApi("/domains");
  const dom = ((domains?.data ?? []) as any[]).find((d) => d?.status === "verified")?.name;
  if (!dom) throw new Error("No verified sending domain in Resend");
  const sent = await resendApi("/emails", { method: "POST", body: JSON.stringify({ from: `Restaurant Deluxe CRM <reports@${dom}>`, to: [REPORT_TO], subject, html }) });
  return { ok: true, subject, to: REPORT_TO, id: sent?.id || null };
}

const EMAIL_RE = /^[^\s@,;()"<>]+@[^\s@,;()"<>]+\.[^\s@,;()"<>]{2,}$/;
const clip = (v: unknown, n = 300) => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, n) : null;
};

// A compact, PII-free picture of the business for the model.
function summarise(s: Awaited<ReturnType<typeof snapshot>>) {
  const today = Date.now();
  const venues = s.venues.map((v: any) => {
    const lastDays = v.last_order_at ? Math.floor((today - Date.parse(v.last_order_at)) / 864e5) : null;
    const trialDaysLeft = v.trial_ends_on ? Math.ceil((Date.parse(v.trial_ends_on) - today) / 864e5) : null;
    const missing: string[] = [];
    if (!v.menu_items) missing.push("menu");
    if (!v.tables) missing.push("table QR codes");
    if (!v.staff) missing.push("staff login");
    if (!v.terms_accepted_at) missing.push("terms accepted");
    if (!v.has_stripe && v.payment_mode !== "counter") missing.push("Stripe");
    return {
      name: v.name,
      stage: v.stage || "unknown",
      plan: v.plan || null,
      trial_days_left: trialDaysLeft,
      days_since_last_order: lastDays,
      orders_this_week: v.orders_7d,
      orders_last_week: v.orders_prev_7d,
      trading_days_last_30: v.trading_days_30d,
      failed_prints_this_week: v.failed_prints_7d,
      setup_missing: missing,
      uses_bookings_or_ordering: { ordering_enabled: v.ordering_enabled, payment_mode: v.payment_mode },
    };
  });
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let overdue = 0;
  for (const p of s.prospects) {
    byStatus[p.crm_status || "New"] = (byStatus[p.crm_status || "New"] || 0) + 1;
    const pr = String(p.priority || "").charAt(0) || "?";
    byPriority[pr] = (byPriority[pr] || 0) + 1;
    if (p.follow_up_at && Date.parse(p.follow_up_at) < today) overdue++;
  }
  const deliv: Record<string, number> = {};
  for (const d of s.deliveries) deliv[d.status] = (deliv[d.status] || 0) + 1;
  return {
    today: new Date().toISOString().slice(0, 10),
    venues,
    prospects: { total: s.prospects.length, by_status: byStatus, by_priority: byPriority, follow_ups_overdue: overdue },
    recent_campaigns: s.campaigns.map((c: any) => ({ name: c.name, subject: c.subject, status: c.status, sent: c.sent_at?.slice(0, 10) || null })),
    email_results_60_days: deliv,
  };
}

// --------------------------------------------------------------------- AI
// Edit FACTS when prices or features change. The model is told these are
// the ONLY facts it may state about the product.
const FACTS = `
PRODUCT: Restaurant Deluxe by Webescapade (Sydney). Built by Marc, a Sydney web designer with 50 years' experience in hospitality, for independent restaurants. Describe Marc only that way: never as a trainer, teacher or assessor.
WHAT IT IS: editable restaurant website + direct online bookings with live availability + guest CRM + optional AI assistant + QR table ordering (kitchen and bar displays, ticket printing, shift records with X/Z readings and Excel export).
TABLE ORDERING: guest scans the table QR, browses the menu in the phone browser (no app, no account), sends the order; food routes to the kitchen, drinks to the bar. Runs alongside the venue's existing POS — it does NOT replace the POS.
PRICES (AUD, per month): Standard $68 (website + bookings); Deluxe $98 (adds CRM, AI assistance, large-booking card guarantees); Complete $149 (adds QR table ordering, kitchen/bar displays, shift records). Table ordering add-on for existing clients $69. Standalone Table Ordering (keep your own website) $109.
DIGITAL WAITLIST (NEW, EARLY ACCESS): included at no extra cost with table ordering plans. Guests scan a QR code at the door, enter a first name and party size (no app, no phone number or email collected) and watch their place in line live on their phone. When staff tap Call, the phone buzzes and asks "Coming?": Yes holds the table, No or no answer within the hold time (default 10 minutes) passes it to the next party. The counter screen shows the queue, which tables are free or have asked for the bill, and suggests the smallest free table that fits each party. Staff can add walk-ins. Describe it as early access: offered to a small group of venues first. It is an OPTIONAL extra in the 14-day free trial: venues ask for it and Webescapade switches it on free for the trial; afterwards it stays included with table ordering plans. Never claim SMS messages.
BOOKINGS + WALK-INS (NEW): online bookings and the waitlist now work together on the front-counter screen. Today's bookings are listed next to the waitlist; staff pick the table(s) for each booking (big parties can get joined tables such as 5 + 6). Booked tables show as "reserved" and stop being offered to walk-ins 90 minutes before the booking; if nobody arrives they free up 20 minutes after the booking time. Staff tap Arrived or No-show; a no-show frees the table straight away for the waitlist. Before staff call a walk-in to a table, the counter warns them if that would leave too few seats for bookings due in the next hour. Guests joining the waitlist can choose to book a time online instead. Lunch bookings are supported (any arrival time in the lunch window). The headline benefit: booked tables are kept for their guests and not offered to walk-ins (staff can still override with a warning), and no-show tables go back to walk-ins fast. Say "helps you avoid giving away a booked table", never "guarantees". Card no-show fees are handled in the booking system (Stripe card guarantee for big bookings), not on the counter.
NO COMMISSION: flat monthly fee only. No commission or percentage on orders or bookings. Lead with this.
TRIAL: 14-day free trial. During the trial Webescapade connects the restaurant to the system at no cost. Loading the menu, photos and add-ons is NOT part of the free trial.
QUICK START SETUP (optional): $150 + GST. Webescapade imports the menu, images and add-ons, plus online training videos (video only). Covers screen ordering with pay at the counter only. Non-refundable once setup has started.
FOUNDING OFFER (first 5 restaurants only): a 28-day free trial instead of 14, with setup done free: Webescapade connects the venue, imports the menu and makes ordering work on the venue's own screens (one tablet or screen in the kitchen, one at the bar, one at the front counter), switches on the digital waitlist and online bookings (working with the waitlist on the front counter), and connects compatible thermal printers the venue already has at no cost. Customers order at the table and pay at the counter; staff can also take orders for guests. NOT included free: paying by phone at the table (can be demonstrated only), a new website build, new printers, any hardware (Webescapade supplies web-based software only, never hardware) and other setup. After the 28 days the ordering setup is already done, so they only pay for extras they add (for example card payments or a new website). After the trial, bookings + ordering + waitlist is the Complete plan at $149/month; ordering + waitlist only is $109/month. Invite them to call Marc on 0413 872 994. Do not invent a deadline or say how many places are left.
SETUP WHEN CHOOSING A PLAN (+ GST, fixed): $400 table ordering (menu, add-ons, kitchen and bar printers and stations); $500 adds card payments; $600 adds website and online bookings. Can be paid in one go or over the first 3 months. Any $150 Quick Start already paid is deducted.
SUPPORT: ongoing support is included in every monthly plan. Setup is NOT free or included beyond the trial connection and the founding offer. Webescapade does not supply hardware.
CAFES: for cafés, lead with Standalone Table Ordering at $109/month (keep their website) and the $400 setup.
CONTACT: Marc, marc@webescapade.com, 0413 872 994.
`;

const RULES = `
You write marketing email copy for Restaurant Deluxe, sent business-to-business to restaurant owners and managers in Australia.
RULES — follow all of them:
- Australian English spelling (organise, colour, centre).
- Use ONLY the facts supplied. Never invent statistics, percentages, customer counts, testimonials, awards, discounts, deadlines, prices or features.
- Never say setup is free or included, except the free trial connection. State the Quick Start, founding offer and $400/$500/$600 + GST setup exactly as in FACTS when setup is mentioned. Mention one plan and one setup figure per email, not the whole price list.
- Never claim it replaces a POS. Never claim it "prevents" no-shows or overbooking — "reduces" or "helps with" only.
- Do not use spammy wording (FREE!!!, act now, guaranteed, 100%, risk-free) or ALL CAPS sentences.
- Subject lines under 50 characters, no emoji unless asked. Preheaders under 90 characters.
- Plain, warm, practical tone — from one hospitality person to another. Short sentences.
- Do not write links, URLs, phone numbers or unsubscribe text — the studio adds those.
- Respond with ONLY valid JSON matching the requested shape. No commentary, no code fences.
`;

async function claude(system: string, user: string, maxTokens = 2500) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set on this function — add it in Supabase › Edge Functions › Secrets");
  const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || `Claude API returned ${res.status}`;
    throw new Error(`AI: ${msg}`);
  }
  const text = (data?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  return parseJson(text);
}

function parseJson(text: string) {
  let t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.search(/[\[{]/);
  const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* fall through */ }
  }
  throw new Error("The AI reply could not be read. Try again.");
}

// Fields of a studio campaign the AI is allowed to fill.
const COPY_FIELDS = [
  "subject", "preheader", "badge", "eyebrow", "headline", "intro",
  "cta1", "cta2", "featEyebrow", "featHeading", "featSub",
  "spotEyebrow", "spotHeading", "spotSub",
  "finalHeading", "finalSub", "finalCta",
];

function copyOnly(c: any) {
  const out: any = {};
  for (const k of COPY_FIELDS) if (c && c[k] != null) out[k] = String(c[k]).slice(0, 1200);
  if (Array.isArray(c?.cards)) out.cards = c.cards.slice(0, 6).map((x: any) => ({ n: x.n, t: x.t, d: x.d }));
  if (Array.isArray(c?.boxes)) out.boxes = c.boxes.slice(0, 4).map((x: any) => ({ l: x.l, v: x.v }));
  out.spotOn = !!c?.spotOn;
  return out;
}

// ------------------------------------------------------------------ server
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Body was not valid JSON" }, 400); }
  const action = String(body.action || "");

  // The Monday job (pg_cron) can only ask for the weekly report, with its own key from Vault.
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey && action === "weekly_report") {
    try {
      const ok = await db("rpc/rd_cron_key_ok", { method: "POST", body: JSON.stringify({ p_key: cronKey }) });
      if (ok !== true) return json({ error: "Wrong cron key" }, 401);
      return json(await weeklyReport(true));
    } catch (e) { console.error("weekly report failed", e); return json({ error: (e as Error).message }, 502); }
  }

  const expected = Deno.env.get("STUDIO_SECRET");
  if (!expected) return json({ error: "STUDIO_SECRET is not set on this function" }, 500);
  if (req.headers.get("x-studio-secret") !== expected) return json({ error: "Wrong studio secret" }, 401);

  try {
    switch (action) {
      case "ping":
        return json({ ok: true, ai: !!Deno.env.get("ANTHROPIC_API_KEY") });

      // Proves the Claude key works, with a tiny request.
      case "ai_ping": {
        const out = await claude("Respond with ONLY valid JSON.", 'Return {"ok":true}', 50);
        return json({ ok: true, ai: !!out?.ok, model: Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5" });
      }

      // ---------------------------------------------------------- data
      case "snapshot": {
        const [snap, emails, calls, founding] = await Promise.all([
          snapshot(),
          body.withEmails ? emailLog() : Promise.resolve(undefined),
          body.withEmails ? readAll("rd_prospect_calls?select=prospect_id,outcome,note,next_at,created_at&order=created_at.desc", 5000) : Promise.resolve(undefined),
          body.withEmails ? readAll("rd_venue_accounts?select=venue_id&founding=is.true") : Promise.resolve(undefined),
        ]);
        return json({ ok: true, ...snap, ...(emails ? { emails, calls, founding: (founding || []).map((r: any) => r.venue_id) } : {}),
          stages: STAGES, prospectStatuses: PROSPECT_STATUSES });
      }

      case "call_log":
        return json(await logCall(body));

      case "report_preview":
        return json(await weeklyReport(false));

      case "report_send":
        return json(await weeklyReport(true));

      case "pipeline_sync":
        return json(await pipelineSync());

      // Rows from an Excel/CSV sheet, already mapped to our columns by the studio.
      case "prospects_import": {
        const rows = Array.isArray(body.rows) ? body.rows : [];
        if (!rows.length) return json({ error: "No rows were sent" }, 400);
        if (rows.length > 1000) return json({ error: "Send at most 1000 rows at a time" }, 400);
        const fileName = clip(body.fileName, 200);
        const source = clip(body.source, 120) || ("Excel import" + (fileName ? " · " + fileName : ""));
        const update = body.updateExisting === true;
        const seen = new Set<string>();
        let invalid = 0, dupInFile = 0;
        const clean: any[] = [];
        for (const r of rows) {
          const email = String(r?.email || "").trim().toLowerCase();
          if (!EMAIL_RE.test(email)) { invalid++; continue; }
          if (seen.has(email)) { dupInFile++; continue; }
          seen.add(email);
          clean.push({
            email,
            restaurant: clip(r.restaurant, 200) || clip(r.name, 200) || email.split("@")[1],
            name: clip(r.name, 200) || "Restaurant team",
            phone: clip(r.phone, 60) || "",
            website: clip(r.website, 300),
            suburb: clip(r.suburb, 120),
            venue_type: clip(r.venue_type, 120),
            priority: clip(r.priority, 40),
            why_it_fits: clip(r.notes, 1000),
            source,
            import_file_name: fileName,
          });
        }
        if (!clean.length) return json({ ok: true, added: 0, updated: 0, existing: 0, invalid, dupInFile });
        // Which of these are already saved?
        const existing = new Set<string>();
        for (let i = 0; i < clean.length; i += 150) {
          const list = clean.slice(i, i + 150).map((r) => `"${r.email.replace(/"/g, "")}"`).join(",");
          const found = await db(`crm_prospects?select=email_normalized&email_normalized=in.(${encodeURIComponent(list)})`);
          (found || []).forEach((f: any) => existing.add(f.email_normalized));
        }
        const fresh = clean.filter((r) => !existing.has(r.email));
        if (fresh.length) {
          await db("crm_prospects?on_conflict=email_normalized", {
            method: "POST",
            headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
            body: JSON.stringify(fresh),
          });
        }
        let updated = 0;
        if (update) {
          // Fill in details for people already saved, without touching their
          // pipeline status, notes or follow-up date. Blank cells change nothing.
          for (const r of clean.filter((x) => existing.has(x.email))) {
            const patch: any = {};
            for (const k of ["restaurant", "phone", "website", "suburb", "venue_type", "priority"]) if (r[k]) patch[k] = r[k];
            if (r.name && r.name !== "Restaurant team") patch.name = r.name;
            if (!Object.keys(patch).length) continue;
            await db(`crm_prospects?email_normalized=eq.${encodeURIComponent(r.email)}`, {
              method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch),
            });
            updated++;
          }
        }
        return json({ ok: true, added: fresh.length, updated, existing: existing.size, invalid, dupInFile });
      }

      case "prospect_update": {
        const id = String(body.id || "");
        if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "No prospect was named" }, 400);
        const patch: any = { crm_updated_at: new Date().toISOString() };
        if (body.crm_status !== undefined) {
          if (!PROSPECT_STATUSES.includes(body.crm_status)) return json({ error: "Unknown status" }, 400);
          patch.crm_status = body.crm_status;
        }
        if (body.follow_up_at !== undefined) patch.follow_up_at = body.follow_up_at || null;
        if (body.crm_notes !== undefined) patch.crm_notes = String(body.crm_notes || "").slice(0, 5000);
        const rows = await db(`crm_prospects?id=eq.${id}`, {
          method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch),
        });
        return json({ ok: true, prospect: rows?.[0] || null });
      }

      case "account_save": {
        const id = String(body.venue_id || "");
        if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "No venue was named" }, 400);
        const f = body.fields || {};
        if (f.stage && !STAGES.includes(f.stage)) return json({ error: "Unknown stage" }, 400);
        const row: any = { venue_id: id, updated_at: new Date().toISOString() };
        for (const k of ["stage", "plan", "contact_name", "contact_email", "contact_phone", "notes"]) {
          if (f[k] !== undefined) row[k] = f[k] === "" ? null : String(f[k]).slice(0, 5000);
        }
        for (const k of ["monthly_fee", "setup_fee"]) {
          if (f[k] !== undefined) row[k] = f[k] === "" || f[k] == null ? null : Number(f[k]);
        }
        for (const k of ["trial_ends_on", "started_on"]) {
          if (f[k] !== undefined) row[k] = f[k] || null;
        }
        if (f.founding !== undefined) row.founding = f.founding === true || f.founding === "true";
        const rows = await db("rd_venue_accounts?on_conflict=venue_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(row),
        });
        return json({ ok: true, account: rows?.[0] || null });
      }

      // ------------------------------------------------------------ AI
      case "ai_ideas": {
        const s = summarise(await snapshot());
        const focus = String(body.focus || "").slice(0, 500);
        const out = await claude(
          RULES + "\nFACTS:\n" + FACTS,
          `Here is the current state of the business (JSON):\n${JSON.stringify(s)}\n\n` +
          (focus ? `Marc's focus right now: ${focus}\n\n` : "") +
          `Suggest 4 email campaigns Marc could send in the next two weeks, most valuable first. ` +
          `Base each one on something specific in the data (a trial ending, a venue gone quiet, a drop in orders, prospects never contacted, a setup step missing, a past campaign to follow up). ` +
          `Name the venue(s) or group it is for. Keep it honest — if the data is thin, say so in "why".\n\n` +
          `Return JSON: {"ideas":[{"title":"","why":"one or two sentences citing the data","audience":"who receives it","segment":"one of: prospects_new | prospects_priority_a | prospects_followup | trial_venues | quiet_venues | paying_venues | all_venues","goal":"","angle":"the hook in one line","subject":"","preheader":"","base":"one of: Founding 5 — 28-day free trial | Intro to Restaurant Deluxe | Cafés: order at the table | Digital waitlist — early access | Table ordering launch | 14-day free trial invite | Standalone ordering ($109) | Add-on for existing clients ($69) | Booking demo follow-up | Already take bookings? One screen"}]}`,
          3000,
        );
        return json({ ok: true, ideas: out.ideas || [], snapshotSummary: s });
      }

      case "ai_draft": {
        const brief = String(body.brief || "").slice(0, 2000);
        if (!brief) return json({ error: "Describe what the email should do first" }, 400);
        const base = copyOnly(body.campaign || {});
        const out = await claude(
          RULES + "\nFACTS:\n" + FACTS,
          `Rewrite this email campaign to match the brief. Keep the same JSON keys as the starting campaign (you may change any value, add or remove cards — 3 cards is ideal — and turn the spotlight on or off with spotOn). ` +
          `Card "n" is a two-digit number like "01". Card "d" is one short sentence. "intro" may contain a blank line between paragraphs.\n\n` +
          `BRIEF: ${brief}\n` +
          (body.audience ? `AUDIENCE: ${String(body.audience).slice(0, 300)}\n` : "") +
          `\nSTARTING CAMPAIGN (JSON):\n${JSON.stringify(base)}\n\n` +
          `Return JSON: {"campaign":{...same keys...},"notes":"one sentence on what you changed and why"}`,
          3500,
        );
        return json({ ok: true, campaign: copyOnly(out.campaign || {}), notes: out.notes || "" });
      }

      case "ai_rewrite": {
        const text = String(body.text || "").slice(0, 3000);
        const instruction = String(body.instruction || "Make it clearer and warmer").slice(0, 300);
        const field = String(body.field || "text");
        if (!text.trim()) return json({ error: "That field is empty" }, 400);
        const out = await claude(
          RULES + "\nFACTS:\n" + FACTS,
          `Field: ${field}\nInstruction: ${instruction}\nOriginal:\n${text}\n\n` +
          `Give 3 alternative versions. Respect length limits for the field (subject < 50 chars, preheader < 90, headline < 80). ` +
          `Return JSON: {"options":["","",""]}`,
          1200,
        );
        return json({ ok: true, options: (out.options || []).slice(0, 3).map(String) });
      }

      case "ai_subjects": {
        const base = copyOnly(body.campaign || {});
        const out = await claude(
          RULES + "\nFACTS:\n" + FACTS,
          `Campaign (JSON): ${JSON.stringify(base)}\n\nWrite 6 subject lines with matching preheaders, each a different approach (curious, direct benefit, question, personal from Marc, practical, timely). ` +
          `Return JSON: {"subjects":[{"subject":"","preheader":"","approach":""}]}`,
          1200,
        );
        return json({ ok: true, subjects: (out.subjects || []).slice(0, 6) });
      }

      case "ai_check": {
        const base = copyOnly(body.campaign || {});
        const plans = Array.isArray(body.campaign?.plans) ? body.campaign.plans.map((p: any) => ({ tier: p.tier, price: p.price, desc: p.desc })) : [];
        const out = await claude(
          RULES + "\nFACTS:\n" + FACTS,
          `Review this campaign before it is sent. Check every claim and price against FACTS, and flag: anything not supported by FACTS, wrong prices, POS-replacement claims, "prevent" claims, spam-trigger wording, subject/preheader too long, unclear call to action, American spelling. ` +
          `If it is fine, say so.\n\nCampaign: ${JSON.stringify({ ...base, plans })}\n\n` +
          `Return JSON: {"verdict":"ready | fix first","issues":[{"field":"","problem":"","suggestion":""}]}`,
          1500,
        );
        return json({ ok: true, verdict: out.verdict || "", issues: out.issues || [] });
      }

      default:
        return json({ error: `Unknown action "${action}"` }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message || "Something went wrong" }, 502);
  }
});
