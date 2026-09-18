#!/usr/bin/env node
/**
 * Viral Shorts Studio — Production Orchestrator
 * 
 * Uses Claude Code (subagent) for storyboard ideation and creative direction,
 * OpenRouter gpt-4o-mini for narration drafting, and the pipeline for rendering.
 * 
 * Usage:
 *   node produce.mjs <topic> [duration] [style]
 *   node produce.mjs "The Boy in the Box" 60 documentary
 */

import { produceProject } from './app/pipeline.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DATA = process.env.DATA_DIR || '/root/viral-shorts-data';
const PROJECTS = path.join(DATA, 'projects');

// ── Cloud model storyboarding via Claude Code subagent ──────────────────────
async function claudeStoryboard(topic, duration, niche, sources, style) {
  const targetScenes = duration <= 30 ? 8 : duration <= 60 ? 14 : 20;
  
  // Use Claude Code in print mode for storyboard ideation
  const prompt = `You are a true-crime documentary screenwriter. Write a ${targetScenes}-scene storyboard for a ${duration}-second YouTube Short about: "${topic}".

Niche: ${niche}. Style: ${style}. Sources available: ${sources.slice(0,5).map(s => `${s.title} (${s.extract.slice(0,200)})`).join(' | ')}.

Return ONLY a JSON array of ${targetScenes} scenes. Each scene must have:
- "index": scene number (1-based)
- "beat": one of hook, setup, context, evidence, escalation, payoff
- "narration": 8-25 words, factual, sourced from provided sources only. NEVER invent allegations, quotes, or dramatic claims. Each scene must reference a real fact.
- "overlay": max 72 chars, supporting text for on-screen caption
- "sourceIndex": integer pointing to a source above, or null if general knowledge

Rules:
- Scene 1 MUST be a factual curiosity hook (what most people miss)
- Final scene MUST resolve why the story matters using sourced facts
- Avoid vague pronouns. No repeated facts across scenes.
- For true-crime: respect victims, no sensationalism

The narration should be tight, compelling, and factually grounded. Think Dateline or 20/20 tone — professional, respectful, gripping.`;
  
  try {
    const result = execSync(`claude -p '${prompt.replace(/'/g, "'\\''")}' --output-format json --max-turns 10 --allowedTools 'Read,Write,Bash' 2>/dev/null`, {
      timeout: 60000,
      encoding: 'utf8'
    });
    const json = JSON.parse(result);
    if (json.subtype === 'success' || json.type === 'result') {
      const text = json.result || '';
      // Extract JSON array from response
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const scenes = JSON.parse(match[0]);
        console.log(`  Claude Code storyboard: ${scenes.length} scenes generated`);
        return scenes;
      }
    }
  } catch (e) {
    console.log(`  Claude Code failed: ${e.message.slice(0,100)}`);
  }
  return null;
}

// ── OpenRouter storyboard fallback ──────────────────────────────────────────
async function openRouterStoryboard(topic, duration, niche, sources, style) {
  const { OpenAI } = await import('openai');
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('No OPENROUTER_API_KEY');
  
  const client = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: key });
  
  const targetScenes = duration <= 30 ? 8 : duration <= 60 ? 14 : 20;
  const compactSources = sources.slice(0, 8).map((s, i) => ({ index: i, title: s.title, extract: String(s.extract || '').slice(0, 500) }));
  
  const completion = await client.chat.completions.create({
    model: 'openai/gpt-4o-mini',
    messages: [
      { role: 'system', content: `You are a ${niche} documentary screenwriter. Write a ${targetScenes}-scene storyboard for a ${duration}-second vertical video. Return ONLY a JSON array of scenes with: index, beat, narration (8-25 words, factual, sourced), overlay (max 72 chars), sourceIndex. Scene 1 = curiosity hook. Final scene = why it matters. Never invent allegations or quotes. Respect victims in true-crime.` },
      { role: 'user', content: JSON.stringify({ topic, duration, niche, style, sources: compactSources }) }
    ],
    max_tokens: targetScenes * 200,
    temperature: 0.7,
    response_format: { type: 'json_object' }
  });
  
  const text = completion.choices[0].message.content;
  const data = JSON.parse(text);
  const scenes = data.scenes || data || [];
  console.log(`  OpenRouter storyboard: ${scenes.length} scenes (gpt-4o-mini)`);
  return scenes;
}

