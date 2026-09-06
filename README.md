# devStack

Interactive canvas-based notes platform with step-by-step animations, system design diagrams, code blocks, markdown rendering, and presentation mode.

---

## Recent Changes (Aug 29–30, 2026)

### Timeline Bar (new)
- **Horizontal timeline** at the bottom of the canvas — replaces the old floating AnimationPanel
- **Auto-add to timeline** — any shape, text, image, or RF node/edge added to the canvas automatically appears as a timeline card
- **Drag to reorder** — drag cards left/right to change animation order
- **Group / Ungroup** — checkbox-select multiple cards, click "Group (N)" to merge into one step (they appear together during presentation)
- **Manual add** — select elements on canvas, click "+ Add" on timeline. Single element gives 4 action options (Erase, Move, Teleport, Swap); multi-select gives only Erase
- **Camera lock per step** — "Lock Camera" button on each card saves the current viewport; "View Position" jumps back to that saved view
- **Per-step audio** — collapsible audio dropdown on each card with upload, preview (▶/⏹), start/end time, loop, and volume slider
- **Audio auto-stop** — preview audio stops when canvas locks/unlocks or when the audio dropdown collapses
- **Volume slider fix** — dragging the volume slider no longer moves the card
- **Draggable widget** — the entire timeline bar can be repositioned by dragging its header
- **Clear All** — deletes all timeline cards and their corresponding shapes from the canvas

### Timeline ↔ Canvas Sync
- **Card click → canvas focus** — clicking a timeline card selects and centers the element on canvas (tldraw shapes AND RF nodes/edges)
- **Canvas click → card highlight** — selecting any element on canvas (including RF nodes/edges) auto-scrolls and highlights the matching timeline card

### Sidebar (Sub-Topic Tracker)
- **Moved to 15% right sidebar** — absolute overlay so tldraw gets full canvas width
- **Title selector** — click the heading to pick from: Outline, Scenes, Topics, Contents, Agenda, Chapter Breakdown, Progress
- **Title locked during presentation** — dropdown disabled when canvas is locked

### PNG Export
- **Export as PNG** button (ImageDown icon) in the toolbar
- Uses `html-to-image` instead of `html2canvas` — correctly captures SVG-based React Flow edges and nodes at 2x resolution

### Branding
- **Dynamic tab title** — browser tab shows "devStack by Sagar Kumar" or "ChapterBreakdown by Priyanka & Sagar" based on `VITE_PORTAL` env
- **ChapterBreakdown subtitle** — updated to "by Priyanka & Sagar"
- **Line colors** updated for the off-white canvas background (`#f0ede8`)
- **Laser pointer icon** changed to pen SVG

### Two Vercel Projects
- **Portal separation** via `VITE_PORTAL` env variable — `devStack` and `chapterBreakdown` deploy as independent Vercel projects
- **Portal picker on localhost** — both portals accessible; single portal on production

---

## Features

### Canvas Editor (localhost only)
- **Infinite canvas** powered by tldraw — draw shapes, text, arrows, images, freehand
- **Code blocks** — syntax-highlighted with 30+ languages (Java, Python, Go, Rust, etc.) and 20 themes (One Dark, Dracula, Night Owl, VS Dark, etc.)
- **Markdown blocks** — full GFM rendering: headings, tables, lists, code, blockquotes, bold, italic, links
- **System design nodes** — drag-and-drop AWS icons (EC2, S3, Lambda, DynamoDB, SQS, etc.) from the Node Catalog
- **Animated lines** — 8 edge types (Solid, Marching, Flow, Pulse, Electric, Packet, Stream, Dash-Dot) with 4 path shapes, arrows, and 7 colors
- **Resizable nodes** — drag bottom-right corner of any diagram node

