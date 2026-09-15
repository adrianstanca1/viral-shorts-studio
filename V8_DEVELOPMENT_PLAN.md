# Creator OS V8 Development Plan

## V8.1 Neural Local Voice Engine
- [x] Install pinned Piper runtime in the production image.
- [x] Bundle verified local neural voices for English, French, Spanish, Italian, German and Romanian.
- [x] Route auto narration to language-matched Piper voices with Flite fallback.
- [x] Expose neural voices in Voice Studio and project creation.
- [x] Run production synthesis smoke tests for every bundled language.

## V8.2 External Publishing
- [x] Add owner-configurable TikTok connector without weakening approval gates.
- [ ] Add owner-configurable Instagram Reels connector without weakening approval gates.
- [ ] Keep manual distribution packages as fallback when a connector is unavailable.

## V8.3 Release Assurance
- [ ] Add V8 voice routing and external connector policy checks to release gate.
- [ ] Deploy, verify health, and confirm exact GitHub Actions result.
