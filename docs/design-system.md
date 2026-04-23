# Vagabond UI Design System
### For use with claude.ai/design

Paste this document as context at the start of any claude.ai/design session to get mockups that match the real Vagabond / VCE / Crawler visual language.

---

## 1. Visual Identity

**Theme:** Dark gothic tabletop RPG. Think aged parchment meets tactical war-room — dark charcoal backgrounds, warm gold accents, weathered textures. Not flat/modern. Not fantasy-garish. Think "illuminated manuscript printed on a steel plate."

**Key personality traits:**
- Dark backgrounds, warm gold/amber accents
- Heavy serif display fonts for headings; lighter serif for body
- Uppercase small-caps labels with letter-spacing
- Subtle paper textures behind content
- Bold typographic section dividers (centered rule line with text)
- Dice imagery, shield icons, worn-leather aesthetics

---

## 2. Color Palette

### Core — Vagabond System
| Token | Value | Use |
|---|---|---|
| `--vagabond-c-dark` | `#17191d` | Sheet base background |
| `--vagabond-c-text-primary` | `#BDC1C6` | Body text on dark bg |
| `--vagabond-c-text-secondary` | `#DED656` | Accent yellow — titles, highlights |
| `--vagabond-c-stat` | `#ffd07d` | Stat numbers, warm gold |
| `--vagabond-c-green` | `#26cb0c` | Success, roll indicators |
| `--vagabond-c-red` | `#ff8b9f` | Danger, damage (soft pink-red — NOT harsh) |
| `--vagabond-c-bluey` | `#1f2324da` | Drop shadows |
| `--vagabond-c-dark-bluey` | `#2c3e50` | GM color, deep blue-gray |
| `--vagabond-c-tan` | `#706d65` | Separators, borders |
| `--vagabond-c-tan-lite` | `#c5c3b832` | Active/selected tint |
| `--vagabond-c-muted` | `#999999` | Subdued labels |
| `--vagabond-c-inset-2` | `rgba(89,99,106,0.1)` | Hover tint on dark bg |
| `--vagabond-c-damage-orange` | `#e7570a` | Damage numbers |
| `--vagabond-c-chat-yellow` | `#DED656` | Chat card section headers |
| `--vagabond-c-title1` | `#000000` | Text ON the NPC banner (black on tan banner) |
| `--vagabond-c-title2` | `#ffffff` | Alt title (white) |

### VCE Module
| Token | Value | Use |
|---|---|---|
| `--vce-accent` | `#d4a843` | Primary amber gold (buttons, managed AE border) |
| `--vce-accent-dim` | `#a08030` | Hover/dimmed gold |
| `--vce-beast-primary` | `#4a7c3f` | Summon/beast green |
| `--vce-danger` | `#8b0000` | Deep danger red |
| `--vce-danger-text` | `#ff8888` | Danger text on dark |
| `--vce-condition-bg` | `rgba(180,60,60,0.3)` | Condition badge bg |
| `--vce-condition-border` | `rgba(180,60,60,0.6)` | Condition badge border |
| `--vce-condition-text` | `#e0a0a0` | Condition badge text |
| `--vce-valor` | `#4a7c4b` | Bard Valor buff |
| `--vce-resolve` | `#4a5c8c` | Bard Resolve buff |
| `--vce-inspiration-accent` | `#7b5ea7` | Bard Inspiration purple |
| `--vce-star-gold` | `#facc15` | Formula/star highlights |
| `--vce-formula-green` | `#4ade80` | Formula cost green |

### Vagabond Crawler (Dark Mode Default)
| Token | Value | Use |
|---|---|---|
| `--vcb-bg` | `#17191d` | Main background |
| `--vcb-bg-alt` | `#1f2226` | Alternate surface |
| `--vcb-bg-hover` | `#2a2d32` | Hover state |
| `--vcb-surface-1` | `#1b1b1b` | Card surface |
| `--vcb-btn-1` | `#252830` | Button default |
| `--vcb-btn-hover-1` | `#2e3138` | Button hover |
| `--vcb-input-bg` | `#111418` | Input fields |
| `--vcb-border` | `#3a3d44` | Borders/dividers |
| `--vcb-accent` | `#c9a54a` | Gold accent |
| `--vcb-accent-dim` | `#94913c` | Dimmed gold |
| `--vcb-text` | `#BDC1C6` | Primary text |
| `--vcb-text-bright` | `#e8eaed` | Bright/emphasis text |
| `--vcb-text-muted` | `#767676` | Subdued text |
| `--vcb-heroes` | `#278e17` | Hero phase / hero color |
| `--vcb-heroes-text` | `#80e070` | Hero text on dark |
| `--vcb-heroes-bg-1` | `#1e5a14` | Hero bg card |
| `--vcb-gm` | `#2c3e50` | GM/NPC phase color |
| `--vcb-gm-text` | `#90b8e0` | GM text |
| `--vcb-combat` | `#9d0000` | Combat/danger red |
| `--vcb-combat-text` | `#f09090` | Combat text |
| `--vcb-hp-ok` | `#3aaa3a` | HP bar: healthy |
| `--vcb-hp-mid` | `#b8a020` | HP bar: mid |
| `--vcb-hp-low` | `#c86040` | HP bar: low |
| `--vcb-hp-critical` | `#8a1010` | HP bar: critical |
| `--vcb-hp-dead` | `#333` | HP bar: dead/zero |
| `--vcb-radius` | `4px` | Standard border-radius |

