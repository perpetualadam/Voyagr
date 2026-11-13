# Public contact alias

The app advertises `info@vibevoyager.org` as its default public privacy contact.
`VOYAGR_PRIVACY_CONTACT_EMAIL` can override it; an explicit empty/invalid value
continues to show the missing-contact state. Operator identity remains separately
configured: an email alias is not a legal identity or a compliance certification.

Keep the receiving mailbox private: configure it in Cloudflare, not source,
public policy text, environment examples, route data or client settings. No
private destination is included in this document.

## Cloudflare setup (operator action required)

This repository cannot create or verify an email route. A Cloudflare account
with access to the `vibevoyager.org` zone is required.

1. Open Cloudflare Email Service → Email Routing (older dashboards may show
   Email → Email Routing under the selected domain).
2. Add the desired private receiving mailbox under Destination Addresses. Open
   Cloudflare's verification message in that inbox and verify the destination.
3. Select `vibevoyager.org`. Review the domain's existing mail service and DNS.
   If Email Routing is not enabled, review Cloudflare's required MX/SPF/DKIM
   records before enabling it. Replacing another provider's MX records can
   interrupt existing domain mail; preserve unrelated DNS and existing mailboxes.
   Do not create a second competing SPF record.
4. Create one custom rule: local part `info`, domain `vibevoyager.org`, action
   Send to an email, destination the verified private mailbox. Enable the rule.
   Do not enable a catch-all just for this single address.
5. Send a test to `info@vibevoyager.org` from a different mailbox, not the forwarding
   destination itself. Confirm receipt, check spam and Cloudflare activity, and
   confirm that the published contact is usable before deploying the app change.

Receiving/forwarding is separate from sending. Replying directly from a private
mailbox can reveal its address/display name. To reply as the public alias, set up
an authenticated outbound provider and the mail client's supported Send as flow;
verify sender authentication and the address visible to recipients. Do not claim
Cloudflare inbound routing alone provides an outbound mailbox or hides identity.

No route, DNS record, verification message or delivery test was performed by this
repository change. It must not be described as live/verified forwarding.

## Identity requirements remain open

ICO guidance requires the controller's identity and contact details. A trading
name or alias does not automatically remove applicable disclosure duties. Obtain
advice on the appropriate business/sole-trader disclosures and correspondence
address rather than claiming that a forwarding address creates anonymity.
No personal operator name is added by this change.

Sources:
- https://developers.cloudflare.com/email-service/get-started/route-emails/
- https://developers.cloudflare.com/email-service/reference/troubleshooting/
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/
- https://www.gov.uk/become-sole-trader/choose-your-business-name
