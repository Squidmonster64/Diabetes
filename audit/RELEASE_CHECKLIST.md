# Release checklist

This build is an **engineering prototype, not release-ready**, per the
handoff's own audit disposition. Use this checklist to track what remains
before any real-world release; do not check an item without evidence.

## Engineering (this build)

- [x] Every formula and safety gate from the handoff implemented
      (`SAFETY_GATE_COVERAGE.md`).
- [x] Deterministic decimal arithmetic (no float rounding) throughout the
      bolus module.
- [x] All handoff test-matrix rows covered by automated tests
      (`TEST_RESULTS.md`).
- [x] Closed special-situation enum at every API boundary (conflict C-04).
- [x] Patient-entered DIA provenance, versioning, and explicit accuracy
      confirmation (conflicts C-03/C-10).
- [x] Glucose freshness and clock-integrity gates (conflict C-02).
- [x] Durable repository interfaces with a Supabase-backed implementation
      (conflict C-05) - not yet exercised against a live project.
- [x] Row Level Security policies for every user-owned table.
- [x] Audit-tamper detection (`verifyChain()`, tested against a tampered
      and a reordered event).
- [x] Fault-injection test for audit-persistence failure (no dose shown).
- [x] Production build succeeds; combined API+PWA static serving verified
      locally with correct cache headers and SPA fallback.
- [x] Database checksum verified at startup; startup fails clearly if
      missing/corrupt.
- [ ] ESLint (currently aliased to typecheck only).
- [ ] True browser-DOM e2e coverage (blocked on live Supabase auth).
- [ ] Offline queue for non-clinical sync operations.

## Clinical (not startable by engineering)

- [ ] Independent clinician golden dataset reviewed and approved.
- [ ] Glucose-freshness and confirmation-expiry windows approved or
      replaced by a clinician.
- [ ] Formal risk-management file.
- [ ] Human-factors/usability validation with real patients.
- [ ] Regulatory pathway assessment.
- [ ] `CLINICIAN_REVIEW_CHECKLIST.md` fully signed off.

## Deployment (requires the repository owner's action)

- [ ] GitHub repository created and this branch pushed.
- [ ] Supabase project created, migrations applied (`supabase db push`),
      auth URLs configured.
- [ ] Railway project created, connected to the GitHub repository,
      environment variables set.
- [ ] Production smoke-test checklist (`DEPLOYMENT_RECORD.md`) completed
      against the live URL with synthetic test data only.
- [ ] Production database checksum verified to match
      `af42f35e7c9c565ae0f0b348d74d92128273498b095baf96cd7a8b8d4be23b4c`.

## Release gate

**Do not release for real-world clinical use until every box above is
checked and the clinical reviewer/regulatory reviewer/engineering authority
sign-off in `CLINICIAN_REVIEW_CHECKLIST.md` is complete.**