### Semantic Color Groups (use these when designing)
```
BACKGROUND STACK (darkest → lightest):
  #111418 → #17191d → #1b1b1b → #1f2226 → #252830 → #2a2d32

GOLD/AMBER ACCENT:
  #7a7030 (pressed) → #a08030 (dim) → #c9a54a (primary) → #d4a843 (VCE) → #ffd07d (stat)

GREEN (hero/success):
  #1e5a14 → #278e17 → #3aaa3a → #26cb0c → #80e070

RED (danger/damage):
  #8b0000 → #9d0000 → #c04040 → #e7570a → #ff8b9f

YELLOW TEXT:
  #94913c → #DED656 → #ffd07d

TEXT ON DARK:
  #767676 (muted) → #999999 → #BDC1C6 (body) → #e8eaed (bright)
```

---

## 3. Typography

### Font Stack
| Font | Role | Style | Used For |
|---|---|---|---|
| **Germania** | Display | Serif, heavy, Gothic | Section titles ("Actions", "Inventory"), dialog titles, major headings |
| **Manofa** | Label | Sans-serif, uppercase | Action names (dotted underline), weapon names, small ALL-CAPS labels |
| **Eskapade** | Body | Serif, readable | Primary body text (crawler, sheet body copy) |
| **Paradigm** | Body alt | Serif | VCE component body, action descriptions, tags |
| **Signika** | Fallback | Sans-serif | System fallback |

### Type Scale
```
Display (Germania):    20–24px, font-weight: 900, color: text-primary or black-on-banner
Section title:         18–20px, Germania, with horizontal rule decoration
Action name (Manofa):  13–14px, uppercase, dotted underline, bold
Body (Eskapade):       13–14px, normal weight
Label (Paradigm):      11–13px
Micro label:           10–11px, uppercase, letter-spacing: 0.05em
```

### Section Title Pattern (horizontal rule + centered text)
```css
.section-title {
  display: flex;
  align-items: center;
  font-size: 20px;
  font-weight: 900;
  font-family: "Germania", serif;
  color: var(--vagabond-c-text-primary);
  padding: 8px 0;
}
.section-title::before,
.section-title::after {
  content: "";
  flex: 1;
  border-bottom: 2px solid currentColor;
}
.section-title::before { margin-right: 8px; }
.section-title::after  { margin-left: 8px; }
```

---

## 4. Spacing Scale
```
--vce-space-xs:  4px   (icon gaps, tight padding)
--vce-space-sm:  6px   (button padding, badge padding)
--vce-space-md:  8px   (standard component padding)
--vce-space-lg:  12px  (section gap)
--vce-space-xl:  16px  (panel padding)
--vce-space-2xl: 24px  (major section separation)
```

---

## 5. Key Components

### NPC Banner Header
Used on: NPC sheets, VCE Summon tab, companion cards.
- Background: `headerNPCBanner.webp` — a gold/tan textured banner image stretched to fill
- Left: 64×64px portrait (rounded 4px, bluey drop shadow)
- Center: Name in Germania 20px **black** text, tags below in Paradigm 14-16px bold black
- Right: Red "Banish/End" button (`background: #9d0000`, white text, Germania font)
- Box shadow: `2px 2px 2px #1f2324da`

```
┌──────────────────────────────────────────────┐ ← headerNPCBanner.webp bg
│ [portrait]  Name (Germania, black)   [Banish]│
│             HD 1 · Small · Beasts            │
└──────────────────────────────────────────────┘
```

### HP Bar
- Wrapper: `background: #333`, border-radius: 7px, height: 14-16px
- Fill: color changes based on percentage
  - >60%: `#3aaa3a` green
  - 30-60%: `#b8a020` yellow
  - 10-30%: `#c86040` orange
  - <10%: `#8a1010` dark red
- Label: "HP" in bold, value "13 / 20" right-aligned

### Action Row (clickable)
- Font: Manofa uppercase for action name, dotted underline
- Hover: color changes to red (`#ff8b9f`), background: subtle inset
- Damage: right-aligned, Paradigm font, text-primary color
- Tag (Multi-Attack / Melee Attack): Paradigm, normal weight, text-primary

```
Maul     Multi-Attack               ← action name (Manofa) + tag (Paradigm)
  2×Claw                            ← extra detail, indented
Claw     Melee Attack        1d3    ← damage right-aligned
```

