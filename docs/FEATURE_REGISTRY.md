# Feature Registry

The frontend registry lives at:

`app/templates/sovereign-hub-ui/components/sovereign/core/feature-registry.ts`

It exposes:

- `SOVEREIGN_FEATURES`
- `PRIMARY_WORKING_FEATURES`
- `FEATURE_CATEGORIES`
- lookup helpers by category, id, route and backend hook

Every feature object has:

- `id`
- `title`
- `category`
- `description`
- `status`
- `route`
- `icon`
- `actionType`
- `backendHook`
- `uiPanel`
- `priority`
- `isVisible`
- `isPremium`
- `tags`

