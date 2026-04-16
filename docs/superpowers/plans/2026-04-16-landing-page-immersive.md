# GALAXIA Immersive 3D Landing Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current static landing page with an immersive 3D particle galaxy experience featuring voice-reactive particles and camera-based hand gesture navigation.

**Architecture:** Single HTML file (`/opt/galaxia/packages/web/public/index.html`) with inline CSS + JS. Three.js for WebGL, Web Audio API for mic, MediaPipe Hands (lazy-loaded) for gestures. Three performance tiers auto-detected at load.

**Tech Stack:** Three.js r170 (ES module CDN), MediaPipe Hands 0.4 (lazy CDN), Web Audio API (native), vanilla CSS/JS, Google Fonts (Fraunces + Outfit + JetBrains Mono)

**Spec:** `/opt/galaxia/docs/superpowers/specs/2026-04-16-landing-page-immersive-design.md`

**Server:** Express static server at `/opt/galaxia/packages/web/src/index.ts` — serves `/opt/galaxia/packages/web/public/` on port 3080. No changes needed.

**Verify in browser:** http://localhost:3080 (or https://galaxia.ai-deskflow.com)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Replace | `/opt/galaxia/packages/web/public/index.html` | Entire landing page (HTML + CSS + JS) |

Single file. ~1500 lines expected. All CSS inline in `<style>`, all JS inline in `<script type="module">`.

---

### Task 1: HTML Skeleton + CSS + GPU Tier Detection

**Files:**
- Replace: `/opt/galaxia/packages/web/public/index.html`

Build the empty page structure with all CSS, the GPU benchmark, and tier detection. No Three.js yet — just the HTML shell and the performance system.

- [ ] **Step 1: Write the full HTML skeleton with all CSS**

Create `/opt/galaxia/packages/web/public/index.html` with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GALAXIA — Your AI Company in a Box</title>
<meta name="description" content="Install GALAXIA. Describe your idea. 10 AI agents build, deploy, and grow it autonomously. Open source, $0/month AI cost.">
<meta name="theme-color" content="#06080F">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

CSS variables (all in `:root`):
```css
:root {
  --void: #06080F;
  --cosmos: #0E1525;
  --nebula: #141E35;
  --gold: #C9973E;
  --gold-bright: #E8B94A;
  --gold-dim: rgba(201,151,62,.12);
  --gold-line: rgba(201,151,62,.18);
  --teal: #3EDBC6;
  --teal-dim: rgba(62,219,198,.08);
  --star: #F5F0E6;
  --star-mid: #BDB8AC;
  --dust: #6B7089;
  --dust-faint: #3D4259;
  --serif: 'Fraunces', Georgia, serif;
  --sans: 'Outfit', system-ui, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

Key CSS blocks to include:
- Reset (`*`, `box-sizing`, `margin:0`)
- `::selection` with gold highlight
- `body::after` grain overlay (SVG noise texture, `opacity:.035`, `pointer-events:none`, `z-index:9999`)
- `#galaxy-canvas` — `position:fixed; inset:0; z-index:0`
- `#overlay` — `position:relative; z-index:1; min-height:100vh; display:flex; align-items:center; justify-content:center`
- `.nav` — fixed top, transparent → frosted glass on scroll
- `.hero-content` — centered, max-width 860px, text-align center
- `.immersive-bar` — centered, flexbox, gold top border
- `.heartbeat-mic` — 48px circle, gold border, pulse keyframes
- `.camera-btn` — 48px circle, teal border
- All below-fold section styles (`.how`, `.pricing`, `.cta`, `.footer`) — reuse styles from current page
- Scroll reveal classes (`.reveal` with opacity/transform transition, `.vis` for visible state)
- Responsive breakpoints at 768px and 480px
- Scrollbar styling (thin, gold thumb)

Body structure:
```html
<body>
  <canvas id="galaxy-canvas"></canvas>

  <div id="overlay">
    <nav class="nav" id="nav"><!-- nav content --></nav>
    <section class="hero" id="hero">
      <div class="hero-content">
        <!-- hero badge, h1, subtitle, terminal, stats, CTAs -->
      </div>
    </section>
  </div>

  <!-- Agent labels container (positioned dynamically by JS) -->
  <div id="agent-labels"></div>

  <!-- Immersive bar -->
  <section class="immersive-bar" id="immersive-bar">
    <!-- heartbeat mic, text, camera button -->
  </section>

  <!-- Below-fold content -->
  <main>
    <section class="how" id="how"><!-- 3 steps --></section>
    <section class="pricing" id="pricing"><!-- 3 cards --></section>
    <section class="cta" id="cta"><!-- terminal + waitlist --></section>
    <footer class="footer"><!-- links --></footer>
  </main>

  <!-- Camera preview (hidden until activated) -->
  <div id="camera-preview" style="display:none">
    <video id="camera-feed" autoplay playsinline></video>
  </div>

  <!-- Finger cursor (hidden until hand tracking active) -->
  <div id="finger-cursor" style="display:none"></div>

  <script type="module">
    // Will be filled in subsequent tasks
  </script>
</body>
```

Fill in ALL the HTML content for: nav, hero (badge, title, subtitle, rule, terminal, stats, CTAs), immersive bar (heartbeat mic with SVG, "Parle-moi" text, camera button with SVG), How It Works (3 steps with code blocks), Pricing (3 cards with all features listed), CTA (terminal, buttons, waitlist form, note), Footer (links, meta).

