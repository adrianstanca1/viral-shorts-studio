# Viral Shorts Studio
Autonomous short-form video production service inspired by modern AI video studios, focused on original workflows rather than cloning a proprietary UI.

Core niches: true crime, history, storytelling, fact checks.

Pipeline:
1. Discover topic/angle
2. Research and verify sources
3. Generate hook + 30s, 60s, or 90s script
   - 30s: 8 scenes
   - 60s: 14 scenes
   - 90s: 20 scenes
4. Create scene/storyboard plan
5. Generate visual prompts and source licensed/public-domain media
6. Generate narration/voice plan
7. Add captions, pacing, music/SFX plan
8. Render 9:16 short
9. Run quality/fact-check gate
10. Prepare title, description, hashtags, thumbnail/cover, publish plan

Autonomous mode can run the pipeline, but publishing remains approval-gated by default.

## Publish approval workflow
- Completed projects default to `pending` review when `REQUIRE_APPROVAL_BEFORE_PUBLISH=true`.
- Only projects with `qa.launchReady=true` can be approved for publishing.
- Scene regeneration, provider-candidate replacement, or variant selection invalidates prior approval and returns the project to `pending`.
- Rejections can include a review note and remain in the project export for auditability.

## Operations
- `scripts/check-providers.py` verifies configured provider authentication without printing credentials.
Runtime credentials stay outside Git in `../secrets/`; only non-secret provider status/registry metadata is versioned.

- Scene variant archive/comparison: regenerating a scene preserves the previous cut; saved variants can be previewed and restored without rerendering unaffected scenes.
## Automatic candidate selection
Important scenes (hook, midpoint, finale) generate three visual candidates by default. Candidates are scored for source relevance, license quality, visual diversity and real-motion footage; the strongest candidate is selected automatically while all candidates remain available in the browser editor for manual override. Set `autoCandidates:false` or `candidateCount:1` in the project request to disable this behavior.
## Provider-ready generative media plan
Every project now writes `generation-prompts.json` with a 9:16 visual prompt, motion prompt, beat, shot type, duration and search query for every scene. This is the stable handoff contract for future text-to-video/image-to-video providers; providers remain disabled until their free usage is verified.
## Generative provider handoff
Each completed storyboard now produces `generation-prompts.json` plus `generative-queue.json`. The queue is provider-agnostic and contains one 9:16 image-to-video request per scene, including visual prompt, motion prompt, duration, negative prompt and free-only routing policy. External AI generation remains plan-only until a provider is both configured and explicitly verified as free. Paid fallback is never automatic.


## Local AI director and styles
- Ollama runs as an isolated CPU service with `qwen3:1.7b` for fast storyboard work and `qwen3:4b` available for stronger local tasks.
- Text routing order is Ollama -> OpenRouter free-only -> NVIDIA only when explicitly generation-verified. Paid fallback is disabled.
- Higgsfield is represented as a connector handoff; the VPS does not spend Higgsfield credits automatically.
- Video styles: Documentary, Cinematic, and Whiteboard animation. Whiteboard uses the CPU-only `whiteboard-animator` engine and renders each scene with narration/captions.
- Generative media providers remain disabled until a no-charge generation path is verified at the actual generation endpoint.

## Hybrid visual director

The `hybrid` style automatically produces archival/motion and whiteboard candidates for key scenes, scores them using relevance, licensing, motion and beat suitability, then selects the strongest version while preserving alternatives in scene variant history. This gives visual variety without requiring a paid generative provider.

### Verified-free AI candidate bridge
External generation connectors can register a completed HTTPS image/video against a scene through the local API. Only records explicitly marked `verifiedFree: true` are accepted. Imported AI candidates are rendered with the scene narration/overlay and scored alongside archive-motion and whiteboard alternatives. Higgsfield, NVIDIA, Hugging Face and fal remain disabled for autonomous paid-capable calls until a no-charge path is verified per job.

## Provider job harvesting
Verified-free external generation jobs can now be registered as pending, resolved by a connector/webhook, and imported automatically into the scene candidate pool. Resolving a completed job queues only the affected scene for regeneration, preserving previous variants and keeping `paidFallback=false`.

Endpoints: `POST /api/provider-jobs`, `GET /api/provider-jobs/:id`, `POST /api/provider-jobs/:id/resolve`, and `POST /api/provider-jobs/:id/fail`.

The bridge keeps provider billing outside the render worker: connector jobs are accepted only after an explicit no-charge/free grant is used, then their HTTPS result is registered to a scene. This prevents the autonomous VPS from silently spending credits while still letting AI footage compete in the normal candidate scorer.

### Free AI scene budget manager
The studio can rank finished scenes for cloud AI enhancement without spending blindly. `GET /api/projects/:id/ai-generation-plan` previews priorities; `POST` stores a plan and can create deduplicated pending provider jobs when `createJobs:true`. Planning favors hook/payoff and weak visual scores, skips scenes that already have AI or strong visuals, and always records `freeOnly:true` / `paidFallback:false`. Provider results are harvested later through the verified-free provider job bridge.

