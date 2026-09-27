# Malik AI — AI Digital Bridge 2026 Release Protocol

This document is operational policy, not marketing copy. A result is described as live only when it was produced live.

## Release candidate

Target branch: `release/digital-bridge-2026`.

Create the release candidate only after the Core, Creation and GOD MODE integration branches have been merged and their required checks are green. Do not make the release branch the place where large feature work happens.

Required gates before tagging the candidate:

- TypeScript typecheck passes.
- Production Next build passes.
- Core release regression suite passes.
- GOD MODE bandwidth, secret/isolation, project-graph and upload-policy checks pass.
- WorkOS sign-in works on the deployed candidate.
- Chat, image, video, music, sites, presentations and voice each get one real smoke run.
- Mobile 390px and the presentation laptop browser get a manual visual pass.
- Render bandwidth is checked after one real image, video and music result.

## Feature freeze

At T-24 hours before the Digital Bridge demo:

1. Freeze feature development.
2. Allow only P0/P1 fixes: auth failure, data loss, complete feature outage, broken demo route, security regression or catastrophic UI break.
3. No global CSS redesigns, dependency upgrades, provider migrations or broad refactors after freeze.
4. Every accepted patch must have a rollback commit and the narrowest possible test.

## Offline / degraded-network backup

A backup may contain screenshots, prerecorded media and a static walkthrough of a previously completed project. It MUST be labelled as a backup/demo artifact and MUST NOT be represented as a newly generated live result.

Keep locally on the presentation laptop:

- one exported project manifest;
- one previously generated project deck;
- one short promo video;
- one image set;
- one music track;
- screenshots of each critical section;
- a text file with the exact production URL and the release candidate commit.

The backup exists to explain the product if venue networking fails, not to fake a successful API call.

## Three-minute demo

### 0:00–0:20 — Goal

Open the existing Malik AI chat. Do not switch to a special redesigned homepage.

Say: **“Назовите любой технологический бизнес.”**

Enter one mission such as:

> Создай казахстанский технологический бренд для электрического транспорта и подготовь всё для разговора с инвестором.

The mission must create or attach to one real Project.

### 0:20–1:10 — Superflow / project execution

Show the real task timeline. Only actual backend task state may be presented as completed.

Expected stages can include research, business, image, website, video and deck depending on what is currently enabled.

If one provider fails, demonstrate honest retry/fallback rather than hiding the failure.

### 1:10–1:50 — Cross-tool artifacts

Open the project/artifact view:

- image provenance;
- website artifact;
- video reference;
- deck;
- version/rollback or “Use in…” actions.

Heavy image/video/audio must play from provider/CDN/object storage, not through Render.

### 1:50–2:25 — Voice / multilingual

Use the existing Voice UI. Ask one short Kazakh or Russian follow-up and, if stable in the release candidate, request an English investor-facing variant.

Do not switch languages manually merely to manufacture a successful detection demo.

### 2:25–3:00 — Final project

Open the factual Project Summary:

- task count;
- artifact count;
- actual status;
- actual duration where available.

End only when backend state is truly completed with **PROJECT READY**. If not all tasks completed, show the real current state instead.

## Recovery

The owner-only demo recovery endpoint may clear transient provider-health/performance measurements. It deliberately does not delete projects, reset quotas, change sessions or modify credentials.

## No-fake rule

Never label any of the following as live if they are not:

- cached result;
- prerecorded video;
- static screenshot;
- manually prepared deck;
- health metric that was not measured;
- progress percentage invented by the UI.

Digital Bridge credibility is more valuable than pretending a delayed provider is instant.