Fill in ALL the CSS. This is the largest part of this task. Every class referenced in the HTML must have its styles defined. Use the current page's styles as reference for below-fold sections, adapted to the gold/teal palette.

- [ ] **Step 2: Write the GPU tier detection script**

Inside the `<script type="module">` block, add:

```javascript
// ══════════ TIER DETECTION ══════════
function detectTier() {
  // Mobile check
  const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent);
  if (isMobile) return 'mobile';

  // WebGL check
  const testCanvas = document.createElement('canvas');
  const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
  if (!gl) return 'mobile';

  // GPU benchmark: render 10K points for 10 frames, measure time
  const size = 128;
  testCanvas.width = size;
  testCanvas.height = size;

  const vertices = new Float32Array(10000 * 3);
  for (let i = 0; i < vertices.length; i++) vertices[i] = Math.random() * 2 - 1;

  const vs = `attribute vec3 p;void main(){gl_PointSize=1.0;gl_Position=vec4(p,1.0);}`;
  const fs = `precision lowp float;void main(){gl_FragColor=vec4(1.0);}`;

  const vShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vShader, vs);
  gl.compileShader(vShader);
  const fShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fShader, fs);
  gl.compileShader(fShader);
  const prog = gl.createProgram();
  gl.attachShader(prog, vShader);
  gl.attachShader(prog, fShader);
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);

  // Warm up
  for (let i = 0; i < 3; i++) {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, 10000);
  }
  gl.finish();

  // Benchmark
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, 10000);
  }
  gl.finish();
  const avg = (performance.now() - t0) / 10;

  // Cleanup
  gl.deleteBuffer(buf);
  gl.deleteProgram(prog);
  gl.deleteShader(vShader);
  gl.deleteShader(fShader);
  testCanvas.remove();

  if (avg < 8) return 'full';
  if (avg < 16) return 'light';
  return 'mobile';
}

const TIER = detectTier();
console.log(`GALAXIA: Running in ${TIER} mode`);

const TIER_CONFIG = {
  full:   { particles: 50000, bloom: true, attraction: true },
  light:  { particles: 10000, bloom: false, attraction: false },
  mobile: { particles: 2000, bloom: false, attraction: false }
};
const CONFIG = TIER_CONFIG[TIER];
```

- [ ] **Step 3: Verify in browser**

Open http://localhost:3080. Check:
- Page loads with all content visible (no Three.js yet, just HTML)
- Console shows `GALAXIA: Running in [full/light/mobile] mode`
- All sections render correctly: nav, hero, immersive bar, how it works, pricing, CTA, footer
- Fonts load (Fraunces italic for titles, Outfit for body)
- Grain overlay visible (subtle noise texture)
- Responsive: shrink to mobile width, verify layout stacks

- [ ] **Step 4: Commit**

```bash
git add packages/web/public/index.html
git commit -m "feat: landing page skeleton with CSS and GPU tier detection"
```

---

### Task 2: Three.js Scene + Particle Vortex Galaxy

**Files:**
- Modify: `/opt/galaxia/packages/web/public/index.html` (add to `<script type="module">`)

Set up the Three.js scene, camera, renderer, and the 50K particle spiral vortex. This is the core visual.

- [ ] **Step 1: Add Three.js import and scene setup**

At the top of the `<script type="module">`, before the tier detection code, add the CDN import. Then after tier detection, add scene setup:

```javascript
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/UnrealBloomPass.js';
```

Scene setup (after tier detection):
```javascript
// ══════════ THREE.JS SCENE ══════════
const canvas = document.getElementById('galaxy-canvas');

// Only run WebGL for full/light tiers
if (TIER !== 'mobile') {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 5);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x06080F, 1);

  // Bloom (full tier only)
  let composer = null;
  if (CONFIG.bloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.8,  // strength
      0.4,  // radius
      0.85  // threshold
    );
    composer.addPass(bloom);
  }

  // Resize handler
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  });
```

- [ ] **Step 2: Create particle vortex geometry**

