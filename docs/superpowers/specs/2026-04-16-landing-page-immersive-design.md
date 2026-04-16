# GALAXIA Landing Page — Immersive 3D Design Spec

**Date:** 2026-04-16
**Status:** Approved
**Target:** https://galaxia.ai-deskflow.com (port 3080)
**File:** `/opt/galaxia/packages/web/public/index.html` (single HTML file)

---

## Overview

Complete redesign of the GALAXIA landing page into an immersive 3D experience. The page features a full-screen WebGL particle vortex galaxy, voice interaction that makes the galaxy vibrate, and camera-based hand gesture navigation. The galaxy itself IS the product demo — agents are stars in the vortex that visitors can explore.

## Architecture

Single HTML file with inline CSS + JS. External dependencies loaded via CDN:
- **Three.js** — WebGL particle system, 3D rendering
- **MediaPipe Hands** — browser-side hand tracking (no server)
- **Web Audio API** — native browser API, mic input → frequency analysis

No build step. No framework. The existing Express server at `/opt/galaxia/packages/web/src/index.ts` serves it as-is.

---

## Section 1: Hero — Particle Vortex Galaxy (100vh)

### Visual
- Full viewport height, full bleed
- Deep void background (#06080F)
- 50,000+ particles forming a spiral vortex galaxy
- Particles are points in a Three.js BufferGeometry with PointsMaterial
- Color gradient: gold (#C9973E) at center → teal (#3EDBC6) at edges → dim white at periphery
- Subtle glow/bloom post-processing via UnrealBloomPass
- Central bright core with lens flare effect

### Particle Behavior
- Base animation: slow spiral rotation (0.001 rad/frame)
- Particles distributed using logarithmic spiral formula: r = a * e^(b*θ) with random spread
- Each particle has: position (x,y,z), base angle, radius, speed, size, color
- Vertical spread: particles have slight z-offset for 3D depth

### Mouse Interaction — "Black Hole Cursor"
- Raycaster projects mouse position onto a plane in 3D space
- Particles within radius R of cursor are attracted toward it
- Attraction force: F = strength / distance² (inverse square)
- When mouse moves fast, particles trail behind creating a wake effect
- When mouse is still, particles slowly return to their orbital path

### Title & Content (overlaid on galaxy)
- "GALAXIA" in Fraunces serif italic, large (clamp 4rem–8rem), gold gradient text
- Positioned at center of vortex, rendered as HTML overlay (not 3D text)
- Subtitle below: "Install. Describe. Launch." in Outfit sans, light weight
- Gold horizontal rule separator (48px wide)
- Terminal install block: `$ curl -fsSL https://galaxia.sh/install | bash` with copy button
- Three stat badges: "10 Agents" / "$0/mo" / "24/7 Autonomous"
- Two CTA buttons: "Star on GitHub" (gold fill) / "See How It Works" (ghost)
- All text has subtle text-shadow for readability over particles

### Agent Stars
- 10 named stars positioned within the vortex, brighter and larger than regular particles
- Each agent star has a label (name + role) that appears on hover
- Labels rendered as HTML overlays positioned via Three.js CSS2DRenderer or manual projection
- Clicking an agent star expands an info tooltip with: name, role, one-line description
- Agent stars pulse subtly with a glow animation
- Stars are positioned in a logical cluster layout:
  - Center cluster: Dev (brightest, largest)
  - Upper orbit: CI/CD, Test, Review
  - Lower orbit: Analyse, Controle, Maintenance
  - Left orbit: Veille, Ideas, Contenu

### Nav (fixed top)
- Minimal: "GALAXIA" logo left (Fraunces, gold, small caps)
- Links right: "Process" / "Pricing" / "GitHub" button
- Transparent initially, frosted glass on scroll
- Only 3 nav links (matches 3 sections below)

---

## Section 2: Immersive Interaction Bar

### Position
- Directly below the hero (not inside it)
- Visible without scrolling on most screens (hero is 100vh, bar starts at 100vh)
- Thin gold top border (1px solid rgba(201,151,62,.15))

### Layout — Center-aligned, horizontal
- Left: Heartbeat Mic circle (48px diameter)
  - Gold border, subtle pulse animation (scale 1.0 → 1.15, 2s cycle, ease-in-out)
  - Two concentric ring ripples that expand outward (like a heartbeat on a monitor)
  - Mic SVG icon inside (gold stroke)
  - Click → requests `getUserMedia({ audio: true })`
- Center: Text
  - "Parle-moi" in Fraunces italic, warm white
  - Below: "OU ACTIVE TA CAMERA POUR CONTROLER PAR GESTES" in small caps, dust color
- Right: Camera button (48px diameter)
  - Teal border, circular
  - Camera SVG icon inside
  - Click → requests `getUserMedia({ video: true })` + loads MediaPipe Hands

### Micro Active State
- Heartbeat pulse speeds up to match voice rhythm
- Web Audio API: create AnalyserNode, get frequency data every frame
- Map frequency amplitude to particle perturbation:
  - Low frequencies → large slow waves through the vortex
  - High frequencies → small fast ripples
  - Silence → particles calm back to orbital paths
- The mic circle glows brighter when sound is detected
- Visual feedback: small waveform indicator appears below the mic

### Camera Active State
- Small preview window (160x120) appears in bottom-right corner with camera feed
- Semi-transparent, rounded corners, gold border
- MediaPipe Hands processes frames, returns hand landmarks
- Gesture mapping:
  - **Open palm** → rotation: hand position relative to center controls galaxy rotation speed/direction
  - **Pinch (thumb + index)** → zoom: distance between fingers maps to camera Z position
  - **Point (index extended, others closed)** → cursor: index fingertip position projected onto screen coordinates, acts as mouse cursor for hovering/clicking agent stars
- Visual feedback: gold dot follows fingertip position on screen
- Performance: process every 3rd frame to reduce CPU load

### Permissions Denied / Unavailable
- If mic denied: mic button gets a subtle "x" overlay, tooltip "Micro non disponible"
- If camera denied: same treatment
- If MediaPipe fails to load: camera button hidden
- No error modals, no popups — graceful degradation

---

## Section 3: How It Works

### Layout
- Section tag: "PROCESS"
- Title: "Three commands. Infinite potential." (Fraunces italic)
- Three steps in horizontal grid (vertical on mobile)
- Each step: gold circle number (1/2/3), title (Fraunces), description (Outfit), terminal code block
- Gold connecting line between step numbers (horizontal on desktop)
- Step 1: Install — `curl -fsSL galaxia.sh/install | bash`
- Step 2: Describe — `galaxia init "SaaS for dog walkers"`
- Step 3: Launch — `galaxia start`

### Style
- Same color palette as current design (gold + teal + navy)
- Terminal blocks: dark background, gold prompt, teal command text
- Generous whitespace above and below

---

## Section 4: Pricing

### Layout
- Section tag: "PRICING"
- Title: "Start free. Scale when ready." (Fraunces italic)
- Three cards in horizontal grid:

**Open Source (Free forever)**
- Full engine, all 10 agents, CLI + Dashboard, Mission Mode
- Groq + Ollama (free LLMs), community support
- Button: "Get Started" (ghost outline) → GitHub

**Pro ($29/mo) — FEATURED**
- Everything in Open Source + up to 10 projects
- Claude LLM integration, cloud dashboard
- Priority support, advanced analytics
- Gold "POPULAR" badge on top
- Button: "Join Waitlist" (gold fill)

**Business ($99/mo)**
- Everything in Pro + unlimited projects
- White-label dashboard, team access, custom agents
- Dedicated support
- Button: "Contact Us" (ghost outline)

### Style
- Cards: dark cosmos background, subtle gold border on hover
- Featured card: gold border, subtle gold glow
- Prices in Fraunces italic (large)
- Feature list with gold arrow markers

---

## Section 5: CTA + Footer

### CTA
- Section tag: "LAUNCH"
- Title: "Ready to build your autonomous company?" (Fraunces italic, "autonomous company" in gold)
- Terminal block with install command + copy button
- Two buttons: "Star on GitHub" (gold) / "Read the Docs" (ghost)
- Email waitlist form: input + "Join Waitlist" button
- Small note: "Get notified when GALAXIA Pro launches. No spam, ever."

### Footer
- Minimal: GitHub / Documentation / Discord / Twitter links
- "Crafted by Jeff Choux · MIT License · © 2025 GALAXIA"

---

## Performance — 3-Tier Auto Detection

### Detection Method
On page load, run a quick GPU benchmark:
1. Create offscreen WebGL canvas
2. Render 10,000 points for 10 frames
3. Measure average frame time
4. Check `navigator.hardwareConcurrency` for CPU cores
5. Check `navigator.userAgent` for mobile

### Tier 1: Full (desktop, good GPU)
- Benchmark: <8ms per frame
- 50,000 particles, UnrealBloomPass, glow effects
- Camera + mic buttons visible
- Full mouse interaction with attraction physics
- Agent star labels with CSS2DRenderer

### Tier 2: Light (desktop, weak GPU / tablets)
- Benchmark: 8-16ms per frame
- 10,000 particles, no bloom, no glow
- Camera + mic buttons visible
- Simplified mouse interaction (no attraction, just rotation)
- Agent labels as HTML overlays with manual projection

### Tier 3: Mobile (phones, very weak GPU)
- Mobile user agent OR benchmark >16ms
- Canvas 2D (no WebGL)
- 2,000 star particles with parallax on touch/gyroscope
- No camera/mic buttons (hidden)
- Agent stars as simple dots with tap-to-reveal labels
- Content sections stack vertically, standard responsive layout

### Transitions
- Tier detection runs once on load, result cached
- No runtime switching between tiers
- Console log: "GALAXIA: Running in [full/light/mobile] mode"

---

## Typography

- **Display:** Fraunces (variable, italic, weight 300-500) — titles, prices, "Parle-moi"
- **Body:** Outfit (weight 300-600) — descriptions, labels, nav
- **Code:** JetBrains Mono (weight 400-500) — terminal blocks
- Loaded via Google Fonts with `display=swap`

## Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| --void | #06080F | Page background |
| --cosmos | #0E1525 | Card backgrounds |
| --gold | #C9973E | Primary accent, mic, titles |
| --gold-bright | #E8B94A | Hover states, active elements |
| --teal | #3EDBC6 | Secondary accent, camera, checks |
| --star | #F5F0E6 | Primary text |
| --dust | #6B7089 | Secondary text |

## External Dependencies (CDN)

| Library | Version | Size (gzip) | Purpose |
|---------|---------|-------------|---------|
| Three.js | r162+ | ~150KB | WebGL rendering |
| Three/addons (BloomPass, CSS2DRenderer) | r162+ | ~30KB | Post-processing, labels |
| MediaPipe Hands | 0.4+ | ~3MB (lazy) | Hand tracking — loaded ONLY on camera click |
| MediaPipe Camera Utils | 0.3+ | ~15KB (lazy) | Camera feed — loaded ONLY on camera click |

Web Audio API is native — no library needed.

MediaPipe is **lazy-loaded**: not included in initial page load. Only fetched when user clicks the camera button. This keeps initial load fast.

---

## File Structure

Single file: `/opt/galaxia/packages/web/public/index.html`

Inline structure:
```
<head>
  - Meta, fonts, CSS (all inline)
  - Three.js CDN import
</head>
<body>
  - <canvas id="galaxy"> (Three.js render target)
  - <div id="overlay"> (all HTML content positioned over canvas)
    - nav
    - hero content (title, subtitle, terminal, stats, CTAs)
    - agent labels (positioned dynamically)
    - immersive bar
  - <main> (below-fold content)
    - How it works
    - Pricing
    - CTA + footer
  - <script> (all JS inline)
    - GPU benchmark + tier detection
    - Three.js scene setup (camera, renderer, particles)
    - Particle vortex math (spiral distribution, orbital animation)
    - Mouse interaction (raycaster, attraction physics)
    - Agent stars (positions, labels, click handlers)
    - Web Audio (mic → analyser → particle perturbation)
    - MediaPipe (lazy load, hand tracking → gesture mapping)
    - Scroll reveals, nav, copy buttons
    - Mobile fallback (canvas 2D)
</script>
</body>
```

---

## What This Spec Does NOT Cover

- Backend changes (the Express server stays as-is)
- Dashboard 3D (separate package, not part of landing page)
- Actual voice AI / LLM responses (the mic captures audio for visual effect only, not conversation)
- Analytics / tracking
- SEO beyond basic meta tags
