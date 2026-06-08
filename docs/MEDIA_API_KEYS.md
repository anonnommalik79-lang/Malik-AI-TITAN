# Malik AI Media API Keys

This project keeps media provider secrets server-side. Do not paste real keys into frontend code, React components, or committed files.

## Where media generation is connected

- Backend provider rotation: `app/api/generators.py`
- Flask routes: `run.py` and `app/routes.py`
- Photo endpoint: `POST /api/generate/photo`
- Video endpoint: `POST /api/generate/video`
- Safe runtime check: `GET /api/runtime/env-check`
- Frontend generator: `app/templates/sovereign-hub-ui/components/generator/MediaGenerator.tsx`
- API status popover: `app/templates/sovereign-hub-ui/components/sovereign/api-status-popover.tsx`

## Required variables

For photo generation, configure at least one provider:

| Provider | Env variables | Key link |
| --- | --- | --- |
| OpenAI Image | `OPENAI_API_KEY`, optional `OPENAI_IMAGE_URL`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY` | https://platform.openai.com/api-keys |
| Stability AI | `STABILITY_API_KEY` + `STABILITY_IMAGE_URL` | https://platform.stability.ai/account/keys |
| Replicate Image | `REPLICATE_API_TOKEN` + `REPLICATE_IMAGE_URL` | https://replicate.com/account/api-tokens |
| fal.ai Image | `FAL_KEY` + `FAL_IMAGE_URL` | https://fal.ai/dashboard/keys |
| Leonardo AI | `LEONARDO_API_KEY` + `LEONARDO_IMAGE_URL` | https://app.leonardo.ai/api-access |

For video generation, configure at least one provider:

| Provider | Env variables | Key link |
| --- | --- | --- |
| Google Veo 3.1 Pro | `GOOGLE_VEO_API_KEY` or `GEMINI_API_KEY`; optional `GOOGLE_VEO_VIDEO_URL` | https://aistudio.google.com/app/apikey |
| Runway Gen-4.5 Pro | `RUNWAYML_API_SECRET` or `RUNWAY_API_KEY`; optional `RUNWAY_VIDEO_URL` | https://dev.runwayml.com/ |
| fal.ai Kling O3 4K Pro | `FAL_KEY`; optional `FAL_PRO_VIDEO_URL` | https://fal.ai/dashboard/keys |
| Luma Ray 2 Pro | `LUMA_API_KEY` or `LUMAAI_API_KEY`; optional `LUMA_VIDEO_URL` | https://lumalabs.ai/dream-machine/api/keys |
| fal.ai Wan Standard | `FAL_KEY`; optional `FAL_VIDEO_URL` | https://fal.ai/dashboard/keys |
| Pika | `PIKA_API_KEY` + `PIKA_VIDEO_URL` | https://pika.art/api |
| Kling | `KLING_API_KEY` + `KLING_VIDEO_URL` | https://klingapi.com/docs |
| Replicate Video | `REPLICATE_API_TOKEN` + `REPLICATE_VIDEO_URL` | https://replicate.com/account/api-tokens |

## Video provider order

Normal users use this order by default:

```env
MEDIA_VIDEO_PROVIDER_ORDER=fal-video,luma-video,runway-video,fal-kling-pro-video,google-veo,pika-video,kling-video,replicate-video
```

Pro users use the strongest providers first:

```env
MEDIA_PRO_VIDEO_PROVIDER_ORDER=google-veo,runway-video,fal-kling-pro-video,luma-video,fal-video,pika-video,kling-video,replicate-video
```

`MEDIA_PRO_ACCESS_CODE` enables the Pro order. Without that code, the app uses the normal order and still skips any provider whose key is missing.

Recommended first setup:

```env
OPENAI_API_KEY=...
MEDIA_PRO_ACCESS_CODE=...
FAL_KEY=...
```

With only `FAL_KEY`, standard video uses `FAL_VIDEO_URL` and Pro video uses `FAL_PRO_VIDEO_URL`. Add `GOOGLE_VEO_API_KEY`, `RUNWAYML_API_SECRET`, and `LUMA_API_KEY` later, one at a time.

## Safe setup

Local development:

```bash
cp .env.example .env
```

Then paste real values only into `.env`. The repository already ignores `.env`.

Render:

- Open the Render service dashboard.
- Add the same variables under Environment.
- Keep secrets as environment variables only.
- `render.yaml` uses `sync: false` for provider secrets so real values are entered in Render, not stored in Git.

## Verification

Open `GET /api/runtime/env-check`. It returns configured booleans, env variable names, provider docs links, and `secretsExposed: false`. It must never return actual key values.