### Provider job reliability and security

Provider result ingestion now validates public HTTPS URLs, rejects local/private literal IP targets, validates image/video result kinds before changing job state, and preserves AI provider/score metadata when scene variants are archived or restored. `GET /api/provider-jobs` also returns a filtered job list (`status`, `provider`, `projectId`) alongside queue counts so an external free-provider worker can safely harvest pending jobs. A built-in `npm test` self-test covers the free-only job lifecycle, URL guardrails and AI scene-budget selection.

### AI provider queue orchestration
Terminal provider-job records are retained for 30 days by default (`PROVIDER_JOB_RETENTION_DAYS`) and then pruned; pending/leased jobs are never retention-pruned. Jobs whose project has been removed are retired safely before cleanup.

Provider jobs now support priority scheduling, worker leases, safe release/retry, TTL expiry, and stale-lease recovery. Workers can claim up to eight verified-free jobs through `POST /api/provider-jobs/claim`; completed results continue through the existing resolve endpoint and automatically re-enter scene competition. The browser metrics show the live AI queue and project-level free-cloud plan. Paid fallback remains disabled.

### Autonomous provider worker
The Docker stack includes an isolated `provider-worker` service that claims only providers explicitly marked both enabled and verified-free. Direct Hugging Face and NVIDIA image adapters are implemented but remain disabled until zero-cost generation is explicitly verified. Generated media is stored in the shared private volume, registered as a trusted local AI candidate, scored against archive/whiteboard candidates, and can trigger scene-only re-rendering. Higgsfield remains connector-only because the VPS does not have a verified no-charge direct API path.

### Zero-cost provider verification
The studio maintains `/app/data/provider-verification.json` as a runtime evidence ledger. Authentication checks for Hugging Face and NVIDIA run on startup and every 15 minutes, but authentication alone never enables generation. A provider is promoted only when there is explicit zero-cost evidence with remaining allowance. Higgsfield connector allowances can be recorded through the protected evidence endpoint; connector-only providers remain non-executable on the VPS. `GET /api/provider-verification` exposes the current evidence and worker eligibility without revealing credentials.

### Automatic verified-free routing

The studio now chooses cloud providers from the live zero-cost verification ledger instead of a hard-coded provider. Active pending/leased jobs reserve free allowance so the system cannot oversubscribe a one-generation grant. Evidence expires automatically, direct adapters only activate while current zero-cost evidence remains valid, and successful direct jobs decrement the tracked allowance. Completed projects are revisited periodically so newly available verified-free capacity can enhance eligible scenes automatically without paid fallback.

### Ollama local + cloud and Hugging Face cloud
Text routing now supports both local Ollama models and Ollama Cloud through the same studio router. Local Qwen remains first priority. Ollama Cloud is available as `ollama-cloud` when a valid cloud API key is configured; it fails closed on authentication errors. Hugging Face Inference Providers are also supported as a guarded cloud text fallback with a configurable daily call cap. HF routed inference uses monthly free credits and is therefore disabled by default if the account has no usable free credit. Neither route can silently become a paid fallback.

### Text model portfolio
The text router is task-aware and local-first. Qwen3 1.7B handles fast work, Qwen3 4B handles stronger/safety-sensitive storyboarding, and guarded cloud portfolios are prepared for Ollama Cloud and Hugging Face. Cloud providers use circuit breakers on authentication/quota failures and remain disabled unless their explicit runtime gates are enabled; no paid fallback is allowed.

### OAuth-capable model tools
The VPS now includes the official Gemini CLI and OpenAI Codex CLI for their supported interactive OAuth flows. Their consumer OAuth credentials are kept separate from Viral Shorts runtime inference: Google explicitly restricts third-party apps from piggybacking on Gemini CLI OAuth, and ChatGPT/Codex sign-in is not treated as free general-purpose OpenAI API capacity. OpenRouter is different: its official PKCE OAuth flow exchanges authorization for a user-controlled API key, so the studio now maintains a live zero-price OpenRouter model catalog and can use that key once OAuth is completed through an HTTPS callback.

## Owner authentication and request hardening
The studio now has optional single-owner session authentication for public deployment. Set `APP_AUTH_SECRET` to a random value of at least 24 characters to enable the `/login` flow; the browser receives an HttpOnly, SameSite=Strict session cookie. Before exposing the studio through a public domain or reverse proxy, set `PUBLIC_LAUNCH=true`; the server will then fail closed at startup unless a valid owner secret is present. Set `FORCE_SECURE_COOKIE=true` when the public entry point is HTTPS. `WRITE_RATE_LIMIT` controls the default mutating-request allowance per five-minute window (default 120). Health checks remain unauthenticated, while provider-worker calls can continue using the separate `PROVIDER_WORKER_TOKEN`. Security headers are emitted on all responses.
