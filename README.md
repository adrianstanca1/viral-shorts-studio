# Viral Shorts Studio
Autonomous short-form video production service inspired by modern AI video studios, focused on original workflows rather than cloning a proprietary UI.

Core niches: true crime, history, storytelling, fact checks.

Pipeline:
1. Discover topic/angle
2. Research and verify sources
3. Generate hook + 30s, 60s, or 90s script
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

