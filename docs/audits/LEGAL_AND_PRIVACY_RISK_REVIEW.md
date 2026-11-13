# UK-focused product, privacy and licensing risk review

Reviewed 13 November 2026, starting from main `f9840555`. Scope: repository source,
local tests and current primary-source guidance. No production configuration,
customer records, provider contracts, paid accounts or physical driving was
inspected. This is a technical risk review, not a legal opinion, compliance
certificate or assurance against claims. UK and Northern Ireland are the stated
service scope; applicability elsewhere needs separate assessment.

## Evidenced defects addressed in this increment

| Finding | Evidence | Change |
| --- | --- | --- |
| Optional third-party analytics loaded before a separate choice, even on the privacy page | `voyagr/ga4.py` previously emitted a remote script and config unconditionally, using a hard-coded property | No default property; require `GOOGLE_ANALYTICS_MEASUREMENT_ID` and explicit browser opt-in. Local consent code makes no Google request/consent ping before opt-in. Decline is independent of navigation and the safety acknowledgement. |
| Analytics could include a sensitive page URL in its automatic page view | Previous config used default page-view behaviour | Disable automatic page view; explicitly send generic title, origin/path only and empty referrer. Disable Google/ad-personalisation signals and suppress script referrer. This does not audit Google's property-level Enhanced Measurement settings. |
| No user-facing withdrawal control | No separate analytics choice existed | Allow/decline controls on `/privacy#analytics-controls`; documented Google disable flag, accessible analytics-cookie deletion, cross-tab revocation and reload when withdrawing from the privacy page. Existing data is not recalled. |
| Policy said microphone capture only starts for dashcam and called analytics anonymous | `templates/privacy_policy.html` conflicted with voice, wake and AI implementations | Explain the actual voice paths, local wake processing, AI audio transfer and browser/vendor boundaries; remove the anonymous claim. |
| Policy implied short cache/deletion behaviour not established by code | Persistent route cache freshness filtering; dashcam cleanup endpoint; no verified whole-account deletion workflow | Distinguish cache freshness/display expiry from deletion. Identify reports as shared content. Do not promise an unverified automatic purge or complete in-app erasure. Actual retention/deletion remediation remains open below. |
| Raw voice text, spoken destinations and responses entered developer console | Voice control and announcement owners logged transcript/text/payload | Keep non-content lifecycle logs, remove raw spoken content/response bodies in those owners, and test successful destination behaviour without console disclosure. This is not application-wide logging redaction. |
| Local dark vector map lacked source attribution; raster credit lacked the licence link | Dark style uses direct tile URLs, not a TileJSON attribution source; raster source was plain text | Add linked OSM attribution, OpenMapTiles credit, upstream dark-style licence/copyright and linked design/change notice. Keep geometry, tiles and paint unchanged. |
| Checkout redirects accepted arbitrary HTTPS hosts | `support.py` docstring promised same-domain returns, but prefix validation accepted any HTTPS URL | Parse and match only operator-configured origins; reject credentials, malformed URLs, unexpected ports and lookalike localhost. Preserve configured trials/subscription behaviour; redact provider exceptions. |
| Safety notice could be read as a blanket exclusion | “At your own risk” / “solely responsible” wording | Retain practical driving responsibilities, remove those blanket formulations and expressly preserve statutory rights/non-excludable liability. No additional navigation gate. |

## Operator inputs and unresolved risks

These remain work, not presumed compliant. Priority is triage, not a finding that
an operator has broken a law.

1. **Public operator/contact details — high, incomplete.** The public privacy
   alias now defaults to `info@vibevoyager.org`, with an environment override via
   `VOYAGR_PRIVACY_CONTACT_EMAIL`. Forwarding and actual delivery still need account
   setup and verification; see [public-contact setup](../design/PUBLIC_CONTACT_EMAIL.md).
   `VOYAGR_PRIVACY_OPERATOR_NAME` remains separately configurable and unfilled;
   no personal name is invented or published. A forwarding alias does not remove
   controller/trader identification requirements. Confirm a functioning rights-
   response process and required trading details.
2. **Provider terms and data transfers — high, unverified.** Document routing,
   geocoding, traffic, imagery, hosting/auth, voice, analytics and payment recipients,
   roles, retention, countries, processor agreements and applicable transfer
   safeguards. Browser permission is not a substitute for a lawful-basis analysis.
   Existing policy statements about contracts/safeguards still need operator proof.
   Optional AI remains unconfigured unless explicitly set up; no provider is added.
3. **Retention and rights — high, confirmed implementation gaps.** Route caches can
   store precise endpoints/geometry; the 24-hour cache *read* freshness condition is
   not a scheduled purge. Dashcam retention cleanup is an explicit API operation;
   a working production schedule was not demonstrated. Saved-trip/dashcam deletion
   exists, but whole-account deletion, export, operational-log/backup retention and
   deletion across Supabase/providers were not established. Set justified periods
   and implement/test purging/export/deletion as separate increments; do not wipe
   user data or rewrite retention policy without that evidence. Assess DPIA and ICO
   registration/fee requirements for the actual service, especially cloud dashcam.
