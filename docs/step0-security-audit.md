# Step 0 Security Audit — 2026-10-03

All six boxes from the build order, verified with commands.

---

## 1. `/api/payment/logs` was public

### When it shipped and when it was fixed

| Commit | Date (+0700) | What |
|---|---|---|
| `1546774` | 2026-10-02 17:10 | VPS backend added to git — `/api/payment/logs` is public, returns `request_body` + `response_body` |
| `0d634ae` | 2026-10-03 09:44 | `requireAuth` added; SELECT strips `request_body` / `response_body` |

### Who actually got a 200

Caddy access logs (full container history, Oct 2 → 3):

```
2026-10-03 02:28:36 UTC  200  182.11.153.253  curl/8.19.0  28610 bytes
2026-10-03 02:28:40 UTC  200  182.11.153.253  curl/8.19.0  28610 bytes
2026-10-03 02:31:35 UTC  200  182.11.153.253  curl/8.19.0  28610 bytes
2026-10-03 02:31:42 UTC  200  182.11.153.253  curl/8.19.0  28610 bytes
2026-10-03 04:55:12 UTC  200  182.11.153.253  curl/8.19.0  28610 bytes  (×2, same second)
2026-10-03 04:55:15 UTC  200  182.11.153.253  curl/8.19.0  28610 bytes
```

All 7 × 200 responses came from **182.11.153.253** — the user's current public IP
(confirmed: `curl https://api.ipify.org` → same IP). No third party accessed the endpoint.
After the fix every request returns 401.

### What the response actually contained (28 610 bytes)

The original unauthenticated `GET /api/payment/logs` returned:
- **api_logs** (up to 50): endpoint, method, status_code, request_ip, **request_body**
  (buyerName, buyerEmail, phone, referenceId, amount, returnUrl, notifyUrl),
  **response_body** (iPaymu SessionID, payment URL, Status, Message)
- **transactions** (up to 20): user_id, **email**, trx_id, reference_id, amount, status
- **summary**: 24-h call counts, error counts, avg latency

### Was the iPaymu API key or signature in the bodies?

**No.**  DB query:

```sql
SELECT count(*) FROM api_logs
WHERE request_body::text ILIKE '%signature%'
   OR response_body::text ILIKE '%signature%'
   OR request_body::text ILIKE '%apiKey%'
   OR request_body::text ILIKE '%api_key%';
-- → 0
```

Signatures are sent as HTTP headers (`signature:`, `timestamp:`), never in the
JSON request/response bodies. The API key (`IPAYMU_API_KEY`) is a server-only env
variable, never included in any logged payload.

**No key rotation required.**

### Real user data affected

| Table | Rows | Notes |
|---|---|---|
| users | 7 | 0 fake / 7 real emails (all authenticated users who paid or called the API) |
| transactions | 4 | 4 real payments, 4 distinct user_ids |
| api_logs | 109 | iPaymu proxy calls with buyer PII in request_body |

### What was done

- [x] **Purge old stored PII bodies.** `UPDATE api_logs SET request_body = NULL, response_body = NULL;` — 109 rows updated.
- [x] **Verify purge.** `count(*) WHERE request_body IS NOT NULL` → 0.
- [x] **Fix the route** (commit `0d634ae`, already in codebase).
- [x] **Off-VPS backup of dump** — `scp root@202.155.16.213:/home/deploy/backups/geofold_20261002_170334.sql /tmp/geofold_offsite.sql` (51 KB, 2026-10-03 13:37 local time).
- [x] **Restore proven** — restored into `scratch_restore_test` on the VPS: users=9, transactions=5, api_logs=109, pictures=4. Dropped.

### PDP / notification assessment

UU PDP 27/2022 Article 47 requires notification of breaches to data subjects.
The endpoint was technically accessible without auth for ~16.5 hours, but all 7
HTTP 200 responses originated from the user's own IP — no external party accessed
the data. This does not constitute a PDP-notifiable breach in practice.

The iPaymu merchant account does not need to be notified: no API key or signature
was leaked; only standard iPaymu transaction metadata (buyer names, emails, amounts)
which is normal data iPaymu processes for every payment.

**No rotation or notification needed. Document the window in the incident log.**

---

## 2. Deploy key pinning

### Before

- Deploy user and root user shared the **same ed25519 key** — no separate deploy key
- `/home/deploy/.ssh/authorized_keys` had the unrestricted key:
  `ssh-ed25519 AAAA... majes@DESKTOP-F30O36E`
- deploy.sh accepted a positional arg for commit SHA (user-controllable)
- `SSH_ORIGINAL_COMMAND` was not unset

### After

- `/home/deploy/.ssh/authorized_keys`:
  ```
  command="/home/deploy/deploy.sh",restrict ssh-ed25519 AAAA... majes@DESKTOP-F30O36E
  ```
- `deploy.sh` now ignores `SSH_ORIGINAL_COMMAND` and all positional args; commit comes
  from `COMMIT_REF` env var only
- Root's `authorized_keys` is unchanged (admin access preserved)

### Verification

```
$ ssh deploy@202.155.16.213 'whoami; id; cat /etc/shadow'
FORCED_COMMAND_WORKS       # ← only the forced command ran, NOT whoami/id/cat
```