```javascript
  // ══════════ PARTICLE VORTEX ══════════
  const COUNT = CONFIG.particles;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);

  // Per-particle orbital data (for animation)
  const baseAngles = new Float32Array(COUNT);
  const radii = new Float32Array(COUNT);
  const speeds = new Float32Array(COUNT);
  const zOffsets = new Float32Array(COUNT);

  const goldColor = new THREE.Color(0xC9973E);
  const tealColor = new THREE.Color(0x3EDBC6);
  const whiteColor = new THREE.Color(0xF5F0E6);

  for (let i = 0; i < COUNT; i++) {
    // Logarithmic spiral distribution
    const arm = Math.floor(Math.random() * 4); // 4 spiral arms
    const armAngle = (arm / 4) * Math.PI * 2;
    const t = Math.random();
    const r = 0.1 + Math.pow(t, 0.6) * 4.5; // radius: 0.1 to 4.6
    const spiralAngle = armAngle + t * Math.PI * 3 + (Math.random() - 0.5) * 0.8;
    const spread = (1 - t * 0.5) * 0.3; // tighter at edges

    const x = Math.cos(spiralAngle) * r + (Math.random() - 0.5) * spread;
    const y = Math.sin(spiralAngle) * r + (Math.random() - 0.5) * spread;
    const z = (Math.random() - 0.5) * 0.4 * (1 + r * 0.1);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Store orbital data
    baseAngles[i] = Math.atan2(y, x);
    radii[i] = Math.sqrt(x * x + y * y);
    speeds[i] = 0.02 / (0.5 + radii[i]); // inner particles orbit faster
    zOffsets[i] = z;

    // Color: gold at center → teal at mid → dim white at edge
    const colorT = Math.min(r / 4.5, 1);
    const color = new THREE.Color();
    if (colorT < 0.4) {
      color.lerpColors(goldColor, tealColor, colorT / 0.4);
    } else {
      color.lerpColors(tealColor, whiteColor, (colorT - 0.4) / 0.6);
    }
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    // Size: larger at center, smaller at edges
    sizes[i] = (1.5 - colorT * 1.2) * (0.8 + Math.random() * 0.4);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  // Custom shader material for variable-size points
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio * (200.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.1, d);
        gl_FragColor = vec4(vColor, alpha * 0.85);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const particles = new THREE.Points(geometry, material);
  scene.add(particles);

  // Central core glow
  const coreGeo = new THREE.SphereGeometry(0.08, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xE8B94A, transparent: true, opacity: 0.9 });
  const core = new THREE.Mesh(coreGeo, coreMat);
  scene.add(core);
```

- [ ] **Step 3: Add animation loop with orbital rotation**

```javascript
  // ══════════ ANIMATION ══════════
  const posAttr = geometry.getAttribute('position');
  let elapsed = 0;

  function animate(time) {
    requestAnimationFrame(animate);
    elapsed = time * 0.001;

    // Rotate particles in their orbits
    for (let i = 0; i < COUNT; i++) {
      const angle = baseAngles[i] + elapsed * speeds[i];
      const r = radii[i];
      posAttr.array[i * 3] = Math.cos(angle) * r;
      posAttr.array[i * 3 + 1] = Math.sin(angle) * r;
      // z stays as zOffsets[i] with subtle wave
      posAttr.array[i * 3 + 2] = zOffsets[i] + Math.sin(elapsed * 0.5 + r) * 0.02;
    }
    posAttr.needsUpdate = true;

    // Subtle camera breathing
    camera.position.z = 5 + Math.sin(elapsed * 0.3) * 0.1;

    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  }
  animate(0);

} // end if (TIER !== 'mobile')
```

- [ ] **Step 4: Verify in browser**

Open http://localhost:3080. Check:
- 50K particles form a visible spiral galaxy
- Particles rotate slowly in their orbits
- Gold center → teal mid → white edges color gradient
- Bright core at center
- Bloom glow effect (full tier)
- Camera breathes subtly (z oscillation)
- No visible lag (should be 60fps on decent GPU)
- Title text readable over the particles (text-shadow)

- [ ] **Step 5: Commit**

```bash
git add packages/web/public/index.html
git commit -m "feat: Three.js particle vortex galaxy with 50K particles"
```

---

### Task 3: Mouse Interaction — Black Hole Cursor

**Files:**
- Modify: `/opt/galaxia/packages/web/public/index.html` (add to script, inside the `if (TIER !== 'mobile')` block)

The cursor attracts particles like a gravitational pull. This is the "wow" interaction.

- [ ] **Step 1: Add mouse tracking + raycaster**

```javascript
  // ══════════ MOUSE INTERACTION ══════════
  const mouse = new THREE.Vector2(9999, 9999); // offscreen initially
  const mouseWorld = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const intersectPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  canvas.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    // Project mouse onto z=0 plane
    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(intersectPlane, mouseWorld);
  }, { passive: true });

  canvas.addEventListener('mouseleave', () => {
    mouse.set(9999, 9999);
    mouseWorld.set(9999, 9999, 0);
  });
```

- [ ] **Step 2: Add attraction physics to the animation loop**

Modify the animation loop. Replace the orbital position update with:

```javascript
    // Rotate particles in their orbits + mouse attraction
    for (let i = 0; i < COUNT; i++) {
      const angle = baseAngles[i] + elapsed * speeds[i];
      const r = radii[i];
      let tx = Math.cos(angle) * r; // target x (orbital)
      let ty = Math.sin(angle) * r; // target y (orbital)
      let tz = zOffsets[i] + Math.sin(elapsed * 0.5 + r) * 0.02;

      if (CONFIG.attraction && mouseWorld.x < 100) {
        const dx = mouseWorld.x - tx;
        const dy = mouseWorld.y - ty;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const attractRadius = 1.5;
        if (dist < attractRadius && dist > 0.01) {
          const force = 0.15 / (dist * dist + 0.1);
          const clampedForce = Math.min(force, 0.4);
          tx += dx * clampedForce;
          ty += dy * clampedForce;
          tz += (Math.random() - 0.5) * clampedForce * 0.2; // z disturbance
        }
      }

      // Smooth transition (lerp current → target for smooth trailing)
      const lerpFactor = 0.08;
      posAttr.array[i * 3] += (tx - posAttr.array[i * 3]) * lerpFactor;
      posAttr.array[i * 3 + 1] += (ty - posAttr.array[i * 3 + 1]) * lerpFactor;
      posAttr.array[i * 3 + 2] += (tz - posAttr.array[i * 3 + 2]) * lerpFactor;
    }
```

