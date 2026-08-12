# Signed Windows Release Checklist

Cart Confirm has no unsigned release path by design — `.github/workflows/release.yml`
fails closed if any of the following are missing. This doc exists so that running
a release is a checklist, not a judgment call, and so it's clear which parts
require repo-owner action versus which are already automated.

Executor agents (this includes Trix) do not hold merge, tag, or release authority
on this repo. This doc is preparation only — it does not perform any of the steps
below.

## What the workflow already enforces (no action needed)

`release.yml` triggers on `push` of a `v*` tag and, before building anything:

1. Reads `version` from `package.json` and requires the pushed tag to be exactly
   `v<that version>` — a mismatched tag fails the run immediately.
2. Requires the tag to be an **annotated** tag (`git tag -a`), not lightweight.
3. Requires the tag to be **GPG/SSH-verified by GitHub** (`verification.verified`
   from the GitHub API) — an unsigned annotated tag also fails.
4. Requires `secrets.WINDOWS_CERTIFICATE` to be non-empty.
5. After building, requires exactly two `.exe` artifacts in `dist/`, each with a
   `Valid` Authenticode signature status, and cross-checks every file in
   `dist/SHA256SUMS.txt` against a freshly computed hash.

If any of these fail, no GitHub Release is created. There is no manual override
in the workflow, and none should be added.

## What a repo owner (Kevin) needs to do once, before the first signed release

- [ ] Obtain a Windows code-signing certificate (PFX) valid for Authenticode
      signing. An EV cert avoids Windows SmartScreen friction but either type
      works with `electron-builder`.
- [ ] Add two **repository** secrets (Settings → Secrets and variables →
      Actions):
      - `WINDOWS_CERTIFICATE` — the PFX file, base64-encoded
        (`base64 -w0 cert.pfx` on Linux/macOS, `certutil -encode` on Windows,
        then strip the header/footer lines certutil adds).
      - `WINDOWS_CERTIFICATE_PASSWORD` — the PFX's password.
- [ ] Confirm `git` is configured locally with a GPG or SSH signing key that
      GitHub already has the public half of (`git config user.signingkey`,
      `git config tag.gpgsign true`, and the key listed under
      github.com/settings/keys), since step 3 above requires GitHub to verify
      the tag, not just for it to look signed locally.

## Per-release steps

1. Confirm `main` is at the exact commit intended for release, and that
   `package.json`'s `version` is the version being released (for example,
   `3.1.8`).
2. Confirm the PR carrying the release commit has been reviewed
   and merged through the normal process — this doc does not cover merge
   approval, only the tag/build/sign gate downstream of it.
3. From a checkout of that commit, create and push a signed annotated tag:
   ```sh
   git tag -s v3.1.8 -m "Cart Confirm v3.1.8"
   git push origin v3.1.8
   ```
   (`-s` signs with your configured GPG key; use `-a` plus a separate SSH
   signing setup if you're using SSH-based signing instead — either way, the
   tag must come back `verified: true` from the GitHub API.)
4. Watch the `Signed Windows release` workflow run. If it fails at the tag or
   certificate checks, nothing was built or published — fix the underlying
   secret/tag issue and push a new tag rather than retrying blindly.
5. Once the workflow succeeds, confirm the GitHub Release has both `.exe`
   artifacts and `SHA256SUMS.txt` attached, and spot-check one checksum
   locally before announcing the release.

## Current release-candidate status

Checked on 2026-08-12:

- [ ] `WINDOWS_CERTIFICATE` / `WINDOWS_CERTIFICATE_PASSWORD` secrets — **neither
      is set.** The repo currently has zero Actions secrets configured, so a
      tag push would fail at the "Require the Windows signing certificate"
      step even if the tag itself were valid.
- [ ] Signed, GitHub-verified `v3.1.8` tag — not yet created.
- [ ] PR #13 review/merge — still open as a mergeable draft. At the audited
      `a7b2016` head, its `pull_request` CI run passed both source verification
      and unsigned Windows packaging. The continuation edits require fresh PR
      CI after push, and the manual validation in `VALIDATION-CHECKLIST.md`
      remains an operator gate.

Nothing here should be improvised if a step is ambiguous or a secret is
missing — stop and escalate rather than working around a failing gate.
