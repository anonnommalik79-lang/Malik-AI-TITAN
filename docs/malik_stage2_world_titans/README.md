# MALIK AI Stage 2 — World Titans Providers

This pack adds Stage 2 only:

- OpenAI provider
- Claude provider
- Azure OpenAI provider
- AWS Bedrock provider registration
- Updated world provider registry
- Updated env example

It does not add image/video jobs, project builder, database, or active API routes.

## Important

AWS Bedrock is registered as a provider and health-check participant.
Actual Bedrock invocation must run from backend worker/server runtime, not the static frontend.

## Install

```cmd
cd /d D:\Malik-AI-ULTRA-V5
powershell -NoProfile -Command "Expand-Archive -LiteralPath 'D:\MALIK_STAGE2_WORLD_TITANS_PROVIDERS.zip' -DestinationPath '.' -Force"
cd app\templates\sovereign-hub-ui
npm run build
```

If build passes:

```cmd
cd /d D:\Malik-AI-ULTRA-V5
git add -A
git commit -m "Add MALIK AI stage 2 world titans providers"
git push
```