The `lerpFactor` of 0.08 creates a trailing/wake effect — particles don't snap to position, they drift smoothly. When the mouse moves away, they slowly return to orbit.

- [ ] **Step 3: Verify in browser**

Open http://localhost:3080. Check:
- Move mouse over the galaxy — particles are attracted toward cursor
- Move mouse fast — particles trail behind creating a wake
- Stop moving — particles slowly drift back to their orbits
- Mouse leaves canvas — no stuck particles
- Performance: still 60fps with attraction enabled

- [ ] **Step 4: Commit**

```bash
git add packages/web/public/index.html
git commit -m "feat: black hole cursor - mouse attracts particles"
```

---

### Task 4: Agent Stars + Interactive Labels

**Files:**
- Modify: `/opt/galaxia/packages/web/public/index.html` (add to script + add label HTML elements)

10 named agent stars brighter than regular particles, with hover labels.

- [ ] **Step 1: Define agent data and create star meshes**

```javascript
  // ══════════ AGENT STARS ══════════
  const AGENTS = [
    { name: 'Dev',         role: 'Engineer',     desc: 'Writes code, implements features, fixes bugs autonomously.', r: 0.6, angle: 0, color: 0xE8B94A, size: 0.06 },
    { name: 'CI/CD',       role: 'DevOps',       desc: 'Tests, builds, deploys. Rolls back on failure.', r: 1.8, angle: 0.5, color: 0xC9973E, size: 0.04 },
    { name: 'Test',        role: 'QA',           desc: 'Writes and runs tests. Catches bugs before prod.', r: 2.2, angle: 1.2, color: 0xC9973E, size: 0.04 },
    { name: 'Review',      role: 'Code Review',  desc: 'Reviews every change for quality and best practices.', r: 2.5, angle: 2.0, color: 0xC9973E, size: 0.04 },
    { name: 'Analyse',     role: 'Data',         desc: 'Tracks performance, finds N+1 queries, profiles resources.', r: 1.5, angle: 3.5, color: 0x3EDBC6, size: 0.04 },
    { name: 'Controle',    role: 'Security',     desc: 'SSL audit, firewall, dependency vulnerabilities.', r: 2.0, angle: 4.2, color: 0x3EDBC6, size: 0.04 },
    { name: 'Maintenance', role: 'SRE',          desc: 'Updates deps, optimizes perf, keeps everything running.', r: 2.8, angle: 4.8, color: 0x3EDBC6, size: 0.035 },
    { name: 'Veille',      role: 'Research',     desc: 'Tracks AI trends, emerging tools, GitHub stars.', r: 2.0, angle: -1.5, color: 0xF5F0E6, size: 0.04 },
    { name: 'Ideas',       role: 'Product',      desc: 'Generates features based on usage and market trends.', r: 1.3, angle: -2.2, color: 0xF5F0E6, size: 0.04 },
    { name: 'Contenu',     role: 'Content',      desc: 'UX copy, SEO content, onboarding flows that convert.', r: 1.7, angle: -0.8, color: 0xF5F0E6, size: 0.04 },
  ];

  const agentMeshes = [];
  const agentGroup = new THREE.Group();

  AGENTS.forEach((agent, idx) => {
    // Star sphere
    const geo = new THREE.SphereGeometry(agent.size, 12, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: agent.color,
      transparent: true,
      opacity: 0.95,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      Math.cos(agent.angle) * agent.r,
      Math.sin(agent.angle) * agent.r,
      0
    );
    mesh.userData = { agent, index: idx };
    agentGroup.add(mesh);
    agentMeshes.push(mesh);

    // Glow ring
    const glowGeo = new THREE.RingGeometry(agent.size * 1.5, agent.size * 2.5, 24);
    const glowMat = new THREE.MeshBasicMaterial({
      color: agent.color,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(mesh.position);
    agentGroup.add(glow);
    mesh.userData.glow = glow;
  });

  scene.add(agentGroup);
```

- [ ] **Step 2: Add HTML labels + projection logic**

In the `#agent-labels` div (already in HTML skeleton), labels will be dynamically positioned. Add CSS for labels:

```css
.agent-label {
  position: absolute;
  pointer-events: none;
  text-align: center;
  opacity: 0;
  transition: opacity 0.3s;
  transform: translate(-50%, -100%);
  padding: 0.5rem 0.75rem;
  background: rgba(6,8,15,0.85);
  border: 1px solid var(--gold-line);
  border-radius: 3px;
  backdrop-filter: blur(8px);
  z-index: 10;
}
.agent-label.visible { opacity: 1; pointer-events: auto; }
.agent-label h4 { font-family: var(--serif); font-style: italic; font-size: 0.95rem; color: var(--star); margin-bottom: 0.1rem; }
.agent-label .role { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold); margin-bottom: 0.3rem; }
.agent-label p { font-size: 0.75rem; color: var(--dust); max-width: 180px; line-height: 1.4; }
```

Create label elements and add to `#agent-labels`:
```javascript
  const labelsContainer = document.getElementById('agent-labels');
  const labelElements = AGENTS.map(agent => {
    const el = document.createElement('div');
    el.className = 'agent-label';
    el.innerHTML = `<h4>${agent.name}</h4><div class="role">${agent.role}</div><p>${agent.desc}</p>`;
    labelsContainer.appendChild(el);
    return el;
  });
```

