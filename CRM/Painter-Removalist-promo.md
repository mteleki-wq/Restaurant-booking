# Painter and Removalist Deluxe promotion

Both products are available in the existing Webescapade promotional CRM and Email Studio.

- Control Room: https://webescapade.com/Control-room/
- Painter CRM: https://webescapade.com/CRM/venue-crm.html?prod=painter
- Removalist CRM: https://webescapade.com/CRM/venue-crm.html?prod=removalist
- Painter Email Studio: https://webescapade.com/CRM/restaurant-deluxe-email-studio.html?prod=painter
- Removalist Email Studio: https://webescapade.com/CRM/restaurant-deluxe-email-studio.html?prod=removalist

## Use

1. Select Painter or Removalist in the CRM to review enquiries, import prospects, track conversations and set follow-up dates.
2. Open Email Studio for the same product. Four editable starters cover introduction, the estimator, a short follow-up and getting-started access links.
3. Use AI > Product facts & prices to edit the saved product facts and offers. The existing Studio secret is required; no secret is embedded in these pages.
4. Expand the product access panel for the landing page, customer example, estimator, customer quote/visit demos, business demo, business sign-in, client setup and editors.
5. Review and test your email, choose recipients and send manually using the existing send controls. Adding a product does not schedule or send a campaign.

The two marketing landing-page enquiry forms now use public.deluxe_lead_submit. New enquiries receive the correct product label and follow-up entry. The existing transactional notification service identifies Painter/Removalist from the server-generated message prefix. Existing Trade Deluxe submissions keep their own behaviour.

One prospect per email is retained. product_interests adds a contact to another product's list without overwriting their original product or creating another contact. The CRM and Email Studio filters, AI summaries and prospect import honour these additional interests. Existing opt-outs, bounce suppression and duplicate-send controls remain in place. Product switching clears manually selected recipients and list filters. UTM parameters are inserted before URL fragments so app setup/editor links keep working.

## Client links

| Product | Business sign-in / editor | New-client setup |
| --- | --- | --- |
| Painter | https://webescapade.com/painters/app/#website | https://webescapade.com/painters/app/#start |
| Removalist | https://webescapade.com/removalists/app/#website | https://webescapade.com/removalists/app/#start |

Setup uses an authorised code supplied privately by Webescapade. Client owners must configure services, hours, business rates and content before sharing their business-specific customer link. Generic customer links are examples.

These are central promotional tools for Marc. The client products currently have basic customer records; advanced client CRM follow-ups and client Email Studio remain planned. Removalist appointment booking is for quotation visits. The actual move, truck and crew are confirmed by the business.

## Deployment and checks

Database: CRM/supabase/painter-removalist-promo.sql. Existing private tables keep their access restrictions. The interest helper is service-role only; the public form can submit enquiries but cannot read prospects or product records.

Edge functions: rd-control (catalogue, import and AI product filtering); trd-email (product-correct transactional enquiry notifications). Existing authentication and server-side environment secrets are retained.

Verified: all inline scripts compile; four starters per product; editable offer propagation; cross-product membership; UTM fragment preservation. Database routing, repeated-submission handling, secondary-product enquiries and private grants were checked in a rolled-back transaction. No test email or production prospect was retained.
