# Launch Validation — 2026-09-15

## Non-blocking capacity benchmark
Source: 22 completed production projects with cache-only/reuse samples excluded. The benchmark starts no render jobs and extrapolates from observed stage timings plus deterministic scene counts.

| Target | Scenes | P50 estimate | P75 conservative |
| --- | ---: | ---: | ---: |
| 30 seconds | 8 | 37.5 s | 88.8 s |
| 5 minutes | 40 | 157.4 s | 239.1 s |
| 20 minutes | 160 | 607.1 s | 802.6 s |

Observed scene render time was 3.75 s/scene at P50 and 4.70 s/scene at P75. Container limits were detected as 4 CPUs and 6144 MB memory. Scene concurrency is now resource-aware: on the production limit it uses two workers for short/medium renders and one worker for 20-minute class renders, with each FFmpeg scene render capped at two threads.

## Public launch smoke checks
- `/api/health`: HTTP 200.
- `/`: HTTP 302 to owner authentication when unauthenticated.
- `/api/stats`: HTTP 401 when unauthenticated.
- `/recover-owner`: HTTP 200.
- Publishing gate: pending approval rejects publish-job creation; approved launch-ready content creates a private/manual publish job; external posting remains disabled by default.

## Safety invariants
- Paid fallback remains disabled.
- Provider execution requires current verified-free evidence and a successful fresh provider smoke test.
- Provider smoke tests refuse to run unless authentication and verified-free allowance are already proven.
- Human approval remains required before publishing.