### Animation System
- **Step-by-step reveal** — add shapes to animation steps, navigate with arrow keys when locked
- **16 entrance animations** — Appear, Fade In, Fly In (4 directions), Slide In (4 directions), Zoom In/Out, Pop, Pulse, Bounce
- **5 reveal animations** — Reveal Left/Right/Top/Bottom, Reveal Center (clip-path based)
- **7 looping animations** — Float, Shake, Pulse, Bounce, Breathe, Wiggle, Sway (with adjustable speed via duration)
- **7 step actions** — None, Enter, Exit, Blink, Move, Teleport, Swap
- **Camera capture** — any step can optionally capture a camera view (zoom in/out during presentation)
- **Per-step audio** — attach sound effects to any step with start/end time, loop, and volume control (Web Audio API)
- **Move** — pick destination by dragging the shape, confirm, it animates to that position
- **Swap** — one set of shapes exits while another enters simultaneously
- **Sub-topic progress tracker** — labels with step ranges, auto-cascading, draggable widget

### Presentation Mode
- **Fullscreen** with laser pointer and hand tool toggle (on header bar)
- **Laser mode** — red dot cursor with fading strokes
- **Hand mode** — pan canvas, scroll inside code/markdown blocks
- **Step navigation** with arrow keys
- **Camera auto-pans** to keep newly revealed elements visible

### Public Canvas
- **Markdown editor** with split/edit/preview modes for production-ready content
- **Image paste** — Cmd+V pastes screenshots as WebP-compressed inline images, resizable with left/center/right alignment
- **Export & Publish** — single button that saves JSON and pushes to GitHub via deploy key
- **Production viewer** — beautiful markdown rendering with syntax-highlighted code blocks, styled tables, blockquotes
- **TOC sidebar** — auto-generated from headings with tree lines, active heading tracking, auto-scroll to current section
- **Mobile responsive** — content goes full-width on mobile, sidebar hides, tables scroll horizontally

### Card Grid & Navigation
- **Live search** — real-time filtering by title + description, case-insensitive, with smooth layout animations (cards glide into position using spring physics)
- **Grid zoom slider** — adjust 2–5 cards per row (localhost only, saved to config file, production reads from config)
- **Count label** — click to cycle between Topics/Chapters/Modules/Subjects (localhost only, saved to config file)
- **Coming Soon ribbon** — diagonal "In Progress" ribbon + frosted glass overlay on cards with `"status": "coming-soon"`
- **Breadcrumb navigation** — auto-generated path trail for nested topics

### Two Portals
- **`/`** — "devStack by Sagar Kumar" (IT/CS topics)
- **`/10`** — "Chapter Breakdown by Sagar Kumar" (School — Class 10, 12)

---

## Configuration Files

### Branding & Site Config
**File:** `src/data/siteConfig.ts`

Change brand name, subtitle, watermark, default YouTube URL:
```ts
'tech-notes': {
  brandName: 'dev',
  brandAccent: 'Stack',
  brandSubtitle: 'by Sagar Kumar',
  watermark: 'devStack by Sagar Kumar',
  youtubeUrl: 'https://youtube.com/@yourchannel',  // fallback for all pages
}
```

### Content Tree (Topics & Subtopics)
**Files:**
**File:** `src/data/think_loud.json` — IT/CS topics (portal `/`)
- `src/data/chapter_breakdown.json` — School topics (portal `/10`)

#### Add a new topic:
Add an entry to the JSON array:
```json
{
  "id": "docker",
  "number": 26,
  "title": "Docker",
  "description": "Containers, images, volumes, networking.",
  "slug": "docker",
  "icon": "Box",
  "color": "#2496ed",
  "children": []
}
```

#### Add subtopics under a topic:
Add entries to the `children` array:
```json
{
  "id": "docker-basics",
  "number": 1,
  "title": "Docker Basics",
  "description": "Introduction to containers.",
  "slug": "docker-basics",
  "icon": "BookOpen",
  "color": "#2496ed",
  "children": []
}
```

#### Mark a topic as "Coming Soon":
Add `"status": "coming-soon"` to any topic:
```json
{
  "id": "kubernetes",
  "title": "Kubernetes",
  "status": "coming-soon",
  ...
}
```
This shows a diagonal "In Progress" ribbon + frosted glass overlay on the card.

#### Generate folders for new topics:
After updating JSON files, run:
```bash
npm run generate-folders
```
This creates the folder structure in `public/notes/`.

#### YouTube URLs (per-level):
Each node in the JSON can optionally have a `"youtubeUrl"` field. The YouTube button in the header resolves the URL by walking from the **deepest current node up to root**, using the first `youtubeUrl` it finds. If no node has one, it falls back to `siteConfig.ts`.

