# Bridge release-readiness gates

**Canonical production media: Oracle OCI Object Storage (Mumbai). AWS S3 is legacy compatibility/test code and is not a production gate.**

## 1. Bridge → CRAYONS LOOP publication

A title is only publishable when Bridge preflight passes:

- lifecycle is at least `LICENSING_READY`
- a private master object is registered
- a consumer poster is registered
- the operator has `loop.publish`
- territories, languages and exploitation model are explicit
- the distribution window is valid

Successful authorization must create or update both `bridge_loop_publications` and `loop_titles`. Evidence must come from a real authenticated flow and a real visible LOOP catalog result.

## 2. OCI media E2E

For a real authenticated title:

1. Request a signed OCI upload URL.
2. Upload a real source object.
3. Confirm the OCI object exists.
4. Confirm the Bridge asset/title record references the same object key.
5. Request a signed OCI download URL and retrieve the object.
6. Verify the object and persisted asset state.

Required server-only variables:

- `OCI_TENANCY_OCID`
- `OCI_USER_OCID`
- `OCI_FINGERPRINT`
- `OCI_PRIVATE_KEY`
- `OCI_REGION`
- `OCI_NAMESPACE`
- `OCI_BUCKET_NAME`

Configuration presence alone is not connectivity certification.

## 3. Supabase Auth → Hostinger SMTP

Expected sender: `abijithasokan@crayonspictures.com`.

Trigger a brand-new signup or password-recovery message in the canonical Supabase project and verify sender, canonical callback, successful callback completion, and absence of fallback Supabase sender.

Bridge transactional mail requires `SMTP_HOST`/ `HOSTINGER_SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`/ `HOSTINGER_SMTP_USER`, `SMTP_PASS`/ `HOSTINGER_SMTP_PASS`, and `MAIL_FROM`.

## 4. Razorpay

Required evidence:

1. Real Bridge order.
2. Real captured payment.
3. Signature/webhook verification succeeds.
4. `bridge_payments` persists durable payment state.
5. Entitlement is created only after capture.
6. Audit event is persisted.

## 5. DMCA

Migration `0011_bridge_dmca.sql` must be applied to canonical Supabase and `bridge_dmca_registrations` must exist before DMCA is certified.

## 6. Custom domains

Canonical Bridge domain: `www.crayonspictures.in`. `crayonspictures.in` redirects to it. The retired `bridge.crayonspictures.com` host must not be used.

- Bridge: `www.crayonspictures.in`
- LOOP: `crayonsloop.com`

Do not certify or promote based on a green build alone. Production requires real E2E evidence for LOOP publication, OCI storage, Supabase Auth → Hostinger SMTP, Razorpay capture → entitlement, DMCA migration, and canonical domain.