4. **SCDB/camera and map-data rights — high, contract evidence needed.** Possessing
   or buying a camera download does not establish rights to expose it through a
   public API, redistribute it or offer it commercially. Obtain the actual licence
   grant covering UK/NI and this service. MapTiler/tiles/font/sprite redistribution,
   Esri imagery use/caching and TomTom terms need verification against deployed
   sources. Local dark-style/OSM credits are fixed; standard remote style/source
   attribution and deployed control visibility still need browser acceptance.
5. **Subscriptions — high, unfinished/externally unverified.** Checkout creation
   exists in `voyagr/api/support.py`; no billing webhook or customer cancellation
   portal receiver was found in the searched backend. Do not infer that Stripe
   payment alone proves entitlement delivery, cancellation, refund or renewal
   handling. Verify external automation, pricing/trial disclosures, cancellation
   rights, terms, contact/trading details and currently commenced subscription law
   before selling. Checkout redirect origins are hardened in this increment;
   entitlement/cancellation handling remains unverified. No prices, paid
   entitlements or production checkout settings were changed here.
6. **Public reports — high, scope-dependent.** Anonymous, rate-limited reports
   accept descriptions and locations and expose active reports publicly. Reports
   must be presented as unverified community content. Establish an abuse/reporting
   and takedown process, moderation rules, deletion handling and assess whether the
   UK Online Safety Act applies to this specific service; no exemption is assumed.
   Current caller-supplied `user_id` also needs an attribution/authentication review.
7. **Security and secrets — high, outstanding review.** Existing audit
   `VOYAGR_SECURITY_AUDIT.md` documents dependency/auth/proxy/logging risks; a new
   complete advisory scan or production penetration test was not performed.
   `.env.production` remains tracked: assess its contents/history and rotate any
   real exposed credentials without printing them or breaking deployment. Other
   location logs remain (for example geocoding and speed-detector paths).
8. **Safety/product claims — high, physical acceptance pending.** Retain explicit
   mapped/route-estimate labels and unavailable states; do not market estimated
   speed/lane/access/avoidance or fuel/CAZ/toll data as guaranteed or authoritative.
   Follow the existing live GPS/map/ETA/voice acceptance checklist. Hands-free use
   can still distract; do not imply it is always safe or lawful. Disclaimers do not
   replace reasonable care, reliable implementation or consumer rights. Consider
   suitable professional advice and insurance for the actual business model.
9. **Analytics deployment — medium, additional operator checks.** Set the property
   explicitly only after reviewing Google terms, data sharing, retention, transfers
   and Enhanced Measurement configuration. The latter can collect event/link/form
   data beyond the manually sanitised page view and is controlled in Google Admin.
   The local consent key is versioned; change the notice/choice version if purposes
   change. Client preference alone is not a full controller consent-audit record.
   Review any historical collection and retention separately; this change cannot
   retrospectively obtain consent.

10. **Children/accessibility — scope assessment needed.** Walk/bike planning is
    available to the public, while the policy only says the service is not directed
    at under-13s. That statement does not establish whether children's privacy
    requirements apply. Assess likely under-18 use and the applicable design code,
    along with accessibility duties; existing UI tests are not a complete audit.

## Verification and release limits

- Backend integration checks verify configured/default-off analytics, absence of a
  remote tag in initial HTML, authorised monitoring without analytics, policy
  disclosures, contact escaping and immutable executable release compatibility.
- Browser checks use the rendered privacy page and intercept Google: verify zero
  initial remote requests, explicit opt-in, sanitised queued page view, withdrawal,
  cookie removal, persisted decline and usable mobile/desktop controls. This does
  not audit the live Google property or demonstrate production compliance.
- JS regressions cover consent fail-closed behaviour, cross-tab revocation,
  preservation of essential cookies, voice functionality without content logs and
  local source attribution/retained notices. The real MapLibre dark rendering check
  also verifies the source attribution links are rendered into its control.
- No production deployment, data deletion, billing change, provider contract
  acceptance or claim of completed legal compliance is made.

## Primary sources consulted

- ICO, PECR/storage and consent guidance:
  https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-manage-consent-in-practice/
- ICO, data minimisation:
  https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/
- ICO, right to be informed:
  https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-be-informed/
- ICO, dashcams:
  https://ico.org.uk/for-organisations/advice-for-small-organisations/cctv-and-dashcams
- Google, disabling collection:
  https://developers.google.com/tag-platform/security/guides/privacy
- Google, Enhanced Measurement configuration:
  https://support.google.com/analytics/answer/9216061
- OSM Foundation attribution:
  https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
- Upstream dark style licence, retained alongside the local derivative:
  https://github.com/openmaptiles/dark-matter-gl-style/blob/master/LICENSE.md
- GOV.UK, Highway Code rule 150 and device-use law:
  https://www.gov.uk/guidance/the-highway-code/general-rules-techniques-and-advice-for-all-drivers-and-riders-103-to-158
  https://www.gov.uk/using-mobile-phones-when-driving-the-law
- Consumer Rights Act, section 65 (non-excludable negligence liability):
  https://www.legislation.gov.uk/ukpga/2015/15/section/65
- GOV.UK, online selling information:
  https://www.gov.uk/online-and-distance-selling-for-businesses/online-selling

Consult the applicable current law/commencement and facts; a source link alone
is not a determination that a particular obligation or exemption applies.
