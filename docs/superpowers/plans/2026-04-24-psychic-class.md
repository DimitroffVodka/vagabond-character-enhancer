# Psychic Class Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Psychic class as a fully playable Vagabond class via a parallel "Talent" item-type system.

**Architecture:** Custom `talent` item type registered via `CONFIG.Item.dataModels.talent`. Talents live in a new `vce-talents` compendium pack and render in their own tab on the character sheet (Psychic actors only). A bespoke cast pipeline calls existing helpers (`VagabondDamageHelper.rollSpellDamage`, `VagabondChatCard.spellCast`) without going through `SpellHandler`. Focus is tracked in a per-actor flag, not in `system.focus.spellIds`.

**Tech Stack:** FoundryVTT v13.351 ESM modules. Vagabond system v5.x. Handlebars templates. ApplicationV2 (DialogV2 + custom tabs). LevelDB compendium packs.

**Reference:** [Design spec](../specs/2026-04-24-psychic-class-design.md). Read it first.

**Testing:** No automated test framework in this codebase. Verification is via the live Foundry MCP bridge (`mcp__foundry-vtt__evaluate`, `list_actors`, etc.) — instructions assume a running Foundry world with the vagabond-character-enhancer module enabled.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/talent/talent-data-model.mjs` | Data model class + `init` hook to register `CONFIG.Item.dataModels.talent` and the sheet |
| `scripts/talent/talent-sheet.mjs` | ApplicationV2 sheet for editing Talents (compendium use) |
| `scripts/talent/talents-tab.mjs` | Inject + render the Talents tab on character sheets (Psychic actors) |
| `scripts/talent/talent-pick-dialog.mjs` | Initial-pick + level-up Talent picker (DialogV2) |
| `scripts/talent/talent-cast.mjs` | Full-RAW cast dialog + damage/effect resolution + chat card render |
| `scripts/talent/talent-buffs.mjs` | Focus-AE manager for the 4 buff Talents |
| `scripts/talent/talent-transcendence.mjs` | L10 Transcendence swap dialog |
| `scripts/class-features/psychic.mjs` | Psychic class registry: Mental Fortress AE, Awakening flag, Precognition handler, Duality maxFocus calc, Transcendence wiring |
| `scripts/feature-detector.mjs` | **Modified.** Extend perk-grant pattern to fire pick dialog on Psychic detect / level change |
| `scripts/vagabond-character-enhancer.mjs` | **Modified.** Register `init` and `ready` wiring for Psychic system |
| `templates/talent-sheet.hbs` | Edit form for a Talent |
| `templates/talents-tab.hbs` | Talents tab content (cards + header) |
| `templates/talent-pick-dialog.hbs` | Pick dialog UI |
| `templates/talent-cast-dialog.hbs` | Cast dialog UI |
| `templates/talent-transcendence-dialog.hbs` | Swap dialog UI |
| `styles/vagabond-character-enhancer.css` | **Modified.** Talent tab + dialog styles |
| `module.json` | **Modified.** Register `vce-talents` pack |
| `packs/vce-talents/` | LevelDB pack containing 14 Talent items |
| `CLAUDE.md` | **Modified.** Add "Psychic / Talents" architecture section |

---

## Phase 1: Item type + data model + sheet

### Task 1: Talent data model + sheet registration

**Goal:** Register a `talent` item type with a data model, so a Talent item can exist as a document.

**Files:**
- Create: `scripts/talent/talent-data-model.mjs`
- Create: `scripts/talent/talent-sheet.mjs`
- Create: `templates/talent-sheet.hbs`
- Modify: `scripts/vagabond-character-enhancer.mjs` (import + call register at `init` hook)

**Acceptance Criteria:**
- [ ] `CONFIG.Item.dataModels.talent` is a class extending `foundry.abstract.TypeDataModel` with all spec fields.
- [ ] Creating an item with `type: "talent"` does not throw; data model defaults populate.
- [ ] Opening the Talent item sheet renders the edit form (no errors in console).
- [ ] Existing item types (equipment, spell, perk, etc.) still work.

**Verify:** In Foundry console:
```js
const tmp = await Item.create({name:"X", type:"talent"}, {temporary:true});
console.log(tmp.system); // should show damage, damageType, delivery, etc.
tmp.sheet.render(true); // should open sheet
```

**Steps:**

- [ ] **Step 1: Write the data model.** Create `scripts/talent/talent-data-model.mjs`:

```js
const { fields } = foundry.data;

export class TalentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ required: false, blank: true, initial: "" }),
      damage: new fields.StringField({ required: false, blank: true, initial: "" }),
      damageType: new fields.StringField({ required: false, blank: true, initial: "" }),
      effect: new fields.StringField({ required: false, blank: true, initial: "" }),
      delivery: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      duration: new fields.StringField({
        required: true,
        choices: ["instant", "focus", "continual"],
        initial: "instant"
      }),
      focusBuffAE: new fields.ObjectField({ required: false, nullable: true, initial: null }),
      aliasOf: new fields.StringField({ required: false, blank: true, initial: "" })
    };
  }
}
```

- [ ] **Step 2: Write the sheet class.** Create `scripts/talent/talent-sheet.mjs`:

```js
import { MODULE_ID } from "../utils.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class TalentSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vagabond", "sheet", "item", "vce-talent-sheet"],
    position: { width: 520, height: 600 },
    form: { submitOnChange: true, closeOnSubmit: false },
    window: { resizable: true }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/talent-sheet.hbs` }
  };

  async _prepareContext() {
    return {
      item: this.item,
      system: this.item.system,
      deliveryOptions: ["touch", "remote", "self", "cone", "sphere", "line", "aura", "cube", "glyph", "imbue"],
      durationOptions: ["instant", "focus", "continual"]
    };
  }
}
```

- [ ] **Step 3: Write the template.** Create `templates/talent-sheet.hbs`:

```hbs
<form>
  <header class="vce-talent-sheet-header">
    <img src="{{item.img}}" data-edit="img" />
    <input type="text" name="name" value="{{item.name}}" />
  </header>

  <section>
    <label>Description</label>
    <textarea name="system.description" rows="6">{{system.description}}</textarea>
  </section>

  <section class="vce-talent-grid">
    <label>Damage <input type="text" name="system.damage" value="{{system.damage}}" placeholder="e.g. 1d6"/></label>
    <label>Damage Type <input type="text" name="system.damageType" value="{{system.damageType}}"/></label>
    <label>Effect <input type="text" name="system.effect" value="{{system.effect}}"/></label>
    <label>Duration
      <select name="system.duration">
        {{#each durationOptions}}
          <option value="{{this}}" {{#if (eq this ../system.duration)}}selected{{/if}}>{{this}}</option>
        {{/each}}
      </select>
    </label>
    <label>Alias Of <input type="text" name="system.aliasOf" value="{{system.aliasOf}}" placeholder="e.g. burn"/></label>
  </section>

  <section>
    <label>Delivery (comma-separated)</label>
    <input type="text" name="system.delivery" value="{{join system.delivery ', '}}"/>
  </section>

  <section>
    <label>Focus Buff AE (JSON)</label>
    <textarea name="system.focusBuffAE" rows="4">{{json system.focusBuffAE}}</textarea>
  </section>
</form>
```

(Note: `join` and `json` Handlebars helpers may need registration; if unavailable, render as plain text with manual parsing in `_prepareContext`.)

- [ ] **Step 4: Wire registration in the module.** Modify `scripts/vagabond-character-enhancer.mjs` at the top:

```js
import { TalentData } from "./talent/talent-data-model.mjs";
import { TalentSheet } from "./talent/talent-sheet.mjs";

Hooks.once("init", () => {
  // Register the talent data model AFTER Vagabond's init has run.
  // The system replaces CONFIG.Item.dataModels in its init; we extend it.
  CONFIG.Item.dataModels.talent = TalentData;

  // Register sheet
  foundry.documents.collections.Items.registerSheet("vagabond-character-enhancer", TalentSheet, {
    types: ["talent"],
    makeDefault: true,
    label: "VCE.SheetLabels.Talent"
  });
});
```

If the existing entry-point module already has an `init` hook, append to it.

- [ ] **Step 5: Verify in Foundry.** Reload Foundry. Open console:

```js
// Should show TalentData
console.log(CONFIG.Item.dataModels.talent);

// Should create without error
const tmp = await Item.create({name:"Test", type:"talent"}, {temporary:true});
console.log(tmp.system);
tmp.sheet.render(true);
```

