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
