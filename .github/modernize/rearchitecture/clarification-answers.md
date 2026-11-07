---
schema: clarification-answers/v1
status: submitted
generated_at: "2026-11-07T11:27:52.108Z"
scope: [frontend, backend, generic]
questions_file: clarification-questions.json
---

# Rearchitecture Clarification Answers

## 🖥️ Frontend

- **F1** Which Electron major version should the desktop shell target? The version can also be chosen during implementation after checking compatibility with this project.
  - answer: Electron; choose a compatible supported version during implementation
  - source: user
- **F2** Should the desktop package preserve the existing UI as-is, or should the UI be changed to use a specific component library? If a library is required, name it and its version.
  - answer: Keep the existing UI unchanged; no new component library
  - source: user
- **F3** Are screenshots, recordings, or a reference URL available for the existing UI that the desktop app should preserve? Provide paths or URLs, or indicate none are needed because the UI is only being packaged unchanged.
  - answer: Fais juste le nécessaire pour préserve l'intégrité et les fonctionnalité et le fonctionnement de la plateform
  - source: user
- **F4** What design system, design-token source, or visual preservation rule should apply to the desktop UI? The catalog default is to match the existing UI pixel-by-pixel using its extracted CSS properties.
  - answer: Fais juste le nécessaire pour préserve l'intégrité et les fonctionnalité et le fonctionnement de la plateform
  - source: user
- **F5** Which accessibility standard should the desktop UI target?
  - answer: WCAG 2.1 AA
  - source: user
- **F6** Which desktop runtime or operating-system compatibility targets should be supported beyond the requested Windows and Ubuntu packages?
  - answer: Windows and Ubuntu desktop targets only
  - source: user
- **F7** Should the existing responsive UI be preserved as-is in the desktop app, or should the desktop experience be desktop-only?
  - answer: Preserve existing responsive behavior
  - source: user
- **F8** Which UI locales should the desktop product support?
  - answer: Fais juste le nécessaire pour préserve l'intégrité et les fonctionnalité et le fonctionnement de la plateform
  - source: user
- **F9** Is there a preferred client-side state-management approach for the desktop product?
  - answer: Fais juste le nécessaire pour préserve l'intégrité et les fonctionnalité et le fonctionnement de la plateform
  - source: user
- **F10** Is there a preferred routing strategy for the desktop UI?
  - answer: Fais juste le nécessaire pour préserve l'intégrité et les fonctionnalité et le fonctionnement de la plateform
  - source: user

## ⚙️ Backend

- **B1** Which Node.js major version and backend framework should the local backend target? The project profile only identifies a Node.js backend, so this may be selected after checking project compatibility.
  - answer: Node.js backend; choose a compatible supported major during implementation
  - source: user
- **B2** What API contract policy should apply while adapting the backend for local desktop operation?
  - answer: must preserve
  - source: user
- **B3** How should existing user data and database state be handled when moving to the local desktop database?
  - answer: TBD / assess in research phase
  - source: user
- **B4** How should the local backend authenticate with botora-admin for accounts, subscriptions, and credits? Identify the existing mechanism or state that the current authentication mechanism should be preserved and detected during implementation. Do not provide secrets here.
  - answer: Fais juste le nécessaire pour préserve l'intégrité et les fonctionnalité et le fonctionnement de la plateform
  - source: user
- **B5** Are there latency, availability, or throughput targets for the local backend and central-service synchronization?
  - answer: Fais juste le nécessaire pour préserve l'intégrité et les fonctionnalité et le fonctionnement de la plateform
  - source: user

## 📋 General

- **G1** What outcome defines success for this work?
  - answer: A working local-first Electron desktop package for Windows and Ubuntu, with backend, UI, local DB, persistent user data, and WhatsApp session/runtime on the user's computer; botora-admin remains remote for accounts, subscriptions, and credits; verify targeted tests/build/package status and report blockers, including Chromium/runtime assets and production admin authentication.
  - source: user
- **G2** Confirm the explicit boundaries for this work.
  - answer: No Android app; no cloud deployment changes; do not alter botora-admin credentials; do not commit or push; preserve unrelated work; stop after the bounded local-backend desktop work.
  - source: user
- **G3** What test policy should apply to the existing test suite during this work?
  - answer: must pass
  - source: user
- **G4** Where should the desktop adaptation be implemented?
  - answer: in-place on the existing work_desktop branch
  - source: user
- **G5** Any additional requirements, exclusions, dependencies, compliance rules, or operational constraints not covered above?
  - answer: None beyond the decisions listed in this specification.
  - source: user
