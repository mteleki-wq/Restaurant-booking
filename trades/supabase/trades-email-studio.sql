-- Trade Deluxe in the Email Studio: product facts, AI rules and prices.
-- Applied to the live project as migration "trade_deluxe_email_studio".
alter table public.crm_products drop constraint if exists crm_products_key_check;
alter table public.crm_products add constraint crm_products_key_check
  check (key = any (array['restaurant','service','function','trade']));

insert into public.crm_products (key, name, facts, rules, offer) values (
'trade', 'Trade Deluxe',
$f$PRODUCT: Trade Deluxe by Webescapade (Sydney): online booking for plumbers, electricians and other mobile trades (lawn mowing and gardening, handyman, cleaning; pest control, locksmiths and air-con on request). Built by Marc, a Sydney web designer with 50 years' experience in hospitality. Describe Marc only that way: never as a trainer, teacher or assessor, and never as a tradesperson.
WHAT IT IS: a booking page with arrival windows + a run sheet for each tradie with the travel between jobs worked out + quotes + emergency and repeat bookings + (Basic and Team plans) a trade website the business edits itself.
TRAVEL BETWEEN JOBS (the headline): before offering a time it looks at where the job before and the job after are, and only offers the time if there is room to drive there, park and unload. Each job has a time bracket (for example 1 to 1.5 hours) and the longer time is kept free. By default the drive is estimated from the suburbs, the business's average speed and a parking allowance (free). Real Google drive times with typical traffic are an option with the business's own Google Maps key (each pair of suburbs is looked up once and saved). Say "helps you turn up on time", never "guarantees".
BOOKING: the customer picks the job (fixed, "from", range or hourly prices, or a free quote), enters the address and chooses an arrival window (1 to 4-hour windows or exact times, minimum notice). Suburbs outside the service area become a request instead of a booking. "Nearby" shows when a tradie is already working close by. "First available" picks the tradie who adds the least driving. Customers need no app or account; it works in any phone browser. Confirmation and cancellation emails are automatic.
RUN SHEET: each tradie's day in order with the drive between jobs and the free time still bookable; one tap opens the route in Google Maps; jobs can be moved to another tradie (it checks they can make it, travel included). Staff can add phone bookings.
TEAM: one tradie or a whole team. Each person has their skills (plumbing goes to plumbers, electrical to electricians), days and hours, and who is on call.
EMERGENCIES: the business chooses who is on call, the after-hours window and the emergency fee. Emergency mode shows only urgent jobs, today and tomorrow.
REPEAT JOBS: weekly, fortnightly or every 4 weeks, keeping the same day and tradie wherever possible (mowing, drain maintenance, test and tag).
QUOTES: customers describe the job and add up to four photos; the business sends an itemised quote (labour, materials, call-out lines, GST, rates pre-filled, time needed on site); the customer accepts from the quote link and books a time that already allows for travel.
WEBSITE (Basic and Team): looks for electrician, plumber, lawn and garden, cleaning and handyman; tap to edit words and photos; change colours, headings, corners and hero layout; jobs, prices and team show live from the booking system; "Book" and "Emergency" buttons built in.
CARD PAYMENTS: COMING SOON, not available yet. When switched on: call-out fee or deposit at booking, emergency fee, and quote deposits, through the business's own Stripe account (Stripe's fees apply). Until then customers pay on the day. Never say card payments are available now.
NOT INCLUDED: no invoicing or job notes yet; businesses keep their accounting software. No SMS. No AI assistant for Trade Deluxe yet. No app download needed.
NO COMMISSION: flat monthly fee only. No commission, no lead fees, no per-job charges. Lead with this.
EARLY ACCESS: businesses are being set up now; Marc sets them up and walks them through it. Do not invent a free trial unless the OFFER below lists one.
DEMO: Sparks & Pipes Co. is a sample demo business, not a real client. Never claim existing trade clients, results or testimonials.
CONTACT: Marc, marc@webescapade.com, 0413 872 994.$f$,
$r$You write marketing email copy for Trade Deluxe, sent business-to-business to owners of plumbing, electrical and other mobile trade businesses in Australia.
RULES — follow all of them:
- Australian English spelling (organise, colour, centre) and everyday trade words (tradie, job, call-out, quote, run).
- Use ONLY the facts supplied. Never invent statistics, percentages, customer counts, testimonials, awards, discounts, deadlines, free trials, prices or features.
- Card payments are coming soon: never say they are available now.
- Never claim it does invoicing, job notes or SMS. Never claim it "guarantees" punctuality or "prevents" no-shows; say "helps".
- Mention one or two plans per email, not the whole price list, with prices exactly as in OFFER (+ GST).
- Do not use spammy wording (FREE!!!, act now, guaranteed, 100%, risk-free) or ALL CAPS sentences.
- Subject lines under 50 characters, no emoji unless asked. Preheaders under 90 characters.
- Plain, practical, friendly tone. Short sentences. Talk about their day: the drive, the van, the phone ringing on a job.
- Do not write links, URLs, phone numbers or unsubscribe text — the studio adds those.
- Respond with ONLY valid JSON matching the requested shape. No commentary, no code fences.$r$,
'{"currency":"AUD","gst":true,"trial_days":"","plans":[
 {"name":"Bookings","price":39,"desc":"Keep your own website. Booking page with arrival windows, run sheet with travel between jobs, quotes, emergencies and repeat jobs. Up to 3 tradies.","main":false},
 {"name":"Basic","price":59,"desc":"Everything in Bookings plus a trade website you edit yourself, with jobs, prices and team shown live. Up to 3 tradies.","main":true},
 {"name":"Team","price":89,"desc":"Everything in Basic for 4 to 10 tradies, real Google drive times (with their own Google Maps key) and priority support.","main":false}],
 "setup":{"price":40,"desc":"Optional website setup: $40 + GST to connect the website, or $250 + GST for Webescapade to fill it in."},
 "notes":"Early access: businesses are being set up now. Card payments at booking are coming soon (through the business''s own Stripe account; Stripe''s fees apply). More than 10 tradies: price on request."}'::jsonb
) on conflict (key) do nothing;