**Level 1 — Channel URL** (on a top-level topic like "Java"):
```json
{
  "id": "java",
  "title": "Java",
  "youtubeUrl": "https://youtube.com/playlist?list=PLxxxxxx",
  ...
}
```

**Level 2 — Video URL** (on a subtopic like "Introduction to Java"):
```json
{
  "id": "intro-to-java",
  "title": "Introduction to Java",
  "youtubeUrl": "https://youtube.com/watch?v=xxxxxx",
  ...
}
```

**Fallback order:**
1. Current leaf node's `youtubeUrl` (if set)
2. Parent topic's `youtubeUrl` (if set)
3. `siteConfig.ts` → `youtubeUrl` (always exists)

This means you only need to set URLs where they differ. A playlist URL on "Java" will automatically apply to all subtopics under it unless a subtopic has its own video URL.

### Feature Flags
**File:** `src/canvas/SubTopicTracker.tsx` (top of file)

```ts
const ENABLE_COMPLETION_SOUND = false;  // Sub-topic ding sound
const ENABLE_PARTY_POPPER = false;      // Final confetti celebration
```

### Grid & Label Config (Localhost → Production)
**File:** `src/data/gridConfig.ts`

Controls how many cards per row and what label to show on each page. Set on localhost via slider/clicking — saved to this file — production reads from it.

```ts
// Cards per row (2-5) — set via zoom slider on localhost
export const gridColumns: Record<string, number> = {
  'root': 5,
  '/java': 5,
};

// Count label — set by clicking the badge on localhost
export const countLabels: Record<string, string> = {
  'root': 'Topics',
};
```

The zoom slider and label clicking are **hidden on production**. Production renders using values from this file.

### Canvas Background Color
**File:** `src/styles/index.css`

```css
.tl-background { background-color: #f0ede8 !important; }
.tl-canvas { background-color: #f0ede8 !important; }
```

### Available Lucide Icons for Topics
**File:** `src/components/TopicIcon.tsx`

Common icons: `BookOpen`, `Coffee`, `Code2`, `GitBranch`, `Brain`, `Cpu`, `Globe`, `Shield`, `Database`, `Cloud`, `Terminal`, `Workflow`, `Box`, `Network`, `Lock`, `Layers`

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `→` / `←` | Next / Previous animation step (locked canvas) |
| `Shift+1` | Zoom to selected shapes |
| `Shift+2` | Toggle zoom to fit / reset to 100% |
| `Shift+0` | Reset zoom to 100% |
| `Cmd+S` | Manual save |
| `Cmd+Shift+L` | Hide/show Lock button |
| `Esc` | Exit fullscreen |
| `Tab` | Insert 2 spaces (inside code/markdown editor) |

---

## How It Works

### On Localhost
1. Navigate to a leaf topic (e.g. Java → Introduction to Java)
2. **Locked mode** — step through animations with arrow keys
3. **Unlock** — full editor with all tools
4. **Toolbar buttons:** Lines, Colors, Nodes, Code, Markdown, Steps, Sub Topics, Public
5. Auto-saves to localStorage every 1.5 seconds

### On Production (Vercel)
1. Card pages show topic/subtopic grids with search, breadcrumbs, and smooth animations
2. Leaf topics fetch `public-canvas.json` from `public/notes/{siteId}/{topic}/{subtopic}/`
3. Renders markdown content with syntax-highlighted code, styled tables, TOC sidebar
4. Falls back to "Notes coming soon" if no JSON exists
5. YouTube buttons visible (hidden on localhost)
6. Grid slider, label switching, and canvas editor are all hidden — production is read-only

### Export / Import
- **Export** (↓ button) — downloads full lesson as JSON (shapes, images, steps, sub-topics, diagram data)
- **Import** (↑ button) — restores canvas from previously exported JSON
- Images are stored as base64 inside the JSON

### Public Markdown Deployment
1. Click **Public** button on a leaf topic → opens markdown editor
2. Write/paste content in split or edit mode, preview renders live
3. Paste images with Cmd+V — auto-compressed to WebP
4. Click **Export & Publish** → saves JSON and pushes to GitHub in one step
5. Vercel auto-deploys from GitHub