// ── Main production entry point ─────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const topic = args[0] || 'The Boy in the Box — America\'s longest unidentified child murder case, Philadelphia 1957';
  const duration = parseInt(args[1]) || 60;
  const style = args[2] || 'documentary';
  const niche = args[3] || 'true-crime';
  
  console.log('='.repeat(60));
  console.log(`Viral Shorts Studio — Production`);
  console.log(`Topic: ${topic}`);
  console.log(`Duration: ${duration}s | Style: ${style} | Niche: ${niche}`);
  console.log(`DataProvider: OpenRouter gpt-4o-mini (primary), Claude Code (creative)`);
  console.log('='.repeat(60));
  
  // Step 1: Research
  console.log('\n[1/4] Researching...');
  const { researchTopic } = await import('./app/pipeline.mjs');
  const sources = await researchTopic(topic);
  console.log(`  Found ${sources.length} sources`);
  
  // Step 2: Storyboard via cloud models
  console.log('\n[2/4] Storyboarding (cloud models)...');
  let storyboard;
  
  // Try Claude Code first for creative direction
  const claudeScenes = await claudeStoryboard(topic, duration, niche, sources, style);
  if (claudeScenes && claudeScenes.length >= 8) {
    storyboard = claudeScenes.map((s, i) => ({
      index: i + 1,
      beat: s.beat || (i === 0 ? 'hook' : i === targetScenes - 1 ? 'payoff' : 'evidence'),
      narration: s.narration,
      overlay: s.overlay || s.narration.slice(0, 72),
      sourceIndex: s.sourceIndex ?? null,
      searchQuery: `${topic} ${s.narration.split(' ').slice(0,5).join(' ')}`,
      visualPrompt: `${style} vertical video about ${topic}. ${s.narration}. Historically accurate, no visible text.`,
      motionPrompt: 'slow cinematic push-in with subtle parallax',
      camera: 'slow push in',
      durationHint: (duration / targetScenes).toFixed(2),
      style, mode: 'multi-scene', language: 'en', aspect: '9:16', voice: 'auto', captionStyle: 'bold',
      narrationQuality: {}, assets: []
    }));
  } else {
    // Fallback to OpenRouter
    const orScenes = await openRouterStoryboard(topic, duration, niche, sources, style);
    storyboard = orScenes.map((s, i) => ({
      index: i + 1,
      beat: s.beat || (i === 0 ? 'hook' : i === orScenes.length - 1 ? 'payoff' : 'evidence'),
      narration: s.narration,
      overlay: s.overlay || s.narration.slice(0, 72),
      sourceIndex: s.sourceIndex ?? null,
      searchQuery: `${topic} ${s.narration.split(' ').slice(0,5).join(' ')}`,
      visualPrompt: `${style} vertical video about ${topic}. ${s.narration}. Historically accurate, no visible text.`,
      motionPrompt: 'slow cinematic push-in with subtle parallax',
      camera: 'slow push in',
      durationHint: (duration / orScenes.length).toFixed(2),
      style, mode: 'multi-scene', language: 'en', aspect: '9:16', voice: 'auto', captionStyle: 'bold',
      narrationQuality: {}, assets: []
    }));
  }
  
  if (!storyboard || storyboard.length < 4) {
    console.error('ERROR: Could not generate storyboard');
    process.exit(1);
  }
  
  // Step 3: Render via pipeline
  console.log('\n[3/4] Rendering scenes...');
  const project = {
    id: `ep-${Date.now()}`,
    topic,
    niche,
    duration,
    style,
    mode: 'multi-scene',
    language: 'en',
    aspect: '9:16',
    voice: 'auto',
    captionStyle: 'bold',
    sources,
    storyboard,
    autoCandidates: 2,
    creatorContext: `${niche} documentary. ${style} style. Factually accurate, engaging, platform-optimized.`
  };
  
  const update = (p) => {
    const status = (p.status || '').padEnd(20);
    const prog = p.progress != null ? p.progress : '';
    console.log(`  [${status}] ${prog}`);
  };
  
  const result = await produceProject(project, DATA, update);
  
  // Step 4: Finalize
  console.log('\n[4/4] Finalizing...');
  const dir = path.join(DATA, 'projects', result.id);
  const listPath = path.join(dir, 'final-list.txt');
  
  // Build concat list
  const lines = result.scenes.filter(s => s.file && fs.existsSync(s.file)).map(s => `file '${s.file}'`);
  fs.writeFileSync(listPath, lines.join('\n') + '\n');
  
  // Assemble
  try {
    execSync(`ffmpeg -y -f concat -safe 0 -i ${listPath} -c copy ${dir}/assembled.mp4`, { cwd: dir });
    
    // Trim to duration
    execSync(`ffmpeg -y -i ${dir}/assembled.mp4 -t ${duration - 0.5} -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 160k -movflags +faststart ${dir}/final.mp4`, { cwd: dir });
    
    const info = fs.statSync(path.join(dir, 'final.mp4'));
    console.log(`\n=== COMPLETE ===`);
    console.log(`File: ${path.join(dir, 'final.mp4')}`);
    console.log(`Size: ${(info.size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`Duration: ${duration - 0.5}s (YouTube Shorts ready: ${duration - 0.5 <= 60})`);
    console.log(`Virality score: ${result.qa?.viralityScore}/100`);
    console.log(`Launch ready: ${result.qa?.launchReady}`);
    console.log(`Scenes: ${result.qa?.sceneCount}, Accepted: ${result.qa?.acceptedScenes}`);
    console.log(`Publish: ${result.publish?.title}`);
    console.log(`\nDone in ${result.metrics?.totalSeconds?.toFixed(1)}s`);
  } catch (e) {
    console.error('Assembly failed:', e.message);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