- [ ] **Step 3: Add hover detection + label positioning in animation loop**

Add to the animation loop, after particle updates:

```javascript
    // Agent stars: orbit + label projection
    const tempV = new THREE.Vector3();
    agentMeshes.forEach((mesh, idx) => {
      const agent = AGENTS[idx];
      const orbitAngle = agent.angle + elapsed * 0.05;
      mesh.position.set(
        Math.cos(orbitAngle) * agent.r,
        Math.sin(orbitAngle) * agent.r,
        0
      );
      mesh.userData.glow.position.copy(mesh.position);

      // Pulse glow
      mesh.userData.glow.material.opacity = 0.1 + Math.sin(elapsed * 2 + idx) * 0.05;

      // Project to screen for labels
      tempV.copy(mesh.position).project(camera);
      const x = (tempV.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-tempV.y * 0.5 + 0.5) * window.innerHeight;
      labelElements[idx].style.left = x + 'px';
      labelElements[idx].style.top = (y - 20) + 'px';
    });

    // Hover detection via raycaster
    if (mouse.x < 100) {
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(agentMeshes);
      agentMeshes.forEach((m, i) => labelElements[i].classList.remove('visible'));
      if (hits.length > 0) {
        const idx = hits[0].object.userData.index;
        labelElements[idx].classList.add('visible');
        document.body.style.cursor = 'pointer';
      } else {
        document.body.style.cursor = 'default';
      }
    }
```

- [ ] **Step 4: Verify in browser**

Open http://localhost:3080. Check:
- 10 agent stars visible as bright dots in the galaxy, orbiting slowly
- Glow rings pulse subtly around each star
- Hover mouse over a star → label appears with name, role, description
- Labels follow the star's position correctly
- Cursor changes to pointer on hover
- Dev star is largest and brightest at center

- [ ] **Step 5: Commit**

```bash
git add packages/web/public/index.html
git commit -m "feat: interactive agent stars with hover labels in galaxy"
```

---

### Task 5: Web Audio — Voice Makes Galaxy Vibrate

**Files:**
- Modify: `/opt/galaxia/packages/web/public/index.html` (add to script + modify animation loop)

When the mic is activated, audio frequency data drives particle perturbation.

- [ ] **Step 1: Add mic activation handler**

```javascript
  // ══════════ WEB AUDIO — MIC → PARTICLES ══════════
  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let micActive = false;

  const micBtn = document.getElementById('mic-btn');
  const micIcon = document.getElementById('mic-icon');
  const micWave = document.getElementById('mic-wave');

  micBtn.addEventListener('click', async () => {
    if (micActive) {
      // Deactivate
      micActive = false;
      micBtn.classList.remove('active');
      if (micWave) micWave.style.display = 'none';
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      freqData = new Uint8Array(analyser.frequencyBinCount);
      micActive = true;
      micBtn.classList.add('active');
      if (micWave) micWave.style.display = 'block';
    } catch (err) {
      console.warn('Mic access denied:', err);
      micBtn.classList.add('denied');
      micBtn.title = 'Micro non disponible';
    }
  });
```

- [ ] **Step 2: Add audio-reactive particle perturbation to animation loop**

Add inside the animation loop, after the orbital position update but before `posAttr.needsUpdate`:

```javascript
    // Voice → particle vibration
    let audioEnergy = 0;
    let bassEnergy = 0;
    let trebleEnergy = 0;

    if (micActive && analyser) {
      analyser.getByteFrequencyData(freqData);
      const bins = freqData.length;
      // Bass: first quarter of bins
      for (let b = 0; b < bins / 4; b++) bassEnergy += freqData[b];
      bassEnergy = bassEnergy / (bins / 4) / 255;
      // Treble: last quarter
      for (let b = bins * 3 / 4; b < bins; b++) trebleEnergy += freqData[b];
      trebleEnergy = trebleEnergy / (bins / 4) / 255;
      // Overall
      for (let b = 0; b < bins; b++) audioEnergy += freqData[b];
      audioEnergy = audioEnergy / bins / 255;

      // Apply perturbation to particles
      for (let i = 0; i < COUNT; i++) {
        const r = radii[i];
        // Bass: large slow waves
        const bassWave = Math.sin(elapsed * 2 + r * 1.5) * bassEnergy * 0.3;
        // Treble: small fast ripples
        const trebleRipple = Math.sin(elapsed * 8 + i * 0.01) * trebleEnergy * 0.08;

        posAttr.array[i * 3] += bassWave * Math.cos(baseAngles[i]);
        posAttr.array[i * 3 + 1] += bassWave * Math.sin(baseAngles[i]);
        posAttr.array[i * 3 + 2] += trebleRipple;
      }

      // Mic button glow intensity
      micBtn.style.boxShadow = `0 0 ${20 + audioEnergy * 40}px rgba(201,151,62,${0.2 + audioEnergy * 0.5})`;
    }
```

- [ ] **Step 3: Add CSS for mic active state**

