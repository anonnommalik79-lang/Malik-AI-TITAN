# SOVEREIGN FORGE V1

**Company:** Sovereign Hub  
**Public product name:** SOVEREIGN FORGE  
**Internal engine codename:** MALIK-CODER-1  
**Tagline:** Build. Run. Ship.

## Product mission

SOVEREIGN FORGE is an AI software engineer that understands an existing repository, edits multiple files, runs commands, reads failures, repairs its own work, verifies the result, and creates a safe Git checkpoint.

## V1 victory condition

A user opens a real project and gives one task. The agent must:

1. scan the repository;
2. identify relevant files;
3. produce an execution plan;
4. edit code using patches;
5. run typecheck, tests, and build;
6. inspect failures and retry;
7. finish with a successful build;
8. show the diff and create a Git checkpoint.

## V1 core modules

- Repository Scanner
- Repo Map and Context Selector
- Planner
- Model Router
- Patch Engine
- Terminal Runner
- Repair Loop
- Verifier
- Git Checkpoints
- Session Memory

## Non-goals for V1

No image generation, video generation, social features, plugin marketplace, mobile app, 3D interface, or unrelated assistant modes until the core coding loop is reliable.

## First benchmark

Use a real Next.js project and complete this task end to end:

> Inspect the project, identify one real defect, fix it, add one controlled feature, run typecheck and production build, repair every failure, and finish with Build Passed.

## Engineering rule

One version, one decisive victory: **task given → verified working code**.
