# Removalist Deluxe

Editable HTML/JavaScript platform hosted at https://webescapade.com/removalists/

- index.html: Webescapade sales landing page. Use ?edit=1 to edit text/images, contact links and public assistant information; Deploy or Save copy retains edits.
- site.html: individual removalist customer website; ?b=BUSINESS_SLUG loads published business details.
- estimate.html + estimate.js + estimate-core.js: moving estimate with room-based volume, manual driving distance or optional suburb geocoding/routing, stairs, lifts, carrying, packing and ordinary bulky items. Model constants are editable in the authenticated Website editor.
- app/: authenticated business area and public quotation-visit booking. app/#start uses the existing Supabase login and Webescapade setup code. Only the removalist preset is offered.
- demo/: local-browser demonstration. Demo data never enters production customer records.
- site-chat.js: opt-in customer assistant; on/off, name and public FAQs are saved in biz.website. Demo answers use matching public FAQs in that browser; live businesses use removalist-site-chat.
- supabase/removalist-chat: sales assistant grounded in published sales page.
- supabase/removalist-site-chat: customer assistant grounded in this business's whitelisted public details and published customer-page text. It does not access staff/customer endpoints or supply customer records to AI.
- supabase/quote-only.sql: existing shared quote-booking function with a guard for the removalist preset. It leaves other presets' quote-booking behaviour unchanged and prevents a written moving quote from becoming an automatic moving-day booking.

## Estimate model

Approximate volume = (kitchen/hall base + bedrooms × bedroom allowance + living rooms × living allowance + extra rooms × storage allowance) × contents factor.
Loading time = volume ÷ configured crew loading speed. Unloading = loading time × unloading factor.
Crew hours = maximum of minimum hours and (loading + unloading + driving km ÷ configured average speed + access allowances).
Cost before GST = crew hours × hourly crew/truck rate + vehicle km × per-km rate + fixed setup/callout + packing hours × packing crew rate + ordinary bulky items × item allowance, subject to the minimum estimate.
10% GST is added only when the business's Setup GST setting is enabled.
Planning range = calculated total ± configured spread.

Default rates are illustrative, not researched market prices. A live business must save its own estimator rates before the public calculator shows a price. Room counts do not replace an inventory. Traffic, exact addresses, truck access, truck size/trips, tolls, storage, ferries, overnight stays, insurance upgrades and specialist items require confirmation.

## Quote-only workflow

The estimator carries pickup, destination, room counts, access, preferred moving date and estimate into a written quote request or quotation-visit booking. Online appointment slots book quotation visits only. Moving day, truck and crew are confirmed directly with the removalist. Written quote pages display the quote and provide print/contact guidance; they have no automatic moving-day reservation or payment step.

## Public services

Optional manual-button geocoding: Nominatim, https://nominatim.org/release-docs/latest/api/Search/
Optional car route: OSRM, https://project-osrm.org/docs/v5.24.0/api/
No automatic location search; queries are cached during the session and geocoding calls are spaced at least 1.1 seconds apart per browser.
OpenStreetMap attribution is displayed. For higher traffic, configure an appropriate hosted geocoder/router; manual km entry remains available.
Supabase settings are existing public browser connection configuration. Never commit service-role or AI provider secrets.