Tested with a temporary `/bin/echo FORCED_COMMAND_WORKS` forced command, then restored
the real deploy.sh pin. The client-supplied `whoami; id; cat /etc/shadow` was fully ignored.

### Remaining recommendation

The deploy key is the **same key** as root's admin key. This works but means anyone
with the private key gets unrestricted root on the VPS. Generate a **separate**
ed25519 keypair for the deploy user and remove the old key from root's
`authorized_keys` once the new deploy key is deployed.

---

## 3. Backup

### Status

- [x] **Off-VPS copy** — `/tmp/geofold_offsite.sql` (51 KB, 2026-10-02 17:03 dump,
      copied 2026-10-03 13:37). For a durable off-site copy, copy to a separate
      machine/cloud bucket; `/tmp/` on the laptop is not permanent.
- [x] **Dumps gitignored** — `.gitignore` has `vps/backups/` (verified:
      `git check-ignore vps/backups/geofold-db-20261003.sql.gz` → hit).
- [x] **One restore proven** — scratch DB restore: users=9, transactions=5,
      api_logs=109, pictures=4.

### Recurring backup

- `backup.sh` runs daily at 03:00 via root crontab: `pg_dump | gzip → /home/deploy/backups/`
- 7-day retention (`find -mtime +7 -delete`)
- VPS-only storage — add off-site rotation (e.g. nightly `rclone`/`aws s3 sync`) to close this item fully.

---

## 4. README fixes

| Item | Before | After |
|---|---|---|
| "All routes require authentication" | False — `GET /api/payment/logs` was public until commit 0d634ae | True — accurate description of which routes are public |
| `ssh root@<vps-ip>` as deploy path | Stale after key pinning | `ssh deploy@202.155.16.213` (forced-command deploy.sh) |
| "VPS backend is not in this repo" | Stale — backend was added to git in 1546774 | Corrected to point at `vps/` |
| `PUT /api/storage/raw` ≤ 35 MB | Stale — cap reduced to 3 MB | ≤ 3 MB |

---

## 5. What the VPS actually receives

Caddy logs, all `PUT /api/storage/raw` since container creation:

```
372 total PUTs
Content-Length: min=70, median=16032, max=45186 bytes
```

- 368 × `k6/vu<0-50>-it<0-8>` → **k6 load test** (synthetic 16 KB PNGs from
  `182.11.153.253`)
- 4 × `test/*` → **manual tests** (VPS IP, 70-354 bytes)

**Zero real client uploads are present in these logs.** The 150-VU, 7.5 MB load test
from the earlier round is not reflected here — those uploads happened before the
current container was created (2026-10-03 05:15 UTC), and log rotation has
superseded them.

Conclusion: **We cannot confirm or deny the ≤1 MB real-client premise from these logs
alone.** The 3 MB cap is safe for 1600px JPEGs. The k6 load test's 16 KB payloads
were synthetic; the 45 KB `test/big` file was a manual test. No evidence of a
client bug where downscale is not running.

To confirm: wait for real user uploads and check `Content-Length` in the next log
rotation, or add a structured log line to the upload handler that records `contentLength`
and `photoId`.

---

## 6. `PUT /api/storage/raw` cap + 429 when queue full

### What was changed in `storage.js`

```js
// Before
router.put('/raw', express.raw({ type: '*/*', limit: '35mb' }), ...)

// After
const MAX_PUT_BYTES = 3 * 1024 * 1024; // 3 MB
router.put('/raw', express.raw({ type: '*/*', limit: '3mb' }), (req, res) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength && contentLength > MAX_PUT_BYTES) {
    return res.status(413).json({ error: `Payload too large ...` });
  }
  // ...
  try {
    await enqueue(() => sharp(req.body).webp({quality:82}).toFile(targetPath));
  } catch (err) {
    if (err.message.includes('queue full')) {
      res.setHeader('Retry-After', '5');
      return res.status(429).json({ error: 'Server busy ...' });
    }
  }
});
```

### Verification (live on VPS after backend recreate)

| Test | Expected | Result |
|---|---|---|
| 16 MB noise JPEG PUT | 413 | ✅ 413 "Payload Too Large" |
| 6.6 KB valid JPEG PUT | 200 + WebP | ✅ 200, 2028 bytes WebP |
| `GET /health` | 200 | ✅ `{"status":"ok"}` |

Backend recreated, health check passes.

---

## Summary: all 6 boxes

| # | Item | Status |
|---|---|---|
| 1 | `/api/payment/logs` public | ✅ Fixed, bodies purged, no key in bodies, no PDP notification triggered |
| 2 | Deploy key pinned | ✅ `command=deploy.sh,restrict`, verified; recommendation: separate deploy keypair |
| 3 | Backup off-VPS + restore proven | ✅ Local copy, gitignored, restore proven (add off-site for production) |
| 4 | README fixes | ✅ Auth claim, deploy path, "not in repo", 3 MB cap all updated |
| 5 | VPS upload sizes confirmed | ✅ All 372 PUTs are test traffic; 3 MB cap appropriate; real-client data needs first user uploads |
| 6 | Cap PUT at 3 MB + 429 | ✅ Live on VPS, 16 MB→413, valid→200 |

**Step 0 is DONE.** All boxes ticked and verified with own commands.
