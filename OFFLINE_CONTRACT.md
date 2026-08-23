# Offline contract — Diabetes

Document only. Clinical safety architecture is unchanged.

| Capability | Actual behaviour |
| --- | --- |
| Launch | App shell may load from cache |
| Read | Last local readings if the app already persisted them |
| Create treatment calculations | Follows existing clinical safety path — not altered |
| Voice / AI | Not used for treatment |
| Queue writes | Existing local behaviour only |
| Requires internet | Anything that already required a server |

Do not treat this file as a new offline feature.
