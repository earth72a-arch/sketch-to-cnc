# CLAUDE.md — Sketch-to-CNC Permanent Project Rules

This file defines permanent, non-negotiable requirements for the Sketch-to-CNC
project. Every future session, agent, or contributor (human or AI) must read
and follow these rules before making changes. Rules here outrank convenience,
speed, or "it would be easier if..." reasoning. If a request conflicts with
this file, stop and raise the conflict instead of silently violating a rule.

## 1. Project objective

A browser-based application for reading furniture sketches created in
Procreate on iPad, and turning verified manual input into structured data
that can later drive 2D technical drawings and CNC manufacturing files.

Long-term workflow:

```
Procreate → Web App → Drawing Verification → 2D Technical Drawings → CNC Manufacturing Files
```

## 2. Hosting, platform & runtime constraints (hard requirements)

- **iPad Safari is the primary target.** Design, layout, and touch
  interaction must be verified against iPad Safari behavior (landscape
  first). Desktop browsers are a secondary convenience for development.
- **GitHub Pages is the intended hosting platform.** The app must build as
  static assets and work correctly when served from a Pages subpath
  (`/sketch-to-cnc/`). Do not introduce anything that requires server-side
  rendering, rewrites, or a custom origin.
- **All processing must occur inside the browser.** No backend service, no
  Windows processing server, no cloud AI.
- **No backend, Windows processing server, or cloud AI** of any kind may be
  added in any phase unless this file is explicitly revised first.
- **No paid services or third-party runtime APIs.** Every runtime dependency
  must work fully offline/client-side with no API keys, quotas, or billing.
- **Customer drawings must never be transmitted to external servers.**
  Images stay in the browser (memory / explicit local file I/O only). Never
  add telemetry, analytics uploads, or "helpful" cloud sync for image data.
- **No AI interpretation of sketch structure in Phase 1.** All component,
  dimension, and geometry decisions are made by the human user through
  manual forms and controls.
- **OCR may be introduced in a future session** to assist reading numbers
  off a sketch, but it is **not required now** and must not be implemented
  speculatively ahead of that session.

## 3. Drawing & data conventions

- **Isometric drawings with locked axes are the primary input.**
  **Perspective drawings are excluded from Phase 1.**
- **Every drawing includes dimensions.** The app should always assume
  dimensions are present somewhere in the sketch and needs user input to
  capture them — never infer them.
- **Semantic information is distinguished using stroke colors**, not
  separate layers. (Color-based classification itself is not implemented
  until a future automated-recognition session; this rule constrains the
  *data model*, not Phase 1 behavior.)
- **Furniture Spec JSON is the single source of truth** for all future
  drawing and manufacturing generation. Nothing downstream should re-derive
  facts that should have been captured in this JSON.

## 4. Never-guess / provenance rules (hard requirements)

- **Never guess missing dimensions, materials, components, or construction
  details.** If information is not present and confirmed, represent it as
  missing/unresolved — never fabricate a plausible value.
- **Every important value must retain provenance and review status.** A
  numeric value without a traceable origin is not acceptable.
- **Users must confirm unverified measurements individually.**
- **Never implement a "Confirm All" function**, in any form (including a
  bulk-select-then-confirm UI that functions the same way). Confirmation is
  always a deliberate, per-record action.
- **Draft projects may contain incomplete information.** This is expected
  and must not be treated as an error state.
- **Approved specifications must not contain unresolved critical
  information.** Approval is a gate, not a formality — see §6.

## 5. Materials

- **Initial materials: Aluminium Honeycomb 9 mm and 18 mm.**
- **Store nominal and actual material thickness separately.**
- **Actual thickness must remain unknown (`null`) until verified** by the
  user. Do not default actual thickness to nominal thickness.

## 6. Review status & approval semantics

Supported review statuses: `read`, `confirmed`, `derived`, `rule`,
`missing`, `ambiguous`, `conflict`.

- `read` and `derived` values **must never become approved automatically**.
- Only `confirmed` values count as resolved for the purposes of Approved
  Furniture Spec export. Every other status blocks approval.
- Every dimension must be individually reviewable and individually
  confirmable. No batch/"confirm all" shortcut (see §4).
- Successful JSON serialization is **not** manufacturing approval. Approval
  requires passing deterministic validation (see the validation module) with
  zero blocking issues.
- A user must be able to see all blocking validation issues before
  approving a spec.
- Do not fabricate missing component geometry or physical construction
  details to make validation pass.

## 7. Engineering conventions

- Keep application modules reusable, testable, and independent. Avoid
  tightly coupling UI components to a specific data source — pass data in,
  emit events out.
- Maintain compatibility with static GitHub Pages hosting at all times
  (relative asset paths, correct Vite `base`, no server-only APIs).
- Prefer lightweight dependencies. Do not install OpenCV.js, OCR engines,
  AI models, or large computer vision libraries without an explicit,
  separate decision to start that phase of work.
- Image coordinates must remain stable during zoom/pan. Annotations and
  regions are always stored in **original-image pixel coordinates**, never
  screen/viewport coordinates. Convert at the render boundary only.

## 8. Three-phase roadmap

- **Phase 1 — Sketch interpretation and verification.** Manual import,
  manual view/component/dimension/span definition, deterministic
  validation, draft/approved JSON export. (This is the phase implemented in
  Session 1, Milestones 1–2.)
- **Phase 2 — Generate 2D drawings for review and presentation.** Consumes
  the Approved Furniture Spec JSON to produce human-reviewable 2D technical
  drawings. Not started until Phase 1 is solid.
- **Phase 3 — Generate CNC cutting and drilling files.** Consumes Phase 2
  output (and the same Furniture Spec JSON) to produce manufacturing files.
  Not started until Phase 2 is solid.

Do not pull work forward from a later phase into an earlier session "while
we're at it." Each phase is a deliberate gate, not a soft target.

## 9. Test data

- Do not embed real customer drawings into the public repository.
- Programmatically generated synthetic test fixtures are permitted and
  encouraged for automated tests, but must be clearly labeled as synthetic
  in code/comments/filenames (e.g. `synthetic` in the name), so nobody
  mistakes them for real customer data later.

## 10. When in doubt

If a request in a future session would require violating any rule above
(e.g. "just call an API for OCR," "add a small backend to persist
projects," "auto-confirm these since they're probably right"), stop and
surface the conflict to the user instead of implementing a workaround.
