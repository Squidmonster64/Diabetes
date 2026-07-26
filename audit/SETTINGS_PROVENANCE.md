# Settings provenance

Every clinician-report settings version establishes, per
`BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md` section 13.5:

| Requirement | Field(s) | Enforced by |
|---|---|---|
| Who supplied the settings | `patientId` | Foreign key to `auth.users`; RLS scopes all access to `auth.uid() = patient_id` |
| For DIA, patient-transcribed from consultation or report | `insulinDurationEntrySource` | Closed enum: `PATIENT_ENTERED_FROM_CLINICIAN_CONSULTATION` \| `PATIENT_ENTERED_FROM_CLINICIAN_REPORT`; `validateSettings` refuses any other value |
| Source date/reference and patient accuracy-confirmation timestamp | `insulinDurationSourceDate`, `insulinDurationSourceReference`, `insulinDurationPatientConfirmedAccurate`, `insulinDurationPatientConfirmedAt` | `insulinDurationPatientConfirmedAccurate` must be `true` - enforced by a database check constraint (`clinician_configurations_dia_confirmed`) *and* by `validateSettings` at calculation time |
| Who approved settings (where a direct approval workflow exists) | `approvedBy`, `approvedAt` | Optional - not required solely for patient transcription of DIA (handoff section 7.1) |
| Which patient they belong to | `patientId` | As above |
| When they became effective | `effectiveAt` | Set at creation |
| Whether expired/revoked/superseded | `status`, `expiresAt`, `revokedAt`, `supersededAt` | `validateSettings` gate 4 |
| Integrity checksum | `configurationChecksum` | `computeConfigurationChecksum()` (SHA-256 over the canonical clinical fields); recomputed and compared on every calculation |
| Which settings version was used for each calculation | `settingsId`, `settingsVersion` on every `BolusSuccess`/`BolusRefusal` | Recorded on every calculation result |

## Versioning invariants

- `version` is unique per patient and strictly increasing (enforced by a
  unique constraint and, in the Supabase-backed repository, by reading the
  current maximum version before inserting).
- At most one row per patient has `status = 'ACTIVE'`, enforced by the
  partial unique index `clinician_configurations_one_active_per_patient`
  (see `supabase/migrations/0002_clinician_configurations.sql`).
- A settings change always creates a **new** version; the previous version
  is marked `SUPERSEDED` with `supersededAt` set - it is never overwritten
  or deleted. See `audit/TEST_RESULTS.md`'s "settings versioning" coverage.
- Historical calculations remain tied to the settings version that produced
  them (`configuration_version` on the `calculations` table) - a later
  settings change never rewrites a past calculation.

## Patient-entered wording

The UI (`SettingsScreen.tsx`, `SettingsConfirmationScreen.tsx`) uses the
required wording verbatim: *"Patient-entered value copied from a
clinician-approved report or treatment plan"* and requires the explicit
confirmation statement *"This DIA matches my current clinician advice"*
before a new version can be saved. The app never suggests, derives, or
pre-fills a value for any of the eight clinician-supplied settings.
