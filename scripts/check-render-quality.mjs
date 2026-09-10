#!/usr/bin/env node
/**
 * Regression guard for the render-quality path in src/main.js.
 *
 * This exists because a bug here already shipped once: detectGpuTier() used
 * `navigator.deviceMemory || 4` as a fallback, and since Safari does not
 * implement that API at all, every iPhone and iPad was read as a 4GB device,
 * demoted below the top tier, and silently lost MSAA. The lesson encoded in
 * these tests is that ABSENT capability information must never be treated as
 * evidence of a weak GPU.
 *
 * Run: node scripts/check-render-quality.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

let pass = 0, fail = 0;
const check = (ok, name, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

// ---------------------------------------------------------------- GPU tiering
const tierSrc = src.slice(src.indexOf('function detectGpuTier()'), src.indexOf('\nconst gpuTier ='));
if (!tierSrc) { console.error('could not locate detectGpuTier() in src/main.js'); process.exit(1); }

function tierFor(desc, cores, mem) {
  const document = { createElement: () => ({ getContext: () => ({
    getExtension: () => (desc === null ? null : { UNMASKED_RENDERER_WEBGL: 37446 }),
    getParameter: () => (desc === null ? '' : desc),
  })})};
  const navigator = { hardwareConcurrency: cores };
  if (mem !== undefined) navigator.deviceMemory = mem;
  return new Function('document', 'navigator', tierSrc + '; return detectGpuTier();')(document, navigator);
}

// desc === null models a browser that withholds WEBGL_debug_renderer_info.
// mem === undefined models Safari, which does not implement deviceMemory.
const TIERS = [
  ['low',  'Intel HD 4000 (ThinkPad)',  'ANGLE (Intel, Intel(R) HD Graphics 4000, D3D11)', 4, 4],
  ['low',  'Intel UHD 620',             'ANGLE (Intel, Intel(R) UHD Graphics 620, D3D11)', 8, 8],
  ['low',  'SwiftShader',               'ANGLE (Google, Vulkan (SwiftShader Device))', 8, 8],
  ['low',  'llvmpipe',                  'Mesa/X.org, llvmpipe (LLVM 15.0.7, 256 bits)', 8, 8],
  ['low',  'Mali-T880',                 'Mali-T880', 8, 4],
  ['low',  'Adreno 505',                'Adreno (TM) 505', 8, 3],
  ['high', 'Iris Xe (not demoted)',     'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, D3D11)', 8, 16],
  ['high', 'Intel Arc (not demoted)',   'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics, D3D11)', 16, 16],
  ['high', 'RTX 4070',                  'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070, D3D11)', 16, 32],
  ['high', 'Apple silicon',             'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro)', 15, 16],
  ['high', 'Adreno 740',                'Adreno (TM) 740', 8, 12],
  // The regression cases: Safari withholds the renderer string and deviceMemory.
  ['high', 'iPhone Safari, 4 cores',    null, 4, undefined],
  ['high', 'iPhone Safari, 6 cores',    null, 6, undefined],
  ['high', 'iPad Safari, 8 cores',      null, 8, undefined],
  ['high', 'Safari reporting Apple GPU','Apple GPU', 4, undefined],
  ['high', 'Firefox, ext blocked',      null, 8, 8],
];
for (const [want, name, desc, cores, mem] of TIERS) {
  const got = tierFor(desc, cores, mem);
  check(got === want, `tier ${want.padEnd(4)} — ${name}`, got === want ? '' : `(got ${got})`);
}

// ------------------------------------------------------------- pixel-ratio cap
const capLine = src.split('\n').find(l => l.startsWith('const baseDprCap'));
const capFor = (tier, handheld) => new Function('gpuTier', 'isHandheldDevice',
  capLine.replace(/^const baseDprCap = /, 'return ').replace(/;$/, ''))(tier, handheld);

// What this file shipped before the low-end optimisation work.
const baseline = (handheld, dpr) => Math.min(dpr, handheld ? 1.5 : 2.0);
const effective = (tier, handheld, dpr) => Math.min(dpr, capFor(tier, handheld));

check(effective('high', true, 3) === 3, 'iPhone DPR 3 renders at native resolution',
  `(was ${baseline(true, 3)}, now ${effective('high', true, 3)})`);
check(effective('high', true, 2) === 2, 'iPad DPR 2 renders at native resolution');
check(effective('high', false, 2) === 2, 'Retina desktop unchanged at 2.0');
check(effective('low', false, 2) === 1, 'weak GPU still capped at 1.0');

// A downgrade must never land below the pre-optimisation baseline on a handheld.
const steps = JSON.parse(src.match(/const QUALITY_STEPS = (\[[^\]]+\]);/)[1]);
const floor = Math.min(...steps);
check(effective('high', true, 3) * floor >= baseline(true, 3),
  'fully-downgraded handheld still beats the old baseline',
  `(${(effective('high', true, 3) * floor).toFixed(2)} >= ${baseline(true, 3)})`);

// ------------------------------------------------------------------- guardrails
check(/antialias: gpuTier !== 'low'/.test(src), "MSAA enabled unless GPU positively identified as weak");
// Strip line comments first: both of these terms legitimately appear in the
// prose explaining why they must not appear in the logic.
const code = src.split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');
check(!/deviceMemory/.test(code), 'no deviceMemory heuristic (unimplemented in Safari)');
check(!/'mid'/.test(code), "no 'mid' tier (it only existed to encode the bad heuristic)");
check(/document\.hidden \|\| dt > 0\.25/.test(src), 'adaptive sampler ignores hidden tabs and stall frames');
check(/qualityBadWindows >= 2/.test(src), 'adaptive sampler needs two consecutive bad windows');
check((src.match(/\.anisotropy = maxAnisotropy;/g) || []).length === 6,
  'anisotropic filtering applied to all 6 CanvasTextures');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
