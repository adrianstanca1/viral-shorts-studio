# Current local verification — 2026-10-07

Historical V2–V46 checkmarks describe prior implementation/release reports.
Current checks confirm the unit suites, competitive checks, Hermes configuration
and approval policy, Python syntax, Docker Compose configuration, and production
runtime preflight. Competitive checks inspect code signatures and cannot by
themselves establish full browser behavior, live provider allowances, publishing
credentials, current deployment health, or exact-commit CI status.

The release shell script contained literal `\n` characters around step 10,
which prevented its production preflight command from running. This repair uses
real line breaks and adds a regression test that executes the release entrypoint
with deterministic command doubles and proves a failing preflight stops release.

The 7 October review ran the full release gate with registry access. Its audit
found critical advisory GHSA-jqcg-44mw-7w3h in proxy-addr 2.0.7. The compatible
2.0.8 patch is locked, and the repeated release gate passes with zero production
dependency vulnerabilities. Unit/regression suites, Compose checks, Hermes
policy/configuration and production preflight all pass.

Remote CI, public deployment, live provider generation and publishing were not
performed. Their historical boxes must not be used to claim those external
operations are newly verified.
