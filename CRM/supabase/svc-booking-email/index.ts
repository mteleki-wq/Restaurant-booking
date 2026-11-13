// ============================================================
//  svc-booking-email  —  Supabase Edge Function (Service Deluxe)
// ============================================================
//  Replaces the n8n workflows. Called by the database only:
//    • trigger svc_appt_email  → {event:"confirmed"|"cancelled", ref}
//    • cron job svc-reminders  → {event:"reminders"}  (daily)
//    • svc_lead_submit / rd_lead_submit → {event:"lead", id}
//      (sales-page enquiry: Service Deluxe or Restaurant Deluxe, by lead.product)
//  Every call must carry the x-svc-hook secret kept in the vault.
//
//  The function never trusts the request body for recipients: it
//  looks the booking up by its reference, checks its real status,
//  and claims the email first so nothing is ever sent twice.
//
//  Uses the SAME project secrets as the restaurant emails:
//    RESEND_API_KEY, FROM_EMAIL   (+ SVC_BOOKING_PAGE, LEAD_TO optional)
// ============================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL     = Deno.env.get("FROM_EMAIL") ?? "onboarding@resend.dev";
const SUPABASE_URL   = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LEAD_TO        = Deno.env.get("LEAD_TO") ?? "marc@webescapade.com";
const BOOKING_PAGE   = Deno.env.get("SVC_BOOKING_PAGE") ?? "https://webescapade.com/service/service-booking.html";

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
// reserved test domains can never receive mail — skip instead of bouncing
const deliverable = (a?: string | null) => !!a && /^\S+@\S+\.\S+$/.test(a) && !/\.(example|test|invalid|localhost)$/i.test(a.trim());

/* ---- sender on a verified Resend domain (same logic as the restaurant function) ---- */
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
async function send(to: string, subject: string, html: string, fromName: string, replyTo?: string | null) {
  const body: P = { from: `${fromName} <${await sender()}>`, to, subject, html };
  if (replyTo) body.reply_to = replyTo;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) console.error("Resend error", r.status, await r.text());
  return r.ok;
}

/* ---- templates ---- */
function clientHtml(p: P, kind: string) {
  const first = String(p.client_name || "").trim().split(/\s+/)[0] || "there";
  const manage = `${BOOKING_PAGE}?venue=${encodeURIComponent(p.venue_slug)}&ref=${encodeURIComponent(p.ref)}&t=${p.cancel_token}`;
  const again = `${BOOKING_PAGE}?venue=${encodeURIComponent(p.venue_slug)}`;
  const title = ({ confirmed: `You're booked in, ${esc(first)}.`, cancelled: `Your booking is cancelled, ${esc(first)}.`, reminder: `See you tomorrow, ${esc(first)}.` } as P)[kind];
  const word = String(p.service_word || "service"); const Word = word.charAt(0).toUpperCase() + word.slice(1);
  const rows = [[Word, p.service], p.provider ? ["With", p.provider] : null, ["When", `${p.local_date} at ${p.local_time}`],
    ["Length", `${p.duration_min} min`], ["Reference", p.ref]].filter(Boolean)
    .map((r: any) => `<tr><td style="padding:7px 0;color:#6B746F;width:110px">${r[0]}</td><td style="padding:7px 0;font-weight:600">${esc(r[1])}</td></tr>`).join("");
  const btn = (href: string, label: string) => `<a href="${href}" style="display:inline-block;background:#1E2622;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">${label}</a>`;
  return `<div style="background:#F5F2EC;padding:28px 12px;font-family:Helvetica,Arial,sans-serif;color:#1E2622">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px"><tr><td style="padding:30px 28px">
<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#6B746F">${esc(p.venue)}</div>
<h1 style="font-family:Georgia,serif;font-weight:400;font-size:30px;line-height:1.15;margin:10px 0 18px">${title}</h1>
<table role="presentation" width="100%" style="font-size:15px;border-top:1px solid #E4DED4;border-bottom:1px solid #E4DED4;margin:0 0 22px">${rows}</table>
${kind === "cancelled" ? `<p style="font-size:15px;line-height:1.5;margin:0 0 20px">We hope to see you another time.</p>${btn(again, "Make a new booking")}`
  : `<p style="font-size:15px;line-height:1.5;margin:0 0 20px">${p.booking_note ? esc(p.booking_note) + " " : ""}Need to change something? Use the button below or call us.</p>${btn(manage, "View or cancel booking")}`}
<p style="font-size:13px;color:#6B746F;margin:24px 0 0">${esc(p.venue)}${p.venue_phone ? " · " + esc(p.venue_phone) : ""}${p.venue_email ? " · " + esc(p.venue_email) : ""}</p>
</td></tr></table></div>`;
}
function staffHtml(p: P, kind: string) {
  return `<div style="font-family:-apple-system,Helvetica,sans-serif;font-size:14px;color:#1E2622">
<h2 style="margin:0 0 10px">${kind === "confirmed" ? "New booking" : "Booking cancelled"} — ${esc(p.venue)}</h2>
<p><b>${esc(p.client_name)}</b> · ${esc(p.service)}${p.provider ? " with " + esc(p.provider) : ""}<br>${esc(p.local_date)} at ${esc(p.local_time)} (${esc(p.duration_min)} min)<br>Ref ${esc(p.ref)}</p>
<p>Phone: ${esc(p.client_phone || "—")}<br>Email: ${esc(p.client_email || "—")}</p></div>`;
}
const SUBJ: P = { confirmed: "Your booking is confirmed", cancelled: "Your booking has been cancelled", reminder: "Reminder: your appointment tomorrow" };

