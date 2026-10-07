# StreamVista / Bridge integration

Bridge production media storage is **Oracle OCI Object Storage (Mumbai)**.

Active Bridge asset and service-order APIs use `src/lib/bridge/oci-object-storage.server.ts`. OCI is the canonical production storage provider.

AWS/S3 adapter code is retained only for legacy compatibility/tests. It is not an active Bridge production dependency and must not be used for release certification.

Production storage verification must prove OCI object creation, Bridge asset reference, signed OCI read/write, object verification, and persisted asset state.

Razorpay, Supabase, Hostinger Mail and Postgres remain separate release gates and require their own live E2E evidence.