```css
.heartbeat-mic.active {
  border-color: var(--gold);
  animation: heartbeat-fast 0.8s ease-in-out infinite;
}
.heartbeat-mic.active svg { stroke: var(--gold-bright); }
.heartbeat-mic.denied { opacity: 0.3; cursor: not-allowed; }
.heartbeat-mic.denied::after {
  content: '×'; position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%); color: #ff4444; font-size: 1.2rem;
}
@keyframes heartbeat-fast {
  0%, 100% { transform: scale(1); }
  15% { transform: scale(1.12); }
  30% { transform: scale(1); }
  45% { transform: scale(1.08); }
}
#mic-wave {
  display: none; width: 60px; height: 20px; margin-top: 0.3rem;
}
```

- [ ] **Step 4: Add waveform visualization below mic button**

Add a small canvas element as `#mic-wave` inside the immersive bar HTML, below the mic button. Draw the waveform in the animation loop:

```javascript
    // Draw mic waveform
    if (micActive && analyser && micWave) {
      const wCtx = micWave.getContext('2d');
      const w = micWave.width;
      const h = micWave.height;
      wCtx.clearRect(0, 0, w, h);
      wCtx.strokeStyle = 'rgba(201,151,62,0.6)';
      wCtx.lineWidth = 1;
      wCtx.beginPath();
      const timeData = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(timeData);
      const sliceW = w / timeData.length;
      for (let j = 0; j < timeData.length; j++) {
        const v = timeData[j] / 128.0;
        const y2 = (v * h) / 2;
        if (j === 0) wCtx.moveTo(0, y2);
        else wCtx.lineTo(j * sliceW, y2);
      }
      wCtx.stroke();
    }
```

- [ ] **Step 5: Verify in browser**

Open http://localhost:3080. Check:
- Click the mic button → browser asks for mic permission
- Grant permission → mic button starts pulsing faster (heartbeat-fast animation)
- Speak / play music → particles visibly vibrate (bass = big waves, treble = small ripples)
- Waveform appears below mic button
- Mic button glows brighter with louder audio
- Stop speaking → particles calm down
- Click mic again → deactivates

- [ ] **Step 6: Commit**

```bash
git add packages/web/public/index.html
git commit -m "feat: voice-reactive galaxy - mic makes particles vibrate"
```

---

### Task 6: MediaPipe Hand Tracking — Gesture Navigation

**Files:**
- Modify: `/opt/galaxia/packages/web/public/index.html` (add to script)

Lazy-load MediaPipe Hands when camera button clicked. Detect gestures to control galaxy.

- [ ] **Step 1: Add camera button handler with lazy MediaPipe load**

```javascript
  // ══════════ MEDIAPIPE HAND TRACKING ══════════
  let handsModel = null;
  let cameraActive = false;
  let handLandmarks = null;
  let frameCount = 0;

  const camBtn = document.getElementById('cam-btn');
  const camPreview = document.getElementById('camera-preview');
  const camFeed = document.getElementById('camera-feed');
  const fingerCursor = document.getElementById('finger-cursor');

  camBtn.addEventListener('click', async () => {
    if (cameraActive) {
      cameraActive = false;
      camBtn.classList.remove('active');
      camPreview.style.display = 'none';
      fingerCursor.style.display = 'none';
      return;
    }

    camBtn.textContent = '...';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' }
      });
      camFeed.srcObject = stream;

      // Lazy load MediaPipe
      const { Hands } = await import(
        'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js'
      );

      handsModel = new Hands({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
      });

      handsModel.setOptions({
        maxNumHands: 1,
        modelComplexity: 0, // lite for performance
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      handsModel.onResults((results) => {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          handLandmarks = results.multiHandLandmarks[0];
        } else {
          handLandmarks = null;
        }
      });

      cameraActive = true;
      camBtn.classList.add('active');
      camBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
      camPreview.style.display = 'block';
      fingerCursor.style.display = 'block';

      // Process frames
      processFrame();
    } catch (err) {
      console.warn('Camera/MediaPipe failed:', err);
      camBtn.classList.add('denied');
      camBtn.title = 'Camera non disponible';
      camBtn.textContent = '';
      camBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
    }
  });

  async function processFrame() {
    if (!cameraActive || !handsModel) return;
    frameCount++;
    // Process every 3rd frame for performance
    if (frameCount % 3 === 0) {
      await handsModel.send({ image: camFeed });
    }
    requestAnimationFrame(processFrame);
  }
```

- [ ] **Step 2: Add gesture detection + galaxy control**

```javascript
  // Gesture detection helper
  function detectGesture(landmarks) {
    if (!landmarks) return { type: 'none' };

    const tips = [4, 8, 12, 16, 20]; // thumb, index, middle, ring, pinky tips
    const pips = [3, 6, 10, 14, 18]; // PIP joints

    // Check which fingers are extended
    const extended = tips.map((tip, i) => {
      if (i === 0) {
        // Thumb: compare x (horizontal)
        return Math.abs(landmarks[tip].x - landmarks[pips[i]].x) > 0.05;
      }
      return landmarks[tip].y < landmarks[pips[i]].y; // finger above PIP = extended
    });

    const allExtended = extended.every(e => e);
    const onlyIndex = extended[1] && !extended[2] && !extended[3] && !extended[4];

    // Pinch: thumb tip close to index tip
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const pinchDist = Math.sqrt(
      (thumbTip.x - indexTip.x) ** 2 + (thumbTip.y - indexTip.y) ** 2
    );
    const isPinch = pinchDist < 0.06;

    if (isPinch) {
      return { type: 'pinch', distance: pinchDist, x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 };
    }
    if (onlyIndex) {
      return { type: 'point', x: indexTip.x, y: indexTip.y };
    }
    if (allExtended) {
      const palmX = landmarks[9].x; // middle finger MCP as palm center
      const palmY = landmarks[9].y;
      return { type: 'palm', x: palmX, y: palmY };
    }
    return { type: 'none' };
  }
```