/* ---- one booking, one kind of email ---- */
async function handle(ref: string, kind: "confirmed" | "cancelled" | "reminder") {
  if (!(await rpc("svc_claim_email", { p_ref: ref, p_kind: kind }))) return { ref, kind, skipped: "already sent or status changed" };
  try {
    const p = await rpc("svc_email_payload", { p_ref: ref });
    if (!p?.ok) return { ref, kind, skipped: "not found" };
    const out: P = { ref, kind };
    const subject = `${SUBJ[kind]} · ${p.service}, ${p.local_date} ${p.local_time}`;
    if (deliverable(p.client_email)) {
      out.client = await send(p.client_email, subject, clientHtml(p, kind), p.venue, p.venue_email);
      if (!out.client) { await rpc("svc_release_email", { p_ref: ref, p_kind: kind }); return out; }
    } else out.client = "no email";
    if (kind !== "reminder") {
      const staffTo = [p.venue_email, p.provider_email].filter(deliverable);
      for (const to of [...new Set(staffTo)]) {
        await send(to, `${kind === "confirmed" ? "New booking" : "Cancelled"}: ${p.client_name} — ${p.service}, ${p.local_date} ${p.local_time}`,
          staffHtml(p, kind), p.venue, p.client_email);
      }
      out.staff = staffTo.length;
    }
    return out;
  } catch (e) {
    await rpc("svc_release_email", { p_ref: ref, p_kind: kind }).catch(() => {});
    throw e;
  }
}