### Chat Card
Structure (top to bottom):
- **Sender strip**: yellow `#DED656` background, sender name, timestamp
- **Header section**: portrait left, title right ("PSEUDOPOD DAMAGE") in Manofa uppercase
- **Target strip**: dark yellow bg, "TARGETS" label, token portrait chips
- **Damage section**: large orange damage number (`#e7570a`), green dice icons
- **Apply Direct button**: black bg, bold uppercase, full width
- **Save buttons**: three equal buttons — Reflex / Endure / Will — amber/gold style
- **Defending options**: collapsed dropdown

### Dialog / ApplicationV2
- Title bar: dark `#1a1a1a` strip, white title text in Germania
- Content area: dark bg with slight surface lift
- Footer buttons: right-aligned, amber gold for confirm, subtle for cancel
- Border-radius: 4px throughout

### Tags / Badges
```
Condition badge: background rgba(180,60,60,0.3), border rgba(180,60,60,0.6),
                 text #e0a0a0, border-radius 3px, padding 1px 6px

Type badge (Summon/Hireling): small colored pill, white text, font-weight bold
  Summon   → gold bg   (#7b5e00)
  Familiar → purple bg (#4a2080)
  Hireling → green bg  (#1a5a1a)

Feature tag: background rgba(0,0,0,0.6), text #e0e0e0, italic, 11px
```

### Button Styles
```
Primary / Confirm:
  background: --vce-accent (#d4a843), color: #000, font: Germania
  hover: slightly lighter gold, opacity 0.85

Danger / Banish:
  background: #9d0000, color: white, font: Germania
  hover: opacity 0.85

Ghost / Secondary:
  background: rgba(89,99,106,0.1), border: 1px solid --vcb-border
  color: text-primary, font: Eskapade/Paradigm

Save button (Reflex/Endure/Will):
  background: dark amber gradient, border: gold, bold text, icon left
```

---

## 6. Sheet Layout Patterns

### Character Sheet
```
┌─ Window header (dark strip, white title, icon buttons) ─┐
├─ Tab bar: [Summon] [Features] [Magic] [Effects] ─────────┤  ← Germania tabs, gold active underline
│                                                           │
│  Tab content (dark bg, paper texture overlay)            │
│  ┌─ section header (Germania + rule) ────────────────┐   │
│  │  content rows...                                   │   │
│  └────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

### NPC Sheet
- Compact, portrait-based header
- Stats in icon+number pairs (HP heart icon, speed lightning icon)
- Armor as a shield badge overlay
- Actions/Abilities in alternating light/dark rows

### Crawler Action Strip (HUD panel)
- Dark `#17191d` background
- Token portrait (circular or square) top
- HP bar below portrait
- Action buttons in a strip (attack, cast, move)
- Phase colors: green (heroes turn), blue (GM turn), red (combat active)

---

## 7. Icon Usage (FontAwesome 6 Pro)
Common icons in this UI:
```
fa-dice-d20        → roll/check buttons
fa-people-arrows   → save controller / routing
fa-heart           → HP
fa-shield          → armor
fa-bolt            → speed/movement
fa-times           → banish/dismiss/close
fa-skull           → death/defeat
fa-fire            → burning condition
fa-star            → luck/favorited
fa-external-link   → open sheet
fa-save            → save action
fa-trash           → clear/delete
```

---

## 8. Do / Don't

### DO:
- Use dark backgrounds (`#17191d` base) with warm gold accents
- Use Germania for any heading that would appear on a physical character sheet
- Use Manofa for action names, weapon names, all-caps labels
- Apply the NPC banner webp image on companion/summon headers
- Use the horizontal rule title pattern for section dividers
- Color-code HP bars with the health gradient (green→yellow→orange→red)
- Keep border-radius at 4px (never rounded/pill except HP bars)
- Use FontAwesome icons consistently (d20 for rolls, shield for armor, heart for HP)

### DON'T:
- Don't use bright white backgrounds — this is a dark UI
- Don't use flat/modern sans-serif fonts for headings (no system-ui, no Inter)
- Don't use rounded pill buttons (except small badges)
- Don't use blue or purple as primary accent — gold/amber is the brand
- Don't make the red harsh/neon — it's a soft `#ff8b9f` or deep `#9d0000`
- Don't omit texture — flat solid fills look out of place
- Don't use card shadows without the bluey `#1f2324da` tint

---

## 9. Sample Prompt Template

When starting a new design in claude.ai/design, paste this after the design system:

```
Using the Vagabond UI Design System above, design [COMPONENT NAME].

Context:
- This is a FoundryVTT v13 module panel / sheet tab / dialog
- Dark theme: base background #17191d, text #BDC1C6, accent gold #d4a843
- Fonts: Germania (headings), Manofa (action labels), Eskapade/Paradigm (body)
- Icons: FontAwesome 6 Pro
- Border-radius: 4px standard

The component should [DESCRIPTION].
It will contain: [LIST ELEMENTS].
Key interactions: [HOVER STATES / CLICK ACTIONS].
```
