# Malik Game Studio

A chat request for a game ("сгенерируй мне игру про космос", "make a snake game",
"ғарыш туралы ойын жаса") becomes a playable HTML5 game in the same answer:
a menu, the game loop, controls (keyboard, mouse, touch joystick), HUD, pause,
restart, levels, sound, best score. It replaces the old path, where the model
streamed one huge code block that could stop halfway ("Ответ не завершён:
закончились попытки продолжения; блок кода не закрыт").

## Why the old path stopped

A code continuation that started with a new ```` ```html ```` line inside the
still-open block added a third fence. In Markdown that line is text, so the
block could never be closed; every round looked unfinished until the engine ran
out of attempts. Fixed in two places:

- `lib/ai/continuation-overlap.ts` — `createReopenedFenceFilter` drops a
  re-opened fence (and a lead-in such as «Продолжение:») before the overlap
  filter; the MAX engine uses it for every continuation.
- «Продолжить» now resumes the same answer (`resumableAnswer`, `resumeText`,
  `runMalikMax({ resumeFrom })`): the earlier part is sent again and continued,
  so the code arrives as one block that previews, not two halves.

## Pipeline (`lib/games/`)

| Step | File | What happens |
|---|---|---|
| Intent | `chat.ts` | `gameStudioTurn`: a new game, a change to the last game, or neither (questions, other engines such as Unity/pygame, sites about games, attachments go elsewhere). |
| Plan | `plan.ts` | The model designs the game as JSON (title, genre, controls, palette, backdrop, font, mood, mechanics, levels). Every field is validated; 16 genre defaults stand in when the model does not answer. |
| Runtime | `runtime-script.ts`, `page.ts` | Malik's own engine, shipped inside each game: loop, scaling, input, touch, HUD, menus, pause, levels, particles, shake, WebAudio sfx and music, 13 animated backdrops, error screen. The model never writes these. |
| Logic | `author.ts` | The model writes only `MalikGame.define({ setup, start, update, draw })` between `<<<FILE:game.js>>>` and `<<<END_FILE>>>`. A reply without the end marker is known to be cut and is continued from its last whole line (max 4 rounds). |
| Checks | `qa.ts` | Syntax (TypeScript's JS parser), safety policy by AST (no network, storage, DOM, timers, eval/Function, prototype climbing, external URLs), contract (`update` and `draw` exist). |
| Run | `smoke.ts`, `smoke-harness.ts` | 600 frames without input and 600 with scripted play, each in a fresh sandbox: crashes with `game.js` line numbers, freezes, blank frames, NaN coordinates, controls that change nothing. |
| Repair | `studio.ts` | Findings go back to the model; at most 2 rounds, stops when a round does not improve; the best version is delivered and remaining problems are stated. |
| Answer | `chat.ts`, `chat-turn.ts` | The game as ```` ```html filename=index.html ```` (auto-preview in the chat), controls, goal and an honest check report. In later history the page is one line. |

## Isolation of the test run

The game code is the model's, so it is treated as hostile and never runs in the
web process. The child Node process has an empty environment, the permission
model (`--permission`: no files, no child processes, no workers), code
generation from strings disabled (process and sandbox), a null-prototype vm
global with no host objects, a 128 MB heap cap, a vm timeout and a hard kill.
One run at a time. `MALIK_GAME_SMOKE=off` disables it (the answer then says the
run did not happen).

## Limits (said in the answer, not hidden)

- Games are 2D canvas; "3D" requests get pseudo-3D (perspective, raycasting).
  A Three.js/WebGL engine is not wired in yet.
- The server run proves the game starts, runs, reacts to input and does not
  crash; it cannot judge how it looks, sounds or feels — the person sees that
  in the preview.
- Requests for Unity, Godot, pygame, Phaser, React and other stacks go to the
  normal coding model (with the game contract in its prompt), not here.

## Tests

- `npm run test:game-studio` — intent, plan validation, a cut reply continued,
  policy, real sandbox runs (crash/freeze/dead controls/escape attempts),
  repairs, the page, the chat answer, the real `/api/stream` route.
- `npm run test:max` — re-opened fence and in-place «Продолжить» on the MAX
  engine (both fail on the previous engine).
