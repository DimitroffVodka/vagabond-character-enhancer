// ESLint flat config (v9+). Lints the module's runtime JS only —
// the scripts/**/*.mjs that Foundry loads. No transpilation, no build.
//
// Primary goal: catch `no-undef` (missing imports). The "VCE half-loaded"
// bug we just hit in the v14 migration was exactly this — an import line
// missing `onRenderChatMessage` made the helper a ReferenceError at runtime,
// which Foundry's async hook dispatcher swallowed silently. ESLint would
// have caught it before reload.

import globals from "globals";

export default [
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        // Foundry core globals (not exported, available on window)
        game: "readonly",
        canvas: "readonly",
        ui: "readonly",
        Hooks: "readonly",
        foundry: "readonly",
        CONFIG: "readonly",
        CONST: "readonly",
        Roll: "readonly",
        Combat: "readonly",
        Combatant: "readonly",
        Actor: "readonly",
        Actors: "readonly",
        Item: "readonly",
        Items: "readonly",
        ChatMessage: "readonly",
        Macro: "readonly",
        Scene: "readonly",
        Token: "readonly",
        TokenDocument: "readonly",
        MeasuredTemplate: "readonly",
        JournalEntry: "readonly",
        Folder: "readonly",
        ActiveEffect: "readonly",
        Dialog: "readonly",
        FilePicker: "readonly",
        ContextMenu: "readonly",
        TextEditor: "readonly",
        fromUuid: "readonly",
        fromUuidSync: "readonly",
        getDocumentClass: "readonly",
        loadTemplates: "readonly",
        renderTemplate: "readonly",
        // ApplicationV2 family — most code imports these from foundry.applications.api,
        // but a few references the legacy globals.
        ApplicationV2: "readonly",
        HandlebarsApplicationMixin: "readonly",
        // jQuery — Foundry's bundled, present until v15
        jQuery: "readonly",
        $: "readonly",
        // System namespace exposed on globalThis
        vagabond: "readonly",
        // Crawler module if active (optional dep, may be undefined)
        _vceBeastCache: "writable",
        // Sequencer (optional dep). Code paths gated on game.modules.get("sequencer")
        Sequence: "readonly",
        Sequencer: "readonly",
      },
    },
    rules: {
      // The bug-prevention rule. Catches the exact class of "missing imports"
      // bug that motivated this lint config in the first place.
      "no-undef": "error",

      // Codebase-wide pragmatic settings — these are warnings, not errors,
      // so existing style isn't flagged as a build break.
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-prototype-builtins": "off",
      "no-constant-condition": ["warn", { checkLoops: false }],
      "no-useless-escape": "warn",
      "no-irregular-whitespace": "warn",
    },
  },
];
