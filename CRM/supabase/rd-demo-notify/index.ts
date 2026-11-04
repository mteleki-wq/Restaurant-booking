// rd-demo-notify — called by the database (via pg_net) for demo bookings made on
// webescapade.com/Restaurant/demo.html, and when Marc confirms or declines a visit.
//
// body: { id, kind }   kind = booked | requested | confirmed | declined   (default booked)
//   booked     video/phone booked: confirmation (+ Zoom link for video) + .ics to the restaurant, alert to Marc
//   requested  visit requested: "request received" to the restaurant, alert to Marc to confirm in the CRM
//   confirmed  Marc confirmed the visit: confirmation + .ics to the restaurant
//   declined   Marc offered a video call instead: friendly email with a link to book a Zoom demo
//
// Authorised with the Vault key checked by public.rd_cron_key_ok().

const SB = Deno.env.get("SUPABASE_URL") ?? "";
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const REPORT_TO = Deno.env.get("REPORT_TO") || "sales@webescapade.com";
const PHONE = "0413 872 994";
const DEMO_PAGE = "https://webescapade.com/Restaurant/demo.html";
const CRM_PAGE = "https://webescapade.com/CRM/venue-crm.html";

const h = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`db ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
async function resend(path: string, body?: unknown) {
  const r = await fetch("https://api.resend.com" + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.message || `Resend ${r.status}`);
  return d;
}

const MODE: Record<string, string> = { phone: "Phone call", video: "Zoom video call", visit: "Visit at your restaurant" };
const when = (iso: string) => new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const length = (m: number) => (m >= 60 ? (m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : m === 60 ? "1 hour" : `${m / 60} hours`) : `${m} minutes`);
const zoomId = (u: string) => { const m = /\/j\/(\d{9,11})/.exec(u || ""); return m ? m[1].replace(/(\d{3})(\d{3})(\d+)/, "$1 $2 $3") : ""; };

function ics(b: any, zoom: string) {
  const s = new Date(b.start_at), e = new Date(s.getTime() + (b.minutes || 30) * 60000);
  const desc = b.mode === "video" ? (zoom ? `Join the Zoom call: ${zoom}` : "Marc will email you a video link before the call")
    : b.mode === "phone" ? "Marc will call you on " + (b.phone || "your number")
    : "Marc will come to " + b.restaurant;
  const loc = b.mode === "video" ? zoom : b.mode === "visit" ? (b.address || b.restaurant) : "Phone call";
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Webescapade//Restaurant Deluxe demo//EN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${b.id}@webescapade.com`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(s)}`, `DTEND:${icsDate(e)}`,
    `SUMMARY:${icsText(`Restaurant Deluxe demo with Marc (${MODE[b.mode] || ""})`)}`,
    `DESCRIPTION:${icsText(`${desc}. Questions: ${PHONE}`)}`,
    ...(loc ? [`LOCATION:${icsText(loc)}`] : []),
    ...(b.mode === "video" && zoom ? [`URL:${zoom}`] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  const bytes = new TextEncoder().encode(lines.join("\r\n"));
  let bin = ""; bytes.forEach((x) => (bin += String.fromCharCode(x)));
  return btoa(bin);
}

const F = "Arial,Helvetica,sans-serif";
const wrap = (inner: string) => `<div style="font-family:${F};max-width:560px;margin:0 auto;color:#1b1730">${inner}
  <p style="font-size:15px">See you soon,<br>Marc<br><span style="color:#6b6788">Webescapade · Restaurant Deluxe · ${PHONE}</span></p></div>`;
const button = (href: string, label: string, bg = "#2D8CFF") =>
  `<p style="margin:18px 0"><a href="${h(href)}" style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 22px;border-radius:999px">${h(label)}</a></p>`;