- [ ] **Step 3: Apply gestures in animation loop**

Add to the animation loop:

```javascript
    // Hand gesture → galaxy control
    if (cameraActive && handLandmarks) {
      const gesture = detectGesture(handLandmarks);

      if (gesture.type === 'palm') {
        // Open palm → rotation
        // Hand position relative to center (0.5, 0.5) maps to rotation speed
        const rx = (gesture.x - 0.5) * 2; // -1 to 1
        const ry = (gesture.y - 0.5) * 2;
        particles.rotation.y += rx * 0.01;
        particles.rotation.x += ry * 0.01;
        agentGroup.rotation.y = particles.rotation.y;
        agentGroup.rotation.x = particles.rotation.x;
      }

      if (gesture.type === 'pinch') {
        // Pinch → zoom
        const targetZ = 3 + gesture.distance * 40; // closer pinch = more zoom
        camera.position.z += (targetZ - camera.position.z) * 0.05;
      }

      if (gesture.type === 'point') {
        // Point → cursor (simulate mouse position)
        // MediaPipe x is mirrored (selfie view), so flip it
        mouse.x = -(gesture.x * 2 - 1);
        mouse.y = -(gesture.y * 2 - 1);
        raycaster.setFromCamera(mouse, camera);
        raycaster.ray.intersectPlane(intersectPlane, mouseWorld);

        // Position finger cursor on screen
        fingerCursor.style.left = ((1 - gesture.x) * window.innerWidth) + 'px';
        fingerCursor.style.top = (gesture.y * window.innerHeight) + 'px';
        fingerCursor.style.opacity = '1';
      } else {
        fingerCursor.style.opacity = '0';
      }
    }
```

- [ ] **Step 4: Add CSS for camera preview + finger cursor**

```css
#camera-preview {
  position: fixed; bottom: 1rem; right: 1rem; z-index: 50;
  width: 160px; height: 120px; border-radius: 4px;
  border: 1px solid var(--gold-line); overflow: hidden;
  opacity: 0.7; transition: opacity 0.3s;
}
#camera-preview:hover { opacity: 1; }
#camera-preview video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }

#finger-cursor {
  position: fixed; z-index: 60; pointer-events: none;
  width: 16px; height: 16px; margin: -8px 0 0 -8px;
  border-radius: 50%; border: 2px solid var(--gold);
  box-shadow: 0 0 12px rgba(201,151,62,0.4);
  opacity: 0; transition: opacity 0.15s;
}

.camera-btn.active { border-color: var(--teal); box-shadow: 0 0 15px rgba(62,219,198,0.2); }
.camera-btn.denied { opacity: 0.3; cursor: not-allowed; }
```

- [ ] **Step 5: Verify in browser**

Open http://localhost:3080. Check:
- Click camera button → browser asks for camera permission
- Grant → small preview appears bottom-right (mirrored selfie view)
- Open palm → galaxy rotates following hand direction
- Pinch fingers → camera zooms in/out
- Point index finger → gold cursor dot appears, follows fingertip
- Point at an agent star → label appears (same as mouse hover)
- Click camera again → deactivates, preview disappears
- Performance: no major lag (processing every 3rd frame)

- [ ] **Step 6: Commit**

```bash
git add packages/web/public/index.html
git commit -m "feat: MediaPipe hand tracking - gesture navigation for galaxy"
```

---

### Task 7: Mobile Fallback — Canvas 2D

**Files:**
- Modify: `/opt/galaxia/packages/web/public/index.html` (add else branch for mobile tier)

When tier is `mobile`, render a 2D starfield with touch parallax instead of WebGL.

- [ ] **Step 1: Add Canvas 2D fallback in the mobile branch**

After the `if (TIER !== 'mobile') { ... }` block, add:

```javascript
// ══════════ MOBILE FALLBACK — CANVAS 2D ══════════
if (TIER === 'mobile') {
  const canvas = document.getElementById('galaxy-canvas');
  const ctx = canvas.getContext('2d');
  let W, H;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  const STAR_COUNT = 2000;
  const stars = [];
  function createStars() {
    stars.length = 0;
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.5 + 0.3,
        alpha: Math.random(),
        speed: Math.random() * 0.0008 + 0.0002,
        phase: Math.random() * Math.PI * 2,
        depth: Math.random(),
      });
    }
  }

  let touchX = W / 2, touchY = H / 2;

  canvas.addEventListener('touchmove', (e) => {
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });

  // Gyroscope parallax
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma != null) touchX = W / 2 + (e.gamma / 45) * W * 0.1;
      if (e.beta != null) touchY = H / 2 + ((e.beta - 45) / 45) * H * 0.1;
    }, { passive: true });
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);

    // Nebula glow
    const g1 = ctx.createRadialGradient(W * 0.4, H * 0.4, 0, W * 0.4, H * 0.4, W * 0.4);
    g1.addColorStop(0, 'rgba(201,151,62,0.015)');
    g1.addColorStop(1, 'transparent');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);

    const parallaxScale = 0.01;
    for (const s of stars) {
      const twinkle = (Math.sin(t * s.speed * 2 + s.phase) + 1) / 2;
      const alpha = 0.15 + twinkle * s.alpha * 0.6;

      const px = s.x + (touchX - W / 2) * parallaxScale * s.depth;
      const py = s.y + (touchY - H / 2) * parallaxScale * s.depth;
      const wx = ((px % W) + W) % W;
      const wy = ((py % H) + H) % H;

      ctx.fillStyle = s.depth > 0.7
        ? `rgba(201,151,62,${alpha})`
        : `rgba(245,240,230,${alpha * 0.7})`;
      ctx.beginPath();
      ctx.arc(wx, wy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => { resize(); createStars(); });
  resize();
  createStars();
  draw(0);

  // Hide immersive bar camera/mic on mobile
  document.getElementById('mic-btn').style.display = 'none';
  document.getElementById('cam-btn').style.display = 'none';
  document.querySelector('.immersive-bar .immersive-text-sub').style.display = 'none';
  document.querySelector('.immersive-bar .immersive-text-main').textContent = 'Explore the Galaxy';
}
```

- [ ] **Step 2: Verify mobile fallback**

Use browser DevTools → toggle device toolbar (Ctrl+Shift+M) → select iPhone 14 or similar. Reload. Check:
- Canvas 2D star field renders (not WebGL)
- Stars twinkle and respond to touch/drag (parallax)
- Console shows `GALAXIA: Running in mobile mode`
- Mic/camera buttons hidden
- All content sections stack vertically
- Pricing cards stack to single column
- Page loads fast (no Three.js/bloom overhead)

- [ ] **Step 3: Commit**

```bash
git add packages/web/public/index.html
git commit -m "feat: mobile Canvas 2D fallback with touch parallax"
```

---

### Task 8: Scroll Reveals + Nav + Copy Buttons + Polish

**Files:**
- Modify: `/opt/galaxia/packages/web/public/index.html` (add remaining utility JS)

Final polish: scroll animations, nav behavior, copy buttons, smooth scrolling.

- [ ] **Step 1: Add scroll reveal observer**

```javascript
// ══════════ SCROLL REVEALS ══════════
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('vis');
      revealObs.unobserve(e.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));
```

- [ ] **Step 2: Add nav scroll behavior**

```javascript
// ══════════ NAV ══════════
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });
```

- [ ] **Step 3: Add copy buttons + smooth anchor scroll**

```javascript
// ══════════ COPY ══════════
function copyCode(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'COPIED';
    setTimeout(() => btn.textContent = 'COPY', 2000);
  });
}
window.copyCode = copyCode; // expose for onclick handlers

// ══════════ SMOOTH ANCHOR SCROLL ══════════
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
```

- [ ] **Step 4: Add hero content fade on scroll**

When user scrolls down, the hero content should fade slightly to reveal the galaxy more:

```javascript
// Hero fade on scroll
const heroContent = document.querySelector('.hero-content');
if (heroContent) {
  window.addEventListener('scroll', () => {
    const scrolled = Math.min(window.scrollY / (window.innerHeight * 0.5), 1);
    heroContent.style.opacity = 1 - scrolled * 0.7;
    heroContent.style.transform = `translateY(${scrolled * 30}px)`;
  }, { passive: true });
}
```

- [ ] **Step 5: Full visual verification**

Open http://localhost:3080. Complete checklist:
- [ ] Page loads — galaxy visible immediately with particles rotating
- [ ] Title "GALAXIA" readable over particles
- [ ] Move mouse — particles attract to cursor (black hole effect)
- [ ] Hover agent stars — labels appear with name/role/description
- [ ] Click mic button — permission dialog → particles vibrate to voice
- [ ] Click camera button — MediaPipe loads → hand gestures control galaxy
- [ ] Scroll down — hero fades, immersive bar appears
- [ ] Scroll further — How It Works section reveals with animation
- [ ] Pricing cards visible with correct content
- [ ] CTA terminal block with working copy button
- [ ] Waitlist email input visible
- [ ] Footer links present
- [ ] Nav becomes frosted glass on scroll
- [ ] Resize to mobile — Canvas 2D fallback, no mic/cam buttons
- [ ] No console errors
- [ ] Performance: 60fps on desktop

- [ ] **Step 6: Commit**

```bash
git add packages/web/public/index.html
git commit -m "feat: scroll reveals, nav, copy buttons, hero fade polish"
```

---

## Execution Notes

- **All code goes in one file:** `/opt/galaxia/packages/web/public/index.html`. Tasks build incrementally on the same file.
- **Three.js CDN:** Use `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js` with ES module imports.
- **MediaPipe CDN:** Use `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js` — dynamically imported only on camera click.
- **Test after every task** by opening http://localhost:3080 in a browser.
- **Server is already running** on PM2 as `galaxia-web` on port 3080. No restart needed — the server serves static files, so just refresh the browser.
- **Current page backup:** The current `index.html` will be overwritten in Task 1. It's already committed in git, so it can be recovered with `git checkout HEAD~ -- packages/web/public/index.html` if needed.
