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
PRODUCT: Restaurant Deluxe by Webescapade (Sydney). Built by Marc, a hospitality professional, for independent restaurants.
WHAT IT IS: editable restaurant website + direct online bookings with live availability + guest CRM + optional AI assistant + QR table ordering (kitchen and bar displays, ticket printing, shift records with X/Z readings and Excel export).
TABLE ORDERING: guest scans the table QR, browses the menu in the phone browser (no app, no account), sends the order; food routes to the kitchen, drinks to the bar. Runs alongside the venue's existing POS — it does NOT replace the POS.
PRICES (AUD, per month): Standard $68 (website + bookings); Deluxe $98 (adds CRM, AI assistance, large-booking card guarantees); Complete $149 (adds QR table ordering, kitchen/bar displays, shift records). Table ordering add-on for existing clients $69. Standalone Table Ordering (keep your own website) $109.
TRIAL: 14-day free trial, set up first with the restaurant's own menu and branding. Setup assistance and ongoing support included.
CONTACT: Marc, marc@webescapade.com, 0413 872 994.
`;

const RULES = `
You write marketing email copy for Restaurant Deluxe, sent business-to-business to restaurant owners and managers in Australia.
RULES — follow all of them:
- Australian English spelling (organise, colour, centre).
- Use ONLY the facts supplied. Never invent statistics, percentages, customer counts, testimonials, awards, discounts, deadlines, prices or features.
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

  const expected = Deno.env.get("STUDIO_SECRET");
  if (!expected) return json({ error: "STUDIO_SECRET is not set on this function" }, 500);
  if (req.headers.get("x-studio-secret") !== expected) return json({ error: "Wrong studio secret" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Body was not valid JSON" }, 400); }
  const action = String(body.action || "");

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
      case "snapshot":
        return json({ ok: true, ...(await snapshot()), stages: STAGES, prospectStatuses: PROSPECT_STATUSES });

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
          `Return JSON: {"ideas":[{"title":"","why":"one or two sentences citing the data","audience":"who receives it","segment":"one of: prospects_new | prospects_priority_a | prospects_followup | trial_venues | quiet_venues | paying_venues | all_venues","goal":"","angle":"the hook in one line","subject":"","preheader":"","base":"one of: Intro to Restaurant Deluxe | Table ordering launch | 14-day free trial invite | Standalone ordering ($109) | Add-on for existing clients ($69) | Booking demo follow-up"}]}`,
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