---

## Tech Stack

- **React 19** + **TypeScript**
- **Vite 8** — build tool
- **tldraw v5** — infinite canvas engine
- **@xyflow/react** — React Flow for node-based diagrams
- **@aws-icons/react** — AWS architecture icons
- **prism-react-renderer** — syntax highlighting for code blocks
- **react-markdown** + **remark-gfm** + **rehype-raw** — markdown rendering
- **Tailwind CSS 4** — styling
- **framer-motion** — card animations
- **canvas-confetti** — celebration effects
- **lucide-react** — UI icons
- **react-router-dom v7** — routing

---

## Vite Dev Server Endpoints

The Vite plugin (`vite-plugin-canvas-api.ts`) adds these localhost-only endpoints:

| Endpoint | Purpose |
|----------|---------|
| `POST /__save-public-canvas` | Save markdown content JSON to `public/notes/` |
| `POST /__publish` | Git commit + push to GitHub via deploy key |
| `POST /__save-grid-config` | Save cards-per-row setting to `gridConfig.ts` |
| `POST /__save-label-config` | Save count label (Topics/Chapters/etc) to `gridConfig.ts` |

These endpoints only exist on the dev server. Production builds ignore them entirely.

### GitHub Deploy Key
SSH key at `~/.ssh/godcanvas_key` — used for pushing from the Vite plugin without affecting global git config. Repo: `sagar10451/devStack`.

---

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Generate topic folders
npm run generate-folders

# Lint
npm run lint
```

---

## Deployment (Vercel)

1. Push to GitHub
2. Import repo on vercel.com
3. Framework: Vite (auto-detected)
4. Build command: `npm run build`
5. Output: `dist`

Create `vercel.json` in project root for SPA routing:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

## Project Structure

```
src/
  canvas/
    LessonCanvas.tsx        — Main canvas with all features
    CanvasEditor.tsx         — tldraw wrapper with custom shapes
    PublicMarkdownEditor.tsx — Markdown editor (split/edit/preview modes)
    PublicMarkdownViewer.tsx — Production markdown viewer with TOC sidebar
    AnimationPanel.tsx       — Animation steps panel
    TimelineBar.tsx          — Horizontal timeline bar with drag-reorder, audio, grouping
    SubTopicTracker.tsx      — Sub-topic progress tracker / sidebar
    DraggableWidget.tsx      — Reusable draggable wrapper
    stepAnimations.ts        — Animation execution engine
    animationEngine.ts       — Idle animation engine
    celebration.ts           — Sound + confetti effects
    types.ts                 — All TypeScript interfaces
    shapes/
      CodeBlockShape.tsx     — Custom code block shape
      MarkdownBlockShape.tsx — Custom markdown block shape
      prismLanguages.ts      — Additional Prism language grammars
    diagram/
      DiagramEditor.tsx      — React Flow canvas overlay
      DiagramToolbar.tsx     — Lines configuration toolbar
      NodeCatalog.tsx        — Draggable node shapes panel
      diagramTypes.ts        — Node/edge catalogs
      edgeTypes.tsx           — 8 animated edge types
      nodeTypes.tsx           — Custom node renderer with resize
      ContentNode.tsx         — Markdown RF node (transparent, connectable)
      iconRegistry.tsx        — AWS icon mapping
      diagramStyles.css       — RF-specific styles
  components/
    Header.tsx               — App header with branding
    LaserPointer.tsx         — Laser pointer overlay
    TopicIcon.tsx            — Lucide icon mapper for topics
  data/
    siteConfig.ts            — Portal branding config
    gridConfig.ts            — Grid columns + count labels (localhost → production)
    portalContext.tsx         — Portal state management
    presentationContext.tsx   — Presentation mode state
    contentTree.ts           — Tree navigation helpers
    think_loud.json          — IT/CS content tree
    chapter_breakdown.json   — School content tree
  pages/
    LessonPage.tsx           — Routes to canvas or markdown viewer
    PortalPage.tsx           — Card grid with search + animations
  styles/
    index.css                — Global styles + animations + markdown typography
public/
  notes/                     — Static content files (JSON for markdown)
vite-plugin-canvas-api.ts   — Dev server endpoints (save, publish, config)
```