Confirm: data model fields visible, sheet opens cleanly, no console errors.

- [ ] **Step 6: Commit.**

```bash
git add scripts/talent/talent-data-model.mjs scripts/talent/talent-sheet.mjs templates/talent-sheet.hbs scripts/vagabond-character-enhancer.mjs
git commit -m "feat(psychic): add talent item type + data model + sheet"
```

---

## Phase 2: Build 14 Talents in `vce-talents`

### Task 2: Create the `vce-talents` pack and register it

**Goal:** Empty LevelDB pack registered in module.json, ready to receive Talent items.

**Files:**
- Create: `packs/vce-talents/` (directory)
- Modify: `module.json`

**Acceptance Criteria:**
- [ ] `module.json` lists the new pack.
- [ ] After Foundry reload, "VCE: Talents" shows in the Compendium tab.
- [ ] Pack count = 0.

**Verify:** In console: `game.packs.get("vagabond-character-enhancer.vce-talents")` returns a CompendiumCollection.

**Steps:**

- [ ] **Step 1: Add pack to module.json.** Find the `packs` array in `module.json` and append:

```json
{
  "name": "vce-talents",
  "label": "VCE: Talents",
  "path": "packs/vce-talents",
  "type": "Item",
  "system": "vagabond"
}
```

- [ ] **Step 2: Create the empty pack directory.** Foundry will populate the LevelDB on first write. Manually:

```bash
mkdir -p packs/vce-talents
```

- [ ] **Step 3: Reload Foundry.** Confirm pack appears in compendium browser, empty.

- [ ] **Step 4: Commit.**

```bash
git add module.json packs/vce-talents/
git commit -m "feat(psychic): register vce-talents compendium pack"
```

### Task 3: Build the 14 Talent items (content)

**Goal:** All 14 Talents authored in `vce-talents` per the spec table.

**Files:**
- Modify (via Foundry write-through): `packs/vce-talents/*` (LevelDB SST/log files)

**Acceptance Criteria:**
- [ ] Pack contains exactly 14 items, all of type `talent`.
- [ ] Each Talent has `damage`, `damageType`, `effect`, `delivery`, `duration`, `focusBuffAE` set per the spec table.
- [ ] The 4 buff Talents (Absence, Evade, Shield, Transvection) have non-null `focusBuffAE` with the right AE shape.
- [ ] The 10 spell-aliased Talents have `aliasOf` set to their source system spell name.

**Verify:** In console:
```js
const pack = game.packs.get("vagabond-character-enhancer.vce-talents");
const docs = await pack.getDocuments();
console.log(docs.length); // 14
docs.forEach(d => console.log(d.name, d.system.damage, d.system.delivery));
```

**Steps:**

- [ ] **Step 1: Author the 10 spell-aliased Talents.** Use the MCP bridge (`mcp__foundry-vtt__evaluate`) to programmatically create them. Example for Pyrokinesis:

```js
const pack = game.packs.get("vagabond-character-enhancer.vce-talents");
await pack.configure({ locked: false });

await Item.create({
  name: "Pyrokinesis",
  type: "talent",
  img: "icons/magic/fire/flame-burning-fist-gold.webp",
  system: {
    description: "<p>Acts as the Burn Spell.</p>",
    damage: "1d6",
    damageType: "fire",
    effect: "burning",
    delivery: ["touch", "remote", "cone", "sphere"],
    duration: "instant",
    focusBuffAE: null,
    aliasOf: "burn"
  }
}, { pack: "vagabond-character-enhancer.vce-talents" });
```

Repeat with appropriate values for: Cryokinesis (cold/restrained), Befuddle (confused), Control (Animate), Destroy, Launch (Kinesis), Manifest (Forge), Mediumship (Speak), Seize (charmed), Ascend (Levitate). Pull damage/delivery from each source spell in `vagabond.spells`.

- [ ] **Step 2: Author the 4 buff Talents.** Each has `focusBuffAE` set to an AE-shape object:

```js
// Absence
{
  name: "Absence",
  type: "talent",
  img: "icons/magic/perception/silhouette-stealth-shadow.webp",
  system: {
    description: "<p>While Focused: you are Invisible.</p>",
    damage: "",
    damageType: "",
    effect: "",
    delivery: ["self"],
    duration: "focus",
    focusBuffAE: {
      name: "Absence (Focus)",
      img: "icons/magic/perception/silhouette-stealth-shadow.webp",
      changes: [],
      statuses: ["invisible"]
    },
    aliasOf: ""
  }
}

// Evade — see Phase 6 for the die-bonus field decision
{
  name: "Evade",
  type: "talent",
  system: {
    description: "<p>While Focused: +d4 Reflex Save bonus.</p>",
    delivery: ["self"], duration: "focus",
    focusBuffAE: {
      name: "Evade (Focus)",
      changes: [{ key: "system.saves.reflex.bonusDie", mode: 2, value: "1d4", priority: null }]
    }
  }
}

// Shield — same pattern, key TBD in Phase 6
{
  name: "Shield",
  type: "talent",
  system: {
    description: "<p>While Focused: +d4 Armor bonus.</p>",
    delivery: ["self"], duration: "focus",
    focusBuffAE: {
      name: "Shield (Focus)",
      changes: [{ key: "system.armor.bonusDie", mode: 2, value: "1d4", priority: null }]
    }
  }
}

// Transvection
{
  name: "Transvection",
  type: "talent",
  system: {
    description: "<p>While Focused: you have Fly speed.</p>",
    delivery: ["self"], duration: "focus",
    focusBuffAE: {
      name: "Transvection (Focus)",
      changes: [{ key: "system.speedTypes", mode: 4, value: "fly", priority: null }]
    }
  }
}
```

(AE `changes.key` paths for Evade/Shield use `bonusDie`. Phase 6 verifies whether this field exists on `saves.reflex` and `armor` in the Vagabond system; if not, use the alternative approach Phase 6 documents.)

- [ ] **Step 3: Re-lock the pack.**

```js
await pack.configure({ locked: true });
```

- [ ] **Step 4: Verify count and shape.** Run the verify snippet from Acceptance Criteria.

- [ ] **Step 5: Commit.** With Foundry closed (so LevelDB is flushed):

```bash
git add packs/vce-talents/
git commit -m "feat(psychic): author 14 Talent items in vce-talents"
```

---

## Phase 3: Talents tab (render-only)

### Task 4: Inject the Talents tab on Psychic character sheets

**Goal:** When the character sheet of a Psychic actor renders, show a new "Talents" tab (cards with Cast/Focus stubs). Hidden for non-Psychic actors.

**Files:**
- Create: `scripts/talent/talents-tab.mjs`
- Create: `templates/talents-tab.hbs`
- Modify: `scripts/vagabond-character-enhancer.mjs` (import + register at `ready`)
- Modify: `styles/vagabond-character-enhancer.css` (add tab + card styles)

**Acceptance Criteria:**
- [ ] Opening a Psychic actor's sheet shows a "Talents" tab in the tab bar.
- [ ] Tab content lists all Talents the actor owns (from their items collection).
- [ ] Each card shows: icon, name, description excerpt, Cast button, Focus toggle. Buttons are stubs (logging only).
- [ ] Buff Talents render with a "Buff" badge instead of Cast.
- [ ] Header shows: `Mana Cap: {floor(level/2)}` · `Focus: 0/1`.
- [ ] Non-Psychic actors do NOT show the tab.

**Verify:** Open Psychic actor sheet → see Talents tab. Open Wizard actor sheet → no Talents tab.

**Steps:**

- [ ] **Step 1: Detect Psychic.** In `scripts/talent/talents-tab.mjs`:

