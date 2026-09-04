# Malik AI Business — Delivery Factory

## Reusable project architecture

Every client project should reuse the same proven layers and swap configuration rather than rewrite the system from scratch:

1. Brand configuration
2. Services / knowledge base
3. Website sections
4. Lead form schema
5. AI consultant guardrails
6. Telegram bot copy
7. WhatsApp bot copy
8. CRM status mapping
9. Analytics events
10. Deployment secrets

## Recommended client configuration

```ts
export type BusinessConfig = {
  brand: {
    name: string
    tagline?: string
    logo?: string
    primaryCta: string
    languages: Array<"ru" | "kk" | "en">
  }
  services: Array<{
    id: string
    name: string
    description: string
    priceText?: string
    bookingNotes?: string
  }>
  lead: {
    fields: string[]
    destination: "crm" | "telegram" | "whatsapp" | "email"
  }
  ai: {
    allowedTopics: string[]
    handoffTopics: string[]
    prohibitedClaims: string[]
  }
}
```

## Production sequence

### Phase A — 60-minute prototype
- clone template;
- replace brand name/logo/hero;
- add 3 priority services;
- add one AI sample dialogue;
- add bot conversation sample;
- deploy a private preview.

### Phase B — paid build
- full content architecture;
- responsive implementation;
- lead API;
- AI knowledge and guardrails;
- bot integration;
- analytics;
- CRM workflow;
- QA.

### Phase C — launch
- production secrets;
- domain;
- webhook registration;
- test lead from every channel;
- owner dashboard test;
- approval;
- release.

## QA matrix

Website:
- iPhone-sized mobile viewport;
- Android-sized mobile viewport;
- 1366px laptop;
- large desktop;
- keyboard navigation;
- all forms;
- long text and localisation.

AI:
- 10 top FAQ;
- unknown price;
- unknown availability;
- prompt-injection attempt;
- abusive input;
- healthcare/high-stakes query where relevant;
- handoff to human.

Telegram:
- /start;
- normal text;
- price question;
- niche keyword;
- shared contact;
- invalid webhook secret.

WhatsApp:
- GET verification;
- invalid signature;
- valid inbound text;
- price question;
- duplicate user/upsert;
- Graph API send failure.

CRM:
- website lead;
- Telegram lead;
- WhatsApp lead;
- status update;
- priority update;
- owner-only access.

## Post-launch monthly service

A maintenance client receives:
- uptime / integration checks;
- knowledge-base updates;
- AI conversation review;
- funnel review;
- content edits within agreed allowance;
- bot message optimisation;
- integration compatibility fixes;
- monthly action report.

Do not promise unlimited changes unless the contract explicitly prices that risk.