/* ---- new website enquiry from a sales page (Service Deluxe or Restaurant Deluxe) ---- */
async function lead(id: string) {
  const p = await rpc("svc_lead_payload", { p_id: id });
  if (!p?.ok) return { lead: id, skipped: "not found" };
  const R = p.product === "restaurant";
  const LABEL = R ? "Restaurant Deluxe" : "Service Deluxe";
  const msg = String(p.message ?? p.notes ?? "").trim();
  const rowsOf = (list: any[][], label: string) => list.filter((r) => r[1])
    .map((r) => `<tr><td style="padding:6px 14px 6px 0;color:#6B746F;width:${label}">${r[0]}</td><td style="padding:6px 0;font-weight:600">${esc(r[1])}</td></tr>`).join("");
  const rows = rowsOf([["Name", p.name], [R ? "Restaurant" : "Business", p.business], ["Type", p.type], ["Area", p.suburb], ["Email", p.email], ["Phone", p.phone]], "90px");
  const quote = (t: string) => `<div style="white-space:pre-wrap;background:#F5F2EC;border-radius:12px;padding:14px 16px;font-size:15px;line-height:1.5">${esc(t)}</div>`;
  const when = new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const crm = R ? "https://webescapade.com/CRM/venue-crm.html" : "https://webescapade.com/CRM/";

  const toMarc = await send(LEAD_TO, `New ${LABEL} enquiry: ${p.business || p.name}`,
    `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#1E2622;max-width:620px"><h2 style="margin:0 0 4px">New enquiry from the ${LABEL} page</h2>` +
    `<p style="margin:0 0 14px;color:#6B746F">${esc(when)}</p><table>${rows}</table>` +
    `<h3 style="margin:18px 0 8px;font-size:15px">Their message</h3>${msg ? quote(msg) : `<p style="color:#6B746F"><i>No message added.</i></p>`}` +
    `<p style="margin:18px 0 0">${p.existing ? "This email address was already in your CRM, so the enquiry was added to that contact's notes and set for a call today." : `It is in your CRM as a new ${LABEL} prospect, due for a call today.`} ` +
    `<a href="${crm}">Open the CRM</a> · just reply to this email to answer them.</p></div>`,
    "Webescapade website", p.email);

  let receipt: boolean | string = "skipped";
  if (deliverable(p.email)) {
    const first = String(p.name || "").trim().split(/\s+/)[0] || "there";
    const mine = rowsOf([["Name", p.name], [R ? "Restaurant" : "Business", p.business], ["Type", p.type], ["Area", p.suburb], ["Phone", p.phone], ["Email", p.email]], "100px");
    const btn = (href: string, label: string, dark: boolean) => `<a href="${href}" style="display:inline-block;margin:0 8px 8px 0;background:${dark ? "#1E2622" : "#ffffff"};color:${dark ? "#ffffff" : "#1E2622"};border:1px solid #1E2622;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:600;font-size:14px">${label}</a>`;
    const about = R ? `Restaurant Deluxe for ${esc(p.business || "your restaurant")}` : `online bookings for ${esc(p.business || "your business")}`;
    const wait = R
      ? `While you wait, watch the 2-minute tour, or pick a time for a free Zoom demo and I'll show you everything working.`
      : `While you wait, you can try it for yourself — setting up takes a few minutes and it's free for 14 days.`;
    const buttons = R
      ? btn("https://webescapade.com/Restaurant/demo.html", "Book a Zoom demo", true) + btn("https://youtu.be/FE4Zdnh7T-U", "Watch the 2-minute tour", false)
      : btn("https://webescapade.com/service/service-booking.html?venue=serenity-spa", "Try a booking", true) + btn("https://webescapade.com/service/tour/", "Watch the videos", false);
    receipt = await send(p.email, `We've received your enquiry — ${LABEL}`,
      `<div style="background:#F5F2EC;padding:28px 12px;font-family:Helvetica,Arial,sans-serif;color:#1E2622"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px"><tr><td style="padding:30px 28px">` +
      `<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#6B746F">${LABEL} · Enquiry received</div>` +
      `<h1 style="font-family:Georgia,serif;font-weight:400;font-size:30px;line-height:1.15;margin:10px 0 14px">Thanks, ${esc(first)} — we've got it.</h1>` +
      `<p style="font-size:15px;line-height:1.55;margin:0 0 18px">This is your receipt. Your enquiry about ${about} reached us on ${esc(when)}. I'll be in touch shortly, usually within one business day.</p>` +
      `<table role="presentation" width="100%" style="font-size:14px;border-top:1px solid #E4DED4;border-bottom:1px solid #E4DED4;margin:0 0 16px">${mine}</table>` +
      (msg ? `<div style="font-size:13px;color:#6B746F;margin:0 0 6px">Your message</div>${quote(msg)}` : "") +
      `<p style="font-size:15px;line-height:1.55;margin:20px 0 14px">${wait}</p>` +
      buttons +
      `<p style="font-size:15px;line-height:1.55;margin:18px 0 0">Need to add something? Just reply to this email.</p>` +
      `<p style="font-size:15px;line-height:1.55;margin:18px 0 0">Marc<br><span style="color:#6B746F">Webescapade · 0413 872 994 · marc@webescapade.com</span></p></td></tr></table></div>`,
      "Marc at Webescapade", LEAD_TO);
  }
  return { lead: id, product: R ? "restaurant" : "service", marc: toMarc, receipt };
}

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
  try {
    if (!(await rpc("svc_hook_ok", { p_secret: req.headers.get("x-svc-hook") ?? "" }))) return json({ error: "forbidden" }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.event === "reminders") {
      const due = (await rpc("svc_due_reminders", {})) as P[];
      const results = [];
      for (const d of due || []) results.push(await handle(d.ref, "reminder").catch((e) => ({ ref: d.ref, error: String(e) })));
      return json({ ok: true, reminders: results.length, results });
    }
    if (body.event === "lead") {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.id || ""))) return json({ error: "bad request" }, 400);
      return json({ ok: true, ...(await lead(String(body.id))) });
    }
    const ref = String(body.ref || "").trim().toUpperCase();
    if (!/^AP-\d{8}-[0-9A-F]{5}$/.test(ref) || !["confirmed", "cancelled"].includes(body.event)) return json({ error: "bad request" }, 400);
    return json({ ok: true, ...(await handle(ref, body.event)) });
  } catch (e) {
    console.error("svc-booking-email", e);
    return json({ ok: false, error: String(e) }, 200);   // 200 so nothing retries a bad call forever
  }
});