```js
import { MODULE_ID } from "../utils.mjs";

export const TalentsTab = {
  init() {
    Hooks.on("renderActorSheetV2", (app, html) => this._injectTab(app, html));
  },

  _isPsychic(actor) {
    return actor.items.some(i => i.type === "class" && i.name === "Psychic");
  },

  _getKnownTalents(actor) {
    return actor.items.filter(i => i.type === "talent");
  },

  _getLevel(actor) {
    const psychicItem = actor.items.find(i => i.type === "class" && i.name === "Psychic");
    return psychicItem?.system?.level ?? 1;
  },

  _injectTab(app, html) {
    const actor = app.document;
    if (actor.type !== "character") return;
    if (!this._isPsychic(actor)) return;

    // Check tab already exists
    if (html.querySelector(".vce-talents-tab")) return;

    const level = this._getLevel(actor);
    const cap = Math.floor(level / 2);
    const talents = this._getKnownTalents(actor);
    const focusedIds = actor.getFlag(MODULE_ID, "psychicTalents")?.focusedIds ?? [];
    const maxFocus = actor.getFlag(MODULE_ID, "psychicTalents")?.maxFocus ?? 1;

    const ctx = {
      cap, maxFocus,
      focusedCount: focusedIds.length,
      level,
      talents: talents.map(t => ({
        id: t.id, name: t.name, img: t.img,
        descExcerpt: this._excerpt(t.system.description, 100),
        isBuff: !!t.system.focusBuffAE,
        isFocused: focusedIds.includes(t.id)
      }))
    };

    const tabContent = await foundry.applications.handlebars.renderTemplate(
      `modules/${MODULE_ID}/templates/talents-tab.hbs`, ctx
    );

    // Inject tab button + content. Pattern depends on Vagabond's character sheet
    // tab structure — verify by inspecting an open sheet:
    //   document.querySelector(".vagabond.sheet .sheet-tabs")
    // and adapt the injection accordingly.
    const tabBar = html.querySelector(".sheet-tabs");
    const tabBody = html.querySelector(".sheet-body");
    if (!tabBar || !tabBody) return;

    const tabBtn = document.createElement("a");
    tabBtn.className = "item vce-talents-tab-btn";
    tabBtn.dataset.tab = "vce-talents";
    tabBtn.textContent = "Talents";
    tabBar.appendChild(tabBtn);

    const tabSection = document.createElement("section");
    tabSection.className = "tab vce-talents-tab";
    tabSection.dataset.tab = "vce-talents";
    tabSection.innerHTML = tabContent;
    tabBody.appendChild(tabSection);

    // Wire stub Cast / Focus buttons (Phase 5 + 6 replace these)
    tabSection.querySelectorAll("[data-action='cast-talent']").forEach(b =>
      b.addEventListener("click", e => console.log("cast", e.currentTarget.dataset.talentId))
    );
    tabSection.querySelectorAll("[data-action='focus-talent']").forEach(b =>
      b.addEventListener("click", e => console.log("focus", e.currentTarget.dataset.talentId))
    );
  },

  _excerpt(html, len) {
    const text = (html ?? "").replace(/<[^>]+>/g, "");
    return text.length > len ? text.slice(0, len) + "…" : text;
  }
};
```