const row = (k: string, v: string) => `<tr><td style="padding:6px 14px 6px 0;color:#6b6788;vertical-align:top">${k}</td><td>${v}</td></tr>`;

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Use POST", { status: 405 });
    const key = req.headers.get("x-cron-key") || "";
    const ok = await db("rpc/rd_cron_key_ok", { method: "POST", body: JSON.stringify({ p_key: key }) });
    if (ok !== true) return new Response("unauthorised", { status: 401 });
    const body = await req.json();
    const id = String(body?.id || "");
    const kind = ["booked", "requested", "confirmed", "declined"].includes(body?.kind) ? body.kind : "booked";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("bad id", { status: 400 });
    const b = (await db(`rd_demo_bookings?id=eq.${id}&select=*`))?.[0];
    if (!b) return new Response("not found", { status: 404 });
    const set = (await db("rd_demo_settings?id=eq.1&select=zoom_url"))?.[0] || {};
    const zoom = String(set.zoom_url || "");

    const doms = await resend("/domains");
    const dom = ((doms?.data ?? []) as any[]).find((d) => d?.status === "verified")?.name || "webescapade.com";
    const from = `Marc · Restaurant Deluxe <marc@${dom}>`;
    const crmFrom = `Restaurant Deluxe CRM <reports@${dom}>`;
    const W = h(when(b.start_at)), L = h(length(b.minutes || 30));
    const videoLink = `${DEMO_PAGE}?r=${encodeURIComponent(b.restaurant || "")}&e=${encodeURIComponent(b.email || "")}&n=${encodeURIComponent(b.name || "")}&m=video`;
    const details = `<table style="font-size:15px;border-collapse:collapse;margin:14px 0">${row("When", `<b>${W}</b> (Sydney time, about ${L})`)}${row("How", h(MODE[b.mode]))}${b.mode === "visit" && b.address ? row("Where", h(b.address)) : ""}</table>`;
    const show = "I’ll show you bookings, the digital waitlist and ordering at the table, working together on the tablets you already have.";

    // ------------------------------------------------ to the restaurant
    let subject = "", html = "", attach = false;
    if (kind === "booked" || kind === "confirmed") {
      attach = true;
      subject = `Your Restaurant Deluxe demo — ${when(b.start_at)}`;
      let how = "";
      if (b.mode === "video") {
        how = zoom
          ? `<p style="font-size:15px">We’ll meet on <b>Zoom</b>. At the time, just tap the button — it opens in your browser or the Zoom app, no account needed. A computer or tablet shows my screen best.</p>
             ${button(zoom, "Join the Zoom call")}
             <p style="font-size:13px;color:#6b6788;margin-top:-6px">${zoomId(zoom) ? `Meeting ID: ${h(zoomId(zoom))} · ` : ""}Link: <a href="${h(zoom)}" style="color:#2D8CFF">${h(zoom)}</a><br>If I’m finishing another call, you’ll wait in the waiting room for a moment and I’ll let you in.</p>`
          : `<p style="font-size:15px">I’ll email you a Zoom link before we start.</p>`;
      } else if (b.mode === "phone") {
        how = `<p style="font-size:15px">I’ll call you on <b>${h(b.phone || "the number you gave")}</b>.</p>`;
      } else {
        how = `<p style="font-size:15px">Your visit is confirmed — I’ll come to <b>${h(b.restaurant)}</b>${b.address ? ` at ${h(b.address)}` : ""}.</p>`;
      }
      html = wrap(`<h1 style="font-size:22px;margin:0 0 8px">${kind === "confirmed" ? "Your visit is confirmed" : "Your demo is booked"}</h1>
        <p style="font-size:15px">Hi ${h(b.name)},</p>
        <p style="font-size:15px">Thanks for booking a Restaurant Deluxe demo for <b>${h(b.restaurant)}</b>.</p>
        ${details}${how}
        <p style="font-size:15px">${show}</p>
        <p style="font-size:15px">Need to change the time? Just reply to this email or call me on ${PHONE}.</p>
        <p style="font-size:12px;color:#8a86a3">A calendar invite is attached.</p>`);
    } else if (kind === "requested") {
      subject = `Visit request received — ${when(b.start_at)}`;
      html = wrap(`<h1 style="font-size:22px;margin:0 0 8px">Thanks — I’ve got your visit request</h1>
        <p style="font-size:15px">Hi ${h(b.name)},</p>
        <p style="font-size:15px">Thanks for asking me to come to <b>${h(b.restaurant)}</b>. I’m holding this time for you and I’ll confirm by phone or email within one business day.</p>
        ${details}
        <p style="font-size:15px">Would a video call be easier? On a 30-minute <b>Zoom call</b> I can show you exactly the same thing on screen, and you can book a time straight away:</p>
        ${button(videoLink, "Book a Zoom video demo instead")}
        <p style="font-size:15px">Questions in the meantime? Reply to this email or call me on ${PHONE}.</p>`);
    } else {
      subject = "Let’s do your demo on Zoom";
      html = wrap(`<h1 style="font-size:22px;margin:0 0 8px">Can we do it on a video call?</h1>
        <p style="font-size:15px">Hi ${h(b.name)},</p>
        <p style="font-size:15px">Thanks for asking me to visit <b>${h(b.restaurant)}</b>. I can’t make it in person at that time, but I’d love to show you everything on a <b>30-minute Zoom call</b> — you’ll see it on screen exactly as your staff and guests would.</p>
        <p style="font-size:15px">Pick any time that suits you:</p>
        ${button(videoLink, "Book a Zoom video demo")}
        <p style="font-size:15px">If you’d still like me to come in after the call, we’ll arrange it then. You can also reply to this email or call me on ${PHONE}.</p>`);
    }
    await resend("/emails", {
      from, to: [b.email], reply_to: `marc@${dom}`, subject, html,
      ...(attach ? { attachments: [{ filename: "restaurant-deluxe-demo.ics", content: ics(b, zoom) }] } : {}),
    });

    // ------------------------------------------------ alert to Marc
    if (kind === "booked" || kind === "requested") {
      const isReq = kind === "requested";
      const extra = [
        b.phone ? `Phone: ${h(b.phone)}` : "", `Email: ${h(b.email)}`,
        b.address ? `Address: ${h(b.address)}` : "", b.tables_count ? `Tables: ${h(b.tables_count)}` : "",
        b.start_when ? `Wants to start: ${h(b.start_when)}` : "", b.note ? `Note: ${h(b.note)}` : "",
      ].filter(Boolean).join("<br>");
      const alert = `<div style="font-family:${F};color:#1b1730"><h2 style="margin:0 0 10px">${isReq ? "🏠 Visit request — please confirm" : "📅 New demo booked"}</h2>
        <p style="font-size:15px"><b>${h(b.restaurant)}</b> — ${h(b.name)}<br>${W} · ${h(MODE[b.mode])} · ${L}</p>
        <p style="font-size:14px">${extra}</p>
        ${isReq
          ? `<p style="font-size:14px">The time is held for them. Open the <b>📅 Demo calendar</b> in your Venue CRM and tap <b>Confirm visit</b>, or <b>Offer a video call</b> (they get a friendly email with a link to book a Zoom demo).</p>${button(CRM_PAGE, "Open the Venue CRM", "#7c3aed")}`
          : `<p style="font-size:13px;color:#6b6788">They’re now <b>Demo booked</b> in your Venue CRM. The time is locked in your Demo calendar.${b.mode === "video" && zoom ? ` They have your Zoom link: ${h(zoom)}` : ""} A calendar invite is attached.</p>`}</div>`;
      await resend("/emails", {
        from: crmFrom, to: [REPORT_TO], reply_to: b.email,
        subject: `${isReq ? "🏠 Visit request" : "📅 Demo booked"}: ${b.restaurant} — ${when(b.start_at)}`, html: alert,
        ...(isReq ? {} : { attachments: [{ filename: "demo.ics", content: ics(b, zoom) }] }),
      });
    }

    return new Response(JSON.stringify({ ok: true, kind }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("rd-demo-notify", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
});
