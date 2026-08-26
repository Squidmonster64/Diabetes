# Banana / bread / butter quantity binding

- **original phrase:** two bananas and two slices of white bread with 50 grams of butter
- **actual interpretation (historical):** ingredient loss or quantity reassignment
- **expected interpretation:** banana ×2 whole; white bread ×2 slice; butter 50 g; no invented nutrition
- **root cause:** meal parse must bind quantity before food-database lookup
- **fix version:** meal parser P0 + semantic-events-v1
- **regression test ID:** SEM-051, parse-meal golden, semantic-known-failures
