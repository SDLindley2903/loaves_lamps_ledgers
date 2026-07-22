# 10 — File Storage Architecture

Covers brief item **#9 (File storage architecture)**.

Files in this portfolio include camper health documents and consent forms (PHI, CampMedMgr), member
photos and documents (PII, Genesis/Kindling), and giving/financial statements (Stewardship). File
storage is therefore a **regulated data path**, designed to the same strictness as the database.

---

## 1. Decision: object storage (S3) as the blob store; the database stores only metadata

Binary content lives in **object storage (Amazon S3)**. The relational database (doc 07) stores only
**file metadata**: id, `tenant_id`, owner, classification, content-type, size, checksum, storage key,
and virus-scan status. The database **never** stores the bytes.

**Why object storage, not the database or a filesystem:**
- **Databases are the wrong place for blobs** — they bloat backups, thrash caches, and couple file
  size to DB performance. Keeping blobs out of Postgres keeps the system of record lean (doc 07).
- **Object storage is effectively infinite, cheap, durable (11 nines), and versioned**, with native
  encryption, lifecycle tiering, Object Lock (WORM), and cross-region replication — the exact
  primitives our backup/DR (doc 07) and audit-archive (doc 06) needs.
- **Metadata-in-DB, bytes-in-S3** lets us apply relational access control, tenancy (RLS), and audit to
  the *metadata* while streaming bytes directly to/from storage, which scales far better than proxying
  file bytes through app servers.

## 2. Access pattern: presigned, time-limited, authorization-gated URLs

Clients never get durable public URLs and never send file bytes through the app tier. Instead:

1. Client requests upload/download; the app **checks authorization** (doc 03) and **tenant scope**
   (doc 04) on the file's metadata.
2. On success, the app issues a **short-lived presigned URL** scoped to that one object and operation.
3. Client uploads/downloads **directly to/from S3** using the presigned URL.

**Why presigned direct transfer:**
- **Scalability:** large medical PDFs and photos never consume app-server bandwidth/memory; the app
  makes an authorization decision, not a byte-pump. This is what lets file handling scale to millions
  of users cheaply.
- **Security:** the URL is time-limited, single-object, single-operation, and only issued after a full
  permission + tenant check — so possession of a URL is not durable access, and there are no public
  buckets.

## 3. Tenant isolation for files (doc 04, applied to storage)

- **Every object key is prefixed with `tenant_id`**: `{tenant_id}/{product}/{resource}/{uuid}`.
- **Bucket policies / IAM** scope access so cross-tenant object access is denied at the storage layer,
  independent of application logic.
- **Presigned URLs are minted only after the app verifies the requester owns the tenant scope** of the
  file's metadata row (which is itself RLS-protected).

**Why prefix *and* policy *and* app-check:** three independent controls (naming, IAM, application) must
all fail for a cross-tenant file leak — the same defense-in-depth as row isolation. A bucket
misconfiguration alone shouldn't leak files; an app bug alone shouldn't either.

## 4. Encryption

- **At rest:** S3 server-side encryption with **KMS-managed keys** (SSE-KMS), **per-tenant data keys**
  for siloed/PHI tenants (doc 11), enabling **crypto-shred on offboarding** (destroy the tenant key →
  the objects are unrecoverable, satisfying deletion obligations without scrubbing every object).
- **In transit:** TLS only; presigned URLs are HTTPS.
- **Client-side / field-level encryption** for the most sensitive documents (select CampMedMgr PHI)
  where we want the bytes opaque even to storage operators (doc 11).

**Why per-tenant keys and crypto-shredding:** it makes tenant deletion (doc 04/05) fast, verifiable,
and complete, and it caps the blast radius of any single key. "We destroyed your key" is a stronger,
cleaner deletion guarantee than "we ran a delete over your objects."

## 5. Safety pipeline for uploads

Every uploaded file passes a shared pipeline before it is usable:

- **Content-type and size validation**, extension/MIME sniffing (don't trust the client's label).
- **Antivirus / malware scanning**; status tracked in metadata; unscanned/failed files are quarantined
  and non-downloadable.
- **Image/document sanitization** (strip EXIF geolocation from photos — a real privacy risk for
  minors' photos; neutralize active content in PDFs/SVGs).
- **Checksum** stored for integrity verification.
- **Optional watermarking / DLP** for exported financial or medical documents.

**Why a mandatory pipeline:** user-uploaded files are an attack vector (malware, XXE/SVG scripts,
zip bombs) and a privacy vector (EXIF GPS in a child's photo). Centralizing the pipeline means every
product gets safe uploads for free and none can skip the checks.

## 6. Lifecycle, retention, delivery

- **Lifecycle tiering** (hot → infrequent → cold/archive) by access pattern to control cost.
- **Retention & legal hold** per classification (doc 07/15); WORM Object Lock where records must be
  immutable (compliance documents, signed consents).
- **Versioning** on to survive accidental overwrite/delete and ransomware.
- **CDN delivery** for public, non-sensitive assets only (marketing, public church pages) — sensitive
  files are **never** CDN-cached; they always go through the presigned-URL authorization path.
- **Audit** (doc 06) on issue of every presigned URL for restricted files — we log that a camper's
  medical document was accessed, by whom, when.

## 7. Weaknesses / Risks / Tradeoffs / Better Alternatives

**Weaknesses & risks**
- **Presigned URL leakage** within its validity window. *Mitigation:* short TTLs, single-object/
  operation scoping, HTTPS-only, audit on issuance, and for the most sensitive files, very short
  windows plus client-side encryption so a leaked URL yields ciphertext.
- **Metadata/blob divergence** (a DB row without its object, or vice versa). *Mitigation:*
  transactional metadata + lifecycle reconciliation jobs; uploads finalize metadata only after the
  object is confirmed and scanned.
- **Malware/abuse via uploads.** *Mitigation:* the mandatory safety pipeline; quarantine-by-default.
- **Cost blow-up** from large media at scale. *Mitigation:* lifecycle tiering, size limits, dedupe by
  checksum, and per-tenant quotas.
- **Cloud (S3) coupling.** *Mitigation:* use the S3 API surface (broadly supported by alternatives) so
  the store is portable (doc 07 §7).

**Tradeoffs accepted**
- Direct-to-S3 transfer means the app tier can't inspect bytes inline during transfer — we accept this
  for scalability and enforce safety *after* upload via the pipeline before the file is usable.
- Per-tenant keys add key-management overhead (doc 11) — justified by crypto-shred deletion and blast-
  radius reduction for PHI.

**Better alternatives if constraints differed**
- A **managed document/records platform** could offer built-in retention, e-sign, and DLP — attractive
  for signed consent forms; we keep the interface open to integrate one, but own the core store to keep
  PHI under our tenancy/KMS controls.
- If files were tiny and few (no media, no documents), storing small blobs in Postgres would be simpler
  — ruled out by CampMedMgr documents and member/child photos.

---

*Prev: [09 — Notification Framework](09-notifications.md) · Next: [11 — Security & Encryption](11-security-encryption.md)*