(The render hook name and tab-injection DOM selectors above are best-guess — verify against Vagabond's sheet during implementation by inspecting `document.querySelector(".vagabond.sheet")` on an open sheet, then adapt.)

- [ ] **Step 2: Write the template.** Create `templates/talents-tab.hbs`:

```hbs
<div class="vce-talents-content">
  <header class="vce-talents-header">
    <span class="vce-talents-stat">Mana Cap: <strong>{{cap}}</strong></span>
    <span class="vce-talents-stat">Focus: <strong>{{focusedCount}}/{{maxFocus}}</strong></span>
    <button type="button" data-action="pick-talents" class="vce-talents-btn">Pick Talents</button>
    {{#if (gte level 10)}}
      <button type="button" data-action="transcendence" class="vce-talents-btn">Transcendence</button>
    {{/if}}
  </header>

  <div class="vce-talents-cards">
    {{#each talents}}
      <div class="vce-talent-card{{#if isFocused}} vce-talent-focused{{/if}}" data-talent-id="{{id}}">
        <img src="{{img}}" class="vce-talent-img" alt=""/>
        <div class="vce-talent-info">
          <div class="vce-talent-name">{{name}}</div>
          <div class="vce-talent-desc">{{descExcerpt}}</div>
        </div>
        <div class="vce-talent-actions">
          {{#unless isBuff}}
            <button type="button" data-action="cast-talent" data-talent-id="{{id}}" class="vce-talent-btn-cast">Cast</button>
          {{else}}
            <span class="vce-talent-buff-badge">Buff</span>
          {{/unless}}
          <button type="button" data-action="focus-talent" data-talent-id="{{id}}" class="vce-talent-btn-focus">
            {{#if isFocused}}Unfocus{{else}}Focus{{/if}}
          </button>
        </div>
      </div>
    {{else}}
      <div class="vce-talents-empty">No Talents known. Click "Pick Talents" to choose your starting set.</div>
    {{/each}}
  </div>
</div>
```

- [ ] **Step 3: Add CSS.** Append to `styles/vagabond-character-enhancer.css`:

```css
/* Talents tab */
.vce-talents-content { padding: 12px; }
.vce-talents-header {
  display: flex; gap: 12px; align-items: center;
  margin-bottom: 12px; padding-bottom: 8px;
  border-bottom: 1px solid var(--vagabond-c-tan);
}
.vce-talents-stat { color: var(--vagabond-c-text-primary); font-family: "Paradigm", serif; font-size: 12px; }
.vce-talents-stat strong { color: var(--vce-accent); }
.vce-talents-btn {
  margin-left: auto; padding: 4px 10px;
  background: var(--vce-accent-bg-hover);
  border: 1px solid var(--vce-accent);
  color: var(--vagabond-c-text-primary);
  font-family: "Germania", serif; font-size: 12px;
  border-radius: 3px; cursor: pointer;
}
.vce-talents-btn:hover { background: var(--vce-accent-bg-active); }
.vce-talents-cards { display: flex; flex-direction: column; gap: 6px; }
.vce-talent-card {
  display: flex; gap: 8px; align-items: center;
  padding: 6px; background: var(--vce-surface);
  border: 1px solid var(--vagabond-c-tan); border-radius: 4px;
}
.vce-talent-focused { border-color: var(--vce-accent); background: var(--vce-accent-bg-quiet); }
.vce-talent-img { width: 40px; height: 40px; border-radius: 3px; }
.vce-talent-info { flex: 1; min-width: 0; }
.vce-talent-name { font-family: "Manofa", sans-serif; font-weight: bold; color: var(--vce-accent); }
.vce-talent-desc { font-size: 11px; color: var(--vagabond-c-text-primary); opacity: 0.85; }
.vce-talent-actions { display: flex; gap: 4px; flex-shrink: 0; }
.vce-talent-btn-cast, .vce-talent-btn-focus {
  padding: 3px 8px; font-size: 11px; font-family: "Germania", serif;
  background: transparent; border: 1px solid var(--vce-accent);
  color: var(--vce-accent); border-radius: 3px; cursor: pointer;
}
.vce-talent-btn-cast:hover, .vce-talent-btn-focus:hover { background: var(--vce-accent-bg-hover); }
.vce-talent-buff-badge {
  padding: 3px 8px; font-size: 10px; font-family: "Manofa", sans-serif;
  text-transform: uppercase;
  background: var(--vce-inspiration-accent); color: white;
  border-radius: 3px;
}
.vce-talents-empty {
  padding: 24px; text-align: center; opacity: 0.6;
  color: var(--vagabond-c-text-primary);
}
```

- [ ] **Step 4: Wire init in module entry.** Modify `scripts/vagabond-character-enhancer.mjs` to import and call `TalentsTab.init()` in the `ready` hook:

```js
import { TalentsTab } from "./talent/talents-tab.mjs";
// ... at ready hook:
TalentsTab.init();
```

- [ ] **Step 5: Verify.** Open a Psychic actor's sheet → Talents tab visible. Open a Wizard's sheet → no Talents tab.

- [ ] **Step 6: Manual sanity drop a Talent.** Drag Pyrokinesis from the compendium onto the Psychic actor → it should appear as a card.

- [ ] **Step 7: Commit.**

```bash
git add scripts/talent/talents-tab.mjs templates/talents-tab.hbs styles/vagabond-character-enhancer.css scripts/vagabond-character-enhancer.mjs
git commit -m "feat(psychic): inject Talents tab on Psychic character sheets"
```

---

## Phase 4: Pick dialog + class detection

### Task 5: Build the Talent pick dialog

**Goal:** A DialogV2 picker the player uses to select Talents. Standalone — fired manually for now.

**Files:**
- Create: `scripts/talent/talent-pick-dialog.mjs`
- Create: `templates/talent-pick-dialog.hbs`

**Acceptance Criteria:**
- [ ] `TalentPickDialog.show(actor, n)` opens a dialog showing all 14 Talents minus already-known ones.
- [ ] Player checks N talents (live counter).
- [ ] Confirm: dialog closes, returns `[{name, id}]` of picked Talents.
- [ ] Cancel: returns null.

**Verify:** From console, with a Psychic actor:
```js
const result = await TalentPickDialog.show(actor, 3);
console.log(result);
```

**Steps:**

- [ ] **Step 1: Build the dialog.** Create `scripts/talent/talent-pick-dialog.mjs`:

```js
import { MODULE_ID } from "../utils.mjs";

export const TalentPickDialog = {
  async show(actor, count) {
    const pack = game.packs.get(`${MODULE_ID}.vce-talents`);
    const allTalents = await pack.getDocuments();
    const knownNames = new Set(actor.items.filter(i => i.type === "talent").map(i => i.name));
    const available = allTalents.filter(t => !knownNames.has(t.name));

    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => { if (!settled) { settled = true; resolve(v); } };

      const rows = available.map(t => `
        <tr class="vce-talent-pick-row" data-talent-id="${t.id}" data-talent-name="${t.name}" tabindex="0">
          <td><img src="${t.img}" alt="" style="width:32px;height:32px;"/></td>
          <td><strong>${t.name}</strong></td>
          <td>${t.system.damage || "—"}</td>
          <td>${(t.system.delivery || []).join(", ") || "—"}</td>
          <td>${t.system.duration}</td>
          <td><input type="checkbox" data-pick-id="${t.id}" data-pick-name="${t.name}"/></td>
        </tr>
      `).join("");

      const content = `
        <form class="vce-creature-picker">
          <div class="vce-cp-header">
            <p class="vce-cp-budget">Pick <strong>${count}</strong> Talent${count > 1 ? "s" : ""} · Selected: <span class="vce-tp-count">0</span>/${count}</p>
          </div>
          <div class="vce-bd-scroll vce-cp-scroll">
            <table class="vce-bd-table vce-cp-table">
              <thead><tr><th></th><th>Name</th><th>Damage</th><th>Delivery</th><th>Duration</th><th></th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </form>`;

      const dialog = new foundry.applications.api.DialogV2({
        window: { title: `${actor.name} — Pick ${count} Talent${count > 1 ? "s" : ""}`, resizable: true },
        position: { width: 700, height: 560 },
        classes: ["vce-creature-picker-app"],
        content,
        buttons: [
          {
            action: "confirm", label: "Confirm", icon: "fas fa-check", default: true,
            callback: () => {
              const picked = [];
              dialog.element.querySelectorAll("input[data-pick-id]:checked").forEach(cb => {
                picked.push({ id: cb.dataset.pickId, name: cb.dataset.pickName });
              });
              if (picked.length !== count) {
                ui.notifications.warn(`Pick exactly ${count}.`);
                throw new Error("invalid pick count"); // prevents close
              }
              finish(picked);
            }
          },
          { action: "cancel", label: "Cancel", icon: "fas fa-times", callback: () => finish(null) }
        ],
        rejectClose: false
      });

      Hooks.once("closeDialogV2", (app) => { if (app === dialog) finish(null); });

      dialog.render({ force: true }).then(() => {
        const root = dialog.element;
        const counter = root.querySelector(".vce-tp-count");
        const checkboxes = root.querySelectorAll("input[data-pick-id]");
        const updateCount = () => {
          const n = root.querySelectorAll("input[data-pick-id]:checked").length;
          counter.textContent = String(n);
          // Cap selection at count
          if (n > count) {
            const last = root.querySelector("input[data-pick-id]:checked");
            if (last) last.checked = false;
            counter.textContent = String(count);
            ui.notifications.warn(`Maximum ${count} selected.`);
          }
        };
        checkboxes.forEach(cb => cb.addEventListener("change", updateCount));
      });
    });
  }
};
```

- [ ] **Step 2: Wire import in module entry.**

```js
import { TalentPickDialog } from "./talent/talent-pick-dialog.mjs";
// expose for testing
game.vagabondCharacterEnhancer.talentPicker = TalentPickDialog;
```

- [ ] **Step 3: Verify.** Console:

```js
const actor = game.actors.find(a => a.items.some(i => i.type === "class" && i.name === "Psychic"));
const result = await game.vagabondCharacterEnhancer.talentPicker.show(actor, 3);
console.log(result);
```

Confirm: dialog renders, can pick 3, returns array on confirm, returns null on cancel.

- [ ] **Step 4: Commit.**

```bash
git add scripts/talent/talent-pick-dialog.mjs scripts/vagabond-character-enhancer.mjs
git commit -m "feat(psychic): Talent pick dialog"
```

### Task 6: Auto-fire pick dialog on class detection / level-up

**Goal:** When a Psychic actor needs to pick Talents (level tier not yet completed), the dialog opens automatically.

**Files:**
- Modify: `scripts/feature-detector.mjs` (extend the existing scan flow)
- Modify: `scripts/vagabond-character-enhancer.mjs` (wire any new hooks)

**Acceptance Criteria:**
- [ ] When a Psychic class is added to a fresh actor, picker fires for 3 Talents.
- [ ] When a Psychic actor levels to 3 / 5 / 7 / 9, picker fires for 1 Talent.
- [ ] When a level tier's pick is already complete (in `psychicTalentsPicked` flag), picker does NOT re-fire.
- [ ] Cancelling the picker leaves the tier unmarked — fires again next sheet open.
- [ ] On confirm, the picked Talents are created on the actor.

**Verify:**
1. Create a fresh actor, drag the Psychic class onto it → picker fires for 3.
2. Pick 3, confirm → 3 Talents appear in the actor's items.
3. Level the actor to 3 (`actor.update({"items.<psychicId>.system.level": 3})`) → picker fires for 1.

**Steps:**

- [ ] **Step 1: Identify the existing class-detection extension point.** Read `scripts/feature-detector.mjs` to find where class items are scanned (search for `"class"` and the existing perk-grant logic).

- [ ] **Step 2: Add Psychic-specific check.** After the existing class scan, add:

```js
async function _checkPsychicTalentPicks(actor) {
  const psychic = actor.items.find(i => i.type === "class" && i.name === "Psychic");
  if (!psychic) return;
  const level = psychic.system.level ?? 1;

  const picked = actor.getFlag(MODULE_ID, "psychicTalentsPicked") ?? [];

  // Required tiers: 1 (3 picks), 3/5/7/9 (1 pick each)
  const tiers = [
    { tier: 1, count: 3 },
    { tier: 3, count: 1 },
    { tier: 5, count: 1 },
    { tier: 7, count: 1 },
    { tier: 9, count: 1 },
  ];

  for (const { tier, count } of tiers) {
    if (level < tier) break;
    if (picked.includes(tier)) continue;

    const result = await TalentPickDialog.show(actor, count);
    if (!result) return; // cancelled — don't mark, will re-fire next time

    // Create Talent items on actor
    const pack = game.packs.get(`${MODULE_ID}.vce-talents`);
    const ids = result.map(r => r.id);
    const docs = await Promise.all(ids.map(id => pack.getDocument(id)));
    const itemData = docs.map(d => d.toObject());
    await actor.createEmbeddedDocuments("Item", itemData);

    // Mark tier complete
    await actor.setFlag(MODULE_ID, "psychicTalentsPicked", [...picked, tier]);
    picked.push(tier); // local copy for next iteration
  }
}
```

Call `_checkPsychicTalentPicks(actor)` from the existing scan path (look for where class detection runs and append).

- [ ] **Step 3: Verify on a fresh actor.**

```js
const actor = await Actor.create({ name: "PsychicTest", type: "character" });
const psychicClass = await game.packs.get("vagabond-character-enhancer.vce-classes").getDocument("XDFLTeYYprqVxGsF");
await actor.createEmbeddedDocuments("Item", [psychicClass.toObject()]);
// → Picker should fire for 3
```

After picking 3, confirm `actor.items` contains 3 items of type `talent`.

- [ ] **Step 4: Verify level-up trigger.**

```js
const psy = actor.items.find(i => i.name === "Psychic");
await psy.update({ "system.level": 3 });
await game.vagabondCharacterEnhancer.rescan(actor);
// → Picker fires for 1
```

- [ ] **Step 5: Commit.**

```bash
git add scripts/feature-detector.mjs
git commit -m "feat(psychic): auto-fire pick dialog on class detection + level-up"
```

---

## Phase 5: Cast pipeline

### Task 7: Build the Talent cast dialog (full RAW)

**Goal:** Click Cast on a Talent card → dialog opens with damage slider + delivery dropdown + effect toggle + duration radio, all bounded by `floor(level/2)` Mana cap.

**Files:**
- Create: `scripts/talent/talent-cast.mjs`
- Create: `templates/talent-cast-dialog.hbs`

**Acceptance Criteria:**
- [ ] Cast dialog opens with damage dice slider (0 to remaining cap, capped at the talent's max damage scaling).
- [ ] Delivery dropdown filtered to (Talent's `delivery` array) AND (deliveries affordable at remaining cap).
- [ ] Effect toggle: greyed out if remaining cap < 1 OR if Talent has no `effect`.
- [ ] Duration radio: Instant or Focus (free).
- [ ] Live counter shows `Spent: X / Cap`.
- [ ] On submit, returns `{damageDice, delivery, hasEffect, isFocused}`. On cancel, returns null.

**Verify:** From console:
```js
const result = await TalentCast.openDialog(actor, talentItem);
console.log(result);
```

**Steps:**

- [ ] **Step 1: Identify delivery base costs.** Read the Vagabond rulebook (`F:/Obsidian/Vagabond/Vagabond/Core Rulebook/05_Magic/`) or grep system code for delivery costs. Hardcode them in `scripts/talent/talent-cast.mjs`:

```js
const DELIVERY_COSTS = {
  touch: 0, remote: 0, self: 0,    // free
  imbue: 0,   // 1 Mana minimum elsewhere — exclude from Talents
  cone: 1, line: 1, glyph: 1,
  sphere: 2, cube: 2, aura: 2
};
```

(Verify these against the rulebook before coding. Adjust as needed.)

- [ ] **Step 2: Build the dialog.** Create `scripts/talent/talent-cast.mjs`:

```js
import { MODULE_ID } from "../utils.mjs";

const DELIVERY_COSTS = {
  touch: 0, remote: 0, self: 0,
  cone: 1, line: 1, glyph: 1,
  sphere: 2, cube: 2, aura: 2
};

export const TalentCast = {
  getCap(actor) {
    const psy = actor.items.find(i => i.type === "class" && i.name === "Psychic");
    return Math.floor((psy?.system?.level ?? 1) / 2);
  },

  async openDialog(actor, talent) {
    const cap = this.getCap(actor);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => { if (!settled) { settled = true; resolve(v); } };

      // Filter deliveries to affordable subset of talent's allowed list
      const deliveries = (talent.system.delivery || []).filter(d => DELIVERY_COSTS[d] <= cap);
      const hasDamage = !!talent.system.damage;
      const hasEffect = !!talent.system.effect;

      const content = await foundry.applications.handlebars.renderTemplate(
        `modules/${MODULE_ID}/templates/talent-cast-dialog.hbs`,
        { cap, talent, deliveries, hasDamage, hasEffect, deliveryCosts: DELIVERY_COSTS }
      );

      const dialog = new foundry.applications.api.DialogV2({
        window: { title: `Cast ${talent.name}`, resizable: true },
        position: { width: 480, height: 460 },
        classes: ["vce-creature-picker-app"],
        content,
        buttons: [
          {
            action: "cast", label: "Cast", icon: "fas fa-magic", default: true,
            callback: () => {
              const root = dialog.element;
              const damageDice = parseInt(root.querySelector("input[name='damageDice']")?.value ?? "0");
              const delivery = root.querySelector("select[name='delivery']")?.value ?? "touch";
              const hasEffect = root.querySelector("input[name='hasEffect']")?.checked ?? false;
              const duration = root.querySelector("input[name='duration']:checked")?.value ?? "instant";
              const totalSpend = damageDice + DELIVERY_COSTS[delivery] + (hasEffect ? 1 : 0);
              if (totalSpend > cap) {
                ui.notifications.warn(`Over cap (${totalSpend}/${cap}).`);
                throw new Error("over cap");
              }
              finish({ damageDice, delivery, hasEffect, isFocused: duration === "focus" });
            }
          },
          { action: "cancel", label: "Cancel", icon: "fas fa-times", callback: () => finish(null) }
        ],
        rejectClose: false
      });

      Hooks.once("closeDialogV2", (app) => { if (app === dialog) finish(null); });

      dialog.render({ force: true }).then(() => this._wireSliderListeners(dialog, cap, talent));
    });
  },

  _wireSliderListeners(dialog, cap, talent) {
    const root = dialog.element;
    const counter = root.querySelector(".vce-tc-counter");
    const update = () => {
      const dmg = parseInt(root.querySelector("input[name='damageDice']")?.value ?? "0");
      const del = root.querySelector("select[name='delivery']")?.value ?? "touch";
      const fx = root.querySelector("input[name='hasEffect']")?.checked ? 1 : 0;
      const total = dmg + DELIVERY_COSTS[del] + fx;
      counter.textContent = `Spent: ${total} / ${cap}`;
      counter.style.color = total > cap ? "#ff8888" : "";
    };
    root.querySelectorAll("input, select").forEach(el => el.addEventListener("input", update));
  }
};
```

- [ ] **Step 3: Write the cast dialog template.** Create `templates/talent-cast-dialog.hbs`:

```hbs
<form class="vce-talent-cast">
  <header><h3>{{talent.name}}</h3></header>
  <p class="vce-tc-counter">Spent: 0 / {{cap}}</p>

  {{#if hasDamage}}
    <label>Damage Dice (extra): <input type="range" name="damageDice" min="0" max="{{cap}}" value="0"/></label>
  {{/if}}

  <label>Delivery
    <select name="delivery">
      {{#each deliveries}}<option value="{{this}}">{{this}} (cost {{lookup ../deliveryCosts this}})</option>{{/each}}
    </select>
  </label>

  {{#if hasEffect}}
    <label><input type="checkbox" name="hasEffect"/> Add Effect: {{talent.effect}} (+1 Mana)</label>
  {{/if}}

  <fieldset>
    <legend>Duration</legend>
    <label><input type="radio" name="duration" value="instant" checked/> Instant</label>
    <label><input type="radio" name="duration" value="focus"/> Focus</label>
  </fieldset>
</form>
```

- [ ] **Step 4: Verify dialog UX.** From console:
```js
const actor = game.actors.find(...);
const talent = actor.items.find(i => i.type === "talent" && i.name === "Pyrokinesis");
const result = await game.vagabondCharacterEnhancer.talentCast.openDialog(actor, talent);
```
Confirm: dialog renders, slider works, counter updates live, returns config on cast.

- [ ] **Step 5: Commit.**

```bash
git add scripts/talent/talent-cast.mjs templates/talent-cast-dialog.hbs scripts/vagabond-character-enhancer.mjs
git commit -m "feat(psychic): Talent cast dialog (full RAW)"
```

### Task 8: Resolve cast → roll damage → render chat card

**Goal:** When the player confirms the cast dialog, the cast actually happens — damage rolls, chat card appears, save button works.

**Files:**
- Modify: `scripts/talent/talent-cast.mjs` (add `executeCast` method)
- Modify: `scripts/talent/talents-tab.mjs` (replace stub Cast handler)

**Acceptance Criteria:**
- [ ] Click Cast on Pyrokinesis → dialog → confirm → chat card appears with damage roll.
- [ ] Save button on the card routes through existing VCE save handling.
- [ ] If `damageDice = 0` and `effect` set, card shows effect-only application.

**Verify:** Cast Pyrokinesis at L1 Touch → see 1d6 fire damage card. Apply Direct → target HP drops.

**Steps:**

- [ ] **Step 1: Add executeCast method.** In `scripts/talent/talent-cast.mjs`:

```js
async executeCast(actor, talent, config) {
  // Build a "spell-shape" object from the Talent for the existing helpers.
  // The spell helpers expect a structure like { name, system: {damage, damageType, effects, delivery, duration} }.
  const baseDice = talent.system.damage || "0";   // e.g., "1d6"
  const totalDice = config.damageDice > 0 ? `${baseDice}+${config.damageDice}d6` : baseDice;
  const targets = Array.from(game.user.targets).map(t => t.id);

  // Adapt to VagabondDamageHelper.rollSpellDamage signature (read its source first).
  const helper = CONFIG.VAGABOND?._damageHelper ?? game.system?.applications?.damageHelper;

  const cardData = {
    actor, item: talent,
    damageFormula: totalDice,
    damageType: talent.system.damageType,
    effect: config.hasEffect ? talent.system.effect : null,
    delivery: config.delivery,
    targets,
    isTalent: true
  };

  // Render chat card via existing helper. If signature doesn't match, fall back to
  // direct ChatMessage.create with a custom template (talent-chat-card.hbs).
  await game.system.api.VagabondChatCard.spellCast(cardData);
},
```

(The actual call signature for `VagabondChatCard.spellCast` and `VagabondDamageHelper.rollSpellDamage` must be inspected during implementation. Read `vagabond/module/helpers/chat-card.mjs` and adapt. If the spell-shape adapter is messy, ship `templates/talent-chat-card.hbs` and call `ChatMessage.create` directly.)

- [ ] **Step 2: Wire from the Cast button.** In `talents-tab.mjs`, replace the stub:

```js
import { TalentCast } from "./talent-cast.mjs";

// ... in _injectTab, replace the cast handler:
tabSection.querySelectorAll("[data-action='cast-talent']").forEach(b =>
  b.addEventListener("click", async e => {
    const talent = actor.items.get(e.currentTarget.dataset.talentId);
    const config = await TalentCast.openDialog(actor, talent);
    if (!config) return;
    await TalentCast.executeCast(actor, talent, config);
  })
);
```

- [ ] **Step 3: Verify end-to-end.** Cast Pyrokinesis Touch instant from L1 Psychic → chat card → roll damage button → applied to target.

- [ ] **Step 4: Iterate on chat card adapter.** If the system's spellCast helper isn't a clean fit, build `templates/talent-chat-card.hbs` and a direct `ChatMessage.create` call. Note that any save button on the card must wire through `VagabondDamageHelper.handleSaveRoll` so VCE's save-routing patches still apply.

- [ ] **Step 5: Commit.**

```bash
git add scripts/talent/talent-cast.mjs scripts/talent/talents-tab.mjs
git commit -m "feat(psychic): execute Talent cast → damage roll → chat card"
```

---

## Phase 6: Focus tracking + buff Talents

### Task 9: Verify die-bonus AE field shape

**Goal:** Determine whether `system.saves.reflex.bonusDie` and `system.armor.bonusDie` exist in the Vagabond system; if not, document the alternative.

**Files:** None (research-only).

**Acceptance Criteria:**
- [ ] Open decision (#3 in spec) is locked: either confirm the bonusDie field exists or document the Bard-Virtuoso-style alternative.

**Steps:**

- [ ] **Step 1: Inspect system data.**
```bash
grep -rn "bonusDie\|bonus.*die\|favorDie" "E:/FoundryVTTv13/data/Data/systems/vagabond/module/data/"
```

- [ ] **Step 2: Inspect Bard Virtuoso implementation.**
```bash
grep -n "Resolve\|favorDie" scripts/class-features/bard.mjs
```

- [ ] **Step 3: Test in Foundry.** Create an AE on a test actor with `system.saves.reflex.bonusDie = "1d4"`; roll a Reflex save; check whether the d4 is added.

- [ ] **Step 4: Document the chosen approach.** Update Task 3's Step 2 buff Talent definitions for Evade and Shield with the verified AE shape. Update [spec](../specs/2026-04-24-psychic-class-design.md) Open Decisions section.

- [ ] **Step 5: No code change yet — just inform Task 10.**

### Task 10: Multi-focus capacity (Duality)

**Goal:** Set `flags.vce.psychicTalents.maxFocus` based on Psychic class level. Updates on level-up.

**Files:**
- Create: `scripts/class-features/psychic.mjs`
- Modify: `scripts/feature-detector.mjs` (call into psychic class handler)
- Modify: `scripts/vagabond-character-enhancer.mjs` (register hooks)

**Acceptance Criteria:**
- [ ] L1-3 Psychic actor has `flags.vce.psychicTalents.maxFocus === 1`.
- [ ] L4-7 Psychic actor has `maxFocus === 2`.
- [ ] L8+ Psychic actor has `maxFocus === 3`.
- [ ] Updates automatically when level changes.
- [ ] Initial state (no flag set) treated as maxFocus = 1.

**Verify:**
```js
const actor = game.actors.find(...);
const psy = actor.items.find(i => i.name === "Psychic");
await psy.update({"system.level": 4});
console.log(actor.getFlag("vagabond-character-enhancer", "psychicTalents"));
// {focusedIds: [], maxFocus: 2}
```

**Steps:**

- [ ] **Step 1: Create the psychic class handler.**

```js
import { MODULE_ID } from "../utils.mjs";

export const PsychicFeatures = {
  init() {
    Hooks.on("updateItem", (item, changes) => {
      if (item.type !== "class" || item.name !== "Psychic") return;
      if (changes?.system?.level === undefined) return;
      const actor = item.parent;
      if (!actor) return;
      this._updateMaxFocus(actor, item.system.level);
    });
    Hooks.on("createItem", (item) => {
      if (item.type !== "class" || item.name !== "Psychic") return;
      const actor = item.parent;
      if (!actor) return;
      this._updateMaxFocus(actor, item.system.level ?? 1);
    });
  },

  computeMaxFocus(level) {
    if (level >= 8) return 3;
    if (level >= 4) return 2;
    return 1;
  },

  async _updateMaxFocus(actor, level) {
    const cur = actor.getFlag(MODULE_ID, "psychicTalents") ?? { focusedIds: [], maxFocus: 1 };
    const next = this.computeMaxFocus(level);
    if (cur.maxFocus === next) return;
    await actor.setFlag(MODULE_ID, "psychicTalents", { ...cur, maxFocus: next });
  }
};
```

- [ ] **Step 2: Wire init in module entry.**

```js
import { PsychicFeatures } from "./class-features/psychic.mjs";
// ... at ready:
PsychicFeatures.init();
```

- [ ] **Step 3: Verify.** Level a Psychic actor 1 → 4 → 8 and inspect the flag at each step.

- [ ] **Step 4: Commit.**

```bash
git add scripts/class-features/psychic.mjs scripts/vagabond-character-enhancer.mjs
git commit -m "feat(psychic): Duality — level-scaling maxFocus capacity"
```

### Task 11: Focus toggle + buff AE manager

**Goal:** Click Focus on a Talent card → toggle in `focusedIds`, apply/remove `focusBuffAE` for buff Talents. Reject when over capacity.

**Files:**
- Create: `scripts/talent/talent-buffs.mjs`
- Modify: `scripts/talent/talents-tab.mjs` (replace stub Focus handler)

**Acceptance Criteria:**
- [ ] Click Focus on Shield → `focusedIds` contains the Shield item id, AE applied to actor with origin `Talent.<id>`.
- [ ] Click Unfocus on Shield → `focusedIds` empty, AE removed.
- [ ] Trying to focus a 2nd Talent at L1-3 → rejected with notification.
- [ ] After leveling to 4, can focus 2 simultaneously.
- [ ] Re-rendering the Talents tab shows correct focus state.

**Verify:** Focus Shield via UI → check `actor.effects` includes the AE → check `actor.getFlag("vagabond-character-enhancer", "psychicTalents").focusedIds`.

**Steps:**

- [ ] **Step 1: Build the buff manager.** Create `scripts/talent/talent-buffs.mjs`:

```js
import { MODULE_ID } from "../utils.mjs";

export const TalentBuffs = {
  /**
   * Toggle focus on a Talent. Returns true if added, false if removed,
   * null if rejected (over capacity).
   */
  async toggleFocus(actor, talent) {
    const flag = actor.getFlag(MODULE_ID, "psychicTalents") ?? { focusedIds: [], maxFocus: 1 };
    const idx = flag.focusedIds.indexOf(talent.id);

    if (idx >= 0) {
      // Remove
      flag.focusedIds.splice(idx, 1);
      await actor.setFlag(MODULE_ID, "psychicTalents", flag);
      if (talent.system.focusBuffAE) await this._removeBuffAE(actor, talent);
      return false;
    }

    // Add
    if (flag.focusedIds.length >= flag.maxFocus) {
      ui.notifications.warn(`Focus capacity full (${flag.focusedIds.length}/${flag.maxFocus}). Drop another Talent first.`);
      return null;
    }
    flag.focusedIds.push(talent.id);
    await actor.setFlag(MODULE_ID, "psychicTalents", flag);
    if (talent.system.focusBuffAE) await this._applyBuffAE(actor, talent);
    return true;
  },

  async _applyBuffAE(actor, talent) {
    const ae = foundry.utils.deepClone(talent.system.focusBuffAE);
    ae.origin = `Talent.${talent.id}`;
    ae.flags = { ...(ae.flags || {}), [MODULE_ID]: { talentId: talent.id } };
    await actor.createEmbeddedDocuments("ActiveEffect", [ae]);
  },

  async _removeBuffAE(actor, talent) {
    const ae = actor.effects.find(e => e.getFlag(MODULE_ID, "talentId") === talent.id);
    if (ae) await ae.delete();
  }
};
```

- [ ] **Step 2: Wire from the Focus button.** In `talents-tab.mjs`:

```js
import { TalentBuffs } from "./talent-buffs.mjs";

// In _injectTab:
tabSection.querySelectorAll("[data-action='focus-talent']").forEach(b =>
  b.addEventListener("click", async e => {
    const talent = actor.items.get(e.currentTarget.dataset.talentId);
    const result = await TalentBuffs.toggleFocus(actor, talent);
    if (result !== null) {
      app.render(); // re-render to update focus indicators + counter
    }
  })
);
```

- [ ] **Step 3: Verify each buff.** For each of (Absence, Evade, Shield, Transvection):
  1. Focus → check `actor.effects` for the AE.
  2. Verify the buff applies (e.g., for Shield, roll a damage attack against the actor and confirm armor is increased).
  3. Unfocus → AE removed.

- [ ] **Step 4: Verify capacity.** With L1 Psychic, focus Shield → focus Absence → expect rejection notification.

- [ ] **Step 5: Commit.**

```bash
git add scripts/talent/talent-buffs.mjs scripts/talent/talents-tab.mjs
git commit -m "feat(psychic): focus toggle + buff AE manager"
```

---

## Phase 7: Class features

### Task 12: Mental Fortress (L6) status immunities

**Goal:** Passive AE granting immunity to Berserk, Charmed, Confused, Frightened at L6+.

**Files:**
- Modify: `scripts/class-features/psychic.mjs` (add registry entry, hook into level scan)

**Acceptance Criteria:**
- [ ] L6+ Psychic actor has an AE granting `system.statusImmunities ADD "berserk,charmed,confused,frightened"`.
- [ ] AE removed if Psychic level drops below 6.
- [ ] AE is module-managed (flag `flags.vagabond-character-enhancer.managed: true`).

**Verify:** `actor.system.statusImmunities` contains the four keywords for L6+.

**Steps:**

- [ ] **Step 1: Add to PSYCHIC_REGISTRY.** Following the registry pattern used by other classes (read `scripts/class-features/barbarian.mjs` or similar for the pattern). Append to `psychic.mjs`:

```js
export const PSYCHIC_REGISTRY = {
  mentalFortress: {
    class: "Psychic", level: 6, flag: "psychic_mentalFortress",
    status: "module",
    description: "Cannot be Berserk, Charmed, Confused, or Frightened against your will.",
    effects: [{
      name: "Mental Fortress",
      img: "icons/magic/control/control-influence-puppet.webp",
      changes: [
        { key: "system.statusImmunities", mode: 4, value: "berserk,charmed,confused,frightened", priority: null }
      ]
    }]
  }
};
```

- [ ] **Step 2: Wire registry into feature-detector.** Find where other class registries are imported and extended, add Psychic registry alongside.

- [ ] **Step 3: Verify.** Level a Psychic to 6, scan, check `actor.effects` and `actor.system.statusImmunities`.

- [ ] **Step 4: Commit.**

```bash
git add scripts/class-features/psychic.mjs scripts/feature-detector.mjs
git commit -m "feat(psychic): Mental Fortress (L6) status immunities AE"
```

### Task 13: Awakening — flag for "mind as Trinket"

**Goal:** L1 Psychic gets `flags.vagabond-character-enhancer.psychicMindTrinket: true` on class detection. Telepath grant remains player-driven via the existing `perkAmount: 1`.

**Files:**
- Modify: `scripts/class-features/psychic.mjs`

**Acceptance Criteria:**
- [ ] After Psychic class is added, `actor.getFlag("vagabond-character-enhancer", "psychicMindTrinket")` returns `true`.
- [ ] Flag is set once and persists.

**Verify:** `actor.getFlag("vagabond-character-enhancer", "psychicMindTrinket") === true`.

**Steps:**

- [ ] **Step 1: Set flag on class detect.** Add to `PsychicFeatures.init()` create-item hook:

```js
Hooks.on("createItem", async (item) => {
  if (item.type !== "class" || item.name !== "Psychic") return;
  const actor = item.parent;
  if (!actor) return;
  if (!actor.getFlag(MODULE_ID, "psychicMindTrinket")) {
    await actor.setFlag(MODULE_ID, "psychicMindTrinket", true);
  }
  this._updateMaxFocus(actor, item.system.level ?? 1);
});
```

- [ ] **Step 2: Verify.** Drop Psychic class onto an actor → check flag.

- [ ] **Step 3: Commit.**

```bash
git add scripts/class-features/psychic.mjs
git commit -m "feat(psychic): Awakening — set psychicMindTrinket flag"
```

### Task 14: Precognition (L2) — first-save Favor while Focusing

**Goal:** L2+ Psychic, while any Talent is focused, gets Favor on the first save each round.

**Files:**
- Modify: `scripts/class-features/psychic.mjs` (add save-roll hook + round-tracker)

**Acceptance Criteria:**
- [ ] L2+ Psychic with at least one Talent focused → first Reflex/Endure/Will save in a combat round → Favor d6 added.
- [ ] Subsequent saves in the same round → no auto-Favor.
- [ ] Combat round transition resets the per-round flag.
- [ ] No Favor if no Talent focused.

**Verify:** Roll two saves in a row in combat for an L2 Psychic with Shield focused → first has Favor, second doesn't.

**Steps:**

- [ ] **Step 1: Hook save-roll path.** Identify the save-roll dispatcher (likely `VagabondDamageHelper._rollSave` per CLAUDE.md). Add a pre-save hook:

```js
// In PsychicFeatures.init(), or via the existing main-dispatcher pattern:
Hooks.on("vce.preRollSave", (ctx) => {
  const actor = ctx.actor;
  if (!actor) return;
  const psy = actor.items.find(i => i.type === "class" && i.name === "Psychic");
  if (!psy || (psy.system.level ?? 1) < 2) return;

  const focused = (actor.getFlag(MODULE_ID, "psychicTalents")?.focusedIds ?? []);
  if (focused.length === 0) return;

  const used = actor.getFlag(MODULE_ID, "psychicPrecognitionUsedRound");
  const currentRound = game.combat?.round ?? 0;
  if (used === currentRound) return;

  ctx.favorHinder = (ctx.favorHinder ?? 0) + 1;
  actor.setFlag(MODULE_ID, "psychicPrecognitionUsedRound", currentRound);
});
```

(The hook name `vce.preRollSave` is illustrative — check existing hooks in the dispatcher in `scripts/vagabond-character-enhancer.mjs`. Alternatively, monkey-patch `VagabondDamageHelper._rollSave` directly per the established pattern.)

- [ ] **Step 2: Reset on combat round change.**

```js
Hooks.on("combatRound", (combat, updateData) => {
  // Clear flag for all combatant actors that have it
  for (const c of combat.combatants) {
    const actor = c.actor;
    if (actor?.getFlag(MODULE_ID, "psychicPrecognitionUsedRound") !== undefined) {
      actor.unsetFlag(MODULE_ID, "psychicPrecognitionUsedRound");
    }
  }
});
```

- [ ] **Step 3: Verify in combat.** Start combat with L2 Psychic + focused Shield → trigger a save → confirm Favor → trigger another → no Favor. Advance round → trigger save → Favor again.

- [ ] **Step 4: Commit.**

```bash
git add scripts/class-features/psychic.mjs
git commit -m "feat(psychic): Precognition — first-save Favor while Focusing"
```

### Task 15: Transcendence (L10) — Talent swap dialog

**Goal:** Button on the Talents tab at L10+ opens a swap dialog: pick a known Talent to remove + pick a new one to add. Action cost honor-system.

**Files:**
- Create: `scripts/talent/talent-transcendence.mjs`
- Create: `templates/talent-transcendence-dialog.hbs`
- Modify: `scripts/talent/talents-tab.mjs` (wire the Transcendence button)

**Acceptance Criteria:**
- [ ] L10 Psychic sees a "Transcendence" button in the Talents tab header.
- [ ] Click → DialogV2 with two dropdowns (Remove / Add).
- [ ] Confirm → known Talent deleted from actor, new Talent created.
- [ ] Toast notification: "Transcendence: swapped X for Y (1 Action)."
- [ ] Cancel: no changes.
- [ ] Pre-L10 actors don't see the button.

**Verify:** L10 Psychic → click Transcendence → swap Pyrokinesis for Cryokinesis → confirm Talents list updates.

**Steps:**

- [ ] **Step 1: Build the swap dialog.** Create `scripts/talent/talent-transcendence.mjs`:

```js
import { MODULE_ID } from "../utils.mjs";

export const TalentTranscendence = {
  async show(actor) {
    const known = actor.items.filter(i => i.type === "talent");
    const pack = game.packs.get(`${MODULE_ID}.vce-talents`);
    const all = await pack.getDocuments();
    const knownNames = new Set(known.map(t => t.name));
    const available = all.filter(t => !knownNames.has(t.name));

    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => { if (!settled) { settled = true; resolve(v); } };

      const content = `
        <form>
          <label>Remove
            <select name="remove">
              ${known.map(t => `<option value="${t.id}">${t.name}</option>`).join("")}
            </select>
          </label>
          <label>Add
            <select name="add">
              ${available.map(t => `<option value="${t.id}">${t.name}</option>`).join("")}
            </select>
          </label>
          <p>Action cost: 1 Action (honor-system).</p>
        </form>`;

      const dialog = new foundry.applications.api.DialogV2({
        window: { title: "Transcendence — Swap Talent" },
        position: { width: 420 },
        classes: ["vce-creature-picker-app"],
        content,
        buttons: [
          {
            action: "swap", label: "Swap", icon: "fas fa-exchange-alt", default: true,
            callback: async () => {
              const root = dialog.element;
              const removeId = root.querySelector("select[name='remove']").value;
              const addId = root.querySelector("select[name='add']").value;
              const addDoc = await pack.getDocument(addId);

              await actor.deleteEmbeddedDocuments("Item", [removeId]);
              await actor.createEmbeddedDocuments("Item", [addDoc.toObject()]);

              const removed = known.find(k => k.id === removeId);
              ui.notifications.info(`Transcendence: swapped ${removed.name} for ${addDoc.name} (1 Action).`);
              finish({ removed: removed.name, added: addDoc.name });
            }
          },
          { action: "cancel", label: "Cancel", icon: "fas fa-times", callback: () => finish(null) }
        ],
        rejectClose: false
      });

      Hooks.once("closeDialogV2", (app) => { if (app === dialog) finish(null); });
      dialog.render({ force: true });
    });
  }
};
```

- [ ] **Step 2: Wire button in talents-tab.** Add the level gate in the tab template (already done — `{{#if (gte level 10)}}`) and the click handler:

```js
import { TalentTranscendence } from "./talent-transcendence.mjs";

tabSection.querySelectorAll("[data-action='transcendence']").forEach(b =>
  b.addEventListener("click", async () => {
    await TalentTranscendence.show(actor);
    app.render();
  })
);
```

- [ ] **Step 3: Verify.** L10 Psychic → click Transcendence → swap → confirm.

- [ ] **Step 4: Commit.**

```bash
git add scripts/talent/talent-transcendence.mjs scripts/talent/talents-tab.mjs
git commit -m "feat(psychic): Transcendence (L10) — Talent swap dialog"
```

---

## Phase 8: Documentation

### Task 16: Update CLAUDE.md and CHANGELOG

**Goal:** Document the Psychic / Talents system for future maintainers.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`

**Acceptance Criteria:**
- [ ] CLAUDE.md has a new "Psychic / Talents" section under Module Architecture, pointing at the relevant files.
- [ ] CHANGELOG.md `Unreleased` section captures the user-facing additions.

**Steps:**

- [ ] **Step 1: Add CLAUDE.md section.** Append to the "Module Architecture" area:

```markdown
### Psychic / Talents (v0.4+)

Parallel magic system distinct from spell pipeline. See `docs/superpowers/specs/2026-04-24-psychic-class-design.md`.

- **Item type**: `talent` (`scripts/talent/talent-data-model.mjs`). Custom data model — not a spell.
- **Pack**: `vce-talents` (14 items).
- **Tab injection**: Talents tab on Psychic character sheets only (`scripts/talent/talents-tab.mjs`).
- **Pick flow**: `scripts/talent/talent-pick-dialog.mjs`. Auto-fires on class detect / level-up to 3/5/7/9. Tracked via `flags.vagabond-character-enhancer.psychicTalentsPicked`.
- **Cast pipeline**: `scripts/talent/talent-cast.mjs`. Calls `VagabondDamageHelper.rollSpellDamage` and `VagabondChatCard.spellCast` directly — does NOT go through `SpellHandler`. Mana cap is `floor(level/2)`, virtual.
- **Focus tracking**: `flags.vagabond-character-enhancer.psychicTalents = {focusedIds: [], maxFocus: 1|2|3}`. Decoupled from `system.focus.spellIds`.
- **Buff Talents**: `scripts/talent/talent-buffs.mjs`. Each of Absence / Evade / Shield / Transvection has `system.focusBuffAE` definition, applied to actor on focus-add, removed on focus-remove.
- **Class features**: `scripts/class-features/psychic.mjs`. Mental Fortress (passive AE), Awakening (sets `psychicMindTrinket` flag), Precognition (save-roll Favor first per round while focusing), Transcendence (`scripts/talent/talent-transcendence.mjs` swap dialog).
```

- [ ] **Step 2: Add CHANGELOG entry.** Under the existing Unreleased section:

```markdown
### New Class — Psychic

Implements the Psychic class as a fully playable Vagabond class via a parallel "Talent" item-type system. New `vce-talents` compendium ships 14 Talents. Psychic actors get a dedicated Talents tab with cast/focus controls, a level-gated pick dialog on class assignment and at L3/5/7/9, full-RAW cast configuration bounded by `floor(level/2)` virtual Mana cap, free Focus on Talents (no per-round Mana drain), multi-Focus (1 → 2 at L4 → 3 at L8), Mental Fortress status immunities at L6, Precognition first-save Favor while Focusing at L2, and a Transcendence swap dialog at L10.

See `docs/superpowers/specs/2026-04-24-psychic-class-design.md` for the design doc.
```

- [ ] **Step 3: Commit.**

```bash
git add CLAUDE.md CHANGELOG.md
git commit -m "docs(psychic): document Talents architecture in CLAUDE.md + changelog"
```

---

## Self-Review Notes (post-write)

**Spec coverage check:** Each spec section maps to a task — Item type → T1, Pack & content → T2-3, Tab → T4, Pick dialog → T5-6, Cast pipeline → T7-8, Focus + buff Talents → T9-11, Class features → T12-15, Docs → T16. ✓

**Placeholders:** No "TODO" or "fill in details" left in steps. Field-shape verification for `bonusDie` is gated to T9 with concrete steps. ✓

**Type / signature consistency:** `TalentBuffs.toggleFocus(actor, talent)` returns `true | false | null`. `TalentCast.openDialog` returns `{damageDice, delivery, hasEffect, isFocused} | null`. `TalentPickDialog.show(actor, count)` returns `[{id, name}] | null`. Cross-task references match. ✓

**Spec-to-plan gap:** Open Decision #4 (chat card template) is handled inline in T8 Step 4 (build `talent-chat-card.hbs` if adapter doesn't fit). Open Decision #3 (bonusDie field) is gated to T9. Open Decision #1 (cast dialog) is locked to RAW per user input. Open Decision #2 (pack location) is locked to `vce-talents` per T2. ✓

**Risks acknowledged:**
- T8 may produce ugly chat-card adaptation → fallback path documented (custom hbs).
- T11 may need race-condition guards if rapid Focus toggles occur → noted in spec, mitigation listed.
- T1 Step 4 assumes the entry module's `init` hook runs after Vagabond's; verified by the dependency model (system runs before module).
