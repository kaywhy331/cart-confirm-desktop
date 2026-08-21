# Windows Release Checklists

Cart Confirm has two deliberately separate release lanes:

- `.github/workflows/unsigned-prerelease.yml` publishes a manually authorized,
  clearly labeled **unsigned prerelease**. Windows reports **Unknown publisher**
  and may show a Microsoft Defender SmartScreen warning.
- `.github/workflows/release.yml` publishes the signed stable release from a
  verified `v*` tag and fails closed without the Windows signing certificate.

An unsigned prerelease never weakens or substitutes for the signed stable lane.
This doc keeps both paths explicit and auditable.

Publishing either lane requires explicit repo-owner authorization. Do not infer
release authority from ordinary implementation, merge, or packaging requests.

## Unsigned prerelease

Use this only when accepting **Unknown publisher** is deliberate and temporary.
The manual workflow:

1. Requires the exact confirmation phrase `PUBLISH UNSIGNED PRERELEASE`.
2. Runs only from the current `main` commit.
3. Requires the version-specific `unsigned-v<package version>` tag to be unused.
4. Runs source verification, tests, `npm audit`, and the Windows build.
5. Requires exactly two executables, verifies both checksum entries, and requires
   Authenticode status `NotSigned` for each executable.
6. Creates a GitHub **prerelease**, never a stable release, with the unsigned and
   SmartScreen warning in its release notes.

The native TrackaLacker notification listener is not published in this lane as
an installable package. Windows notification access requires the signed AppX
identity from the stable lane. An unsigned Windows build can offer to locate a
same-version or newer AppX from an official stable `v*` release, verify the AppX
against that release's `SHA256SUMS.txt`, and open it with Windows App Installer.
That explicit handoff does not grant the unsigned process notification access;
the user must finish installation and launch the signed Start-menu app.

To publish, open **Actions → Unsigned Windows prerelease → Run workflow**, select
`main`, and enter the confirmation phrase. Bump `package.json` before publishing
another unsigned prerelease; the workflow refuses to replace an existing tag.

The first explicitly authorized unsigned prerelease is available as
[`unsigned-v3.1.8`](https://github.com/kaywhy331/cart-confirm-desktop/releases/tag/unsigned-v3.1.8).

## Signed stable release

## What the workflow already enforces (no action needed)

`release.yml` triggers on `push` of a `v*` tag and, before building anything:

1. Reads `version` from `package.json` and requires the pushed tag to be exactly
   `v<that version>` — a mismatched tag fails the run immediately.
2. Requires the tag to be an **annotated** tag (`git tag -a`), not lightweight.
3. Requires the tag to be **GPG/SSH-verified by GitHub** (`verification.verified`
   from the GitHub API) — an unsigned annotated tag also fails.
4. Requires `secrets.WINDOWS_CERTIFICATE` to be non-empty.
5. After building, requires exactly two `.exe` artifacts plus one notification-
   capable `.appx` in `dist/`, each with a `Valid` signature status, and
   cross-checks all three files in `dist/SHA256SUMS.txt` against freshly computed
   hashes.

If any of these fail, no stable GitHub Release is created. There is no unsigned
override in the stable workflow; use the separately labeled prerelease lane.

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
   artifacts, `Cart-Confirm-Signals-…appx`, and `SHA256SUMS.txt` attached. Install
   the AppX on a Windows test account, grant notification access, and spot-check
   one checksum before announcing the release.

## Current release status

Checked on 2026-08-12:

- [ ] `WINDOWS_CERTIFICATE` / `WINDOWS_CERTIFICATE_PASSWORD` secrets — **neither
      is set.** The repo currently has zero Actions secrets configured, so a
      tag push would fail at the "Require the Windows signing credentials"
      step even if the tag itself were valid.
- [x] PR #13 merged to `main` at `197790e1`; post-merge CI run `31596412474`
      passed source verification and unsigned Windows packaging.
- [x] Unsigned prerelease `unsigned-v3.1.8` published with both executables and
      `SHA256SUMS.txt` after independent checksum and PE signature-table checks.
- [ ] Signed, GitHub-verified `v3.1.8` tag — not yet created.

Nothing in the signed lane should be improvised if a step is ambiguous or a
secret is missing. The unsigned lane must remain visibly separate and must never
publish a stable `v*` release.
