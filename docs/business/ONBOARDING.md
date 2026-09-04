# Malik AI Business — Client Onboarding

## Goal

Collect only the information required to deliver the agreed scope quickly and correctly. Do not start production from vague chat messages.

## Step 1 — commercial confirmation

Record:
- legal/business name used on the website;
- decision-maker name and contact;
- selected package;
- agreed price and payment schedule;
- exact deliverables;
- excluded items;
- target launch window;
- who supplies copy, photos, logos and legal text;
- ownership/licensing of assets;
- maintenance scope after launch.

## Step 2 — brand intake

Request:
- logo in highest available quality;
- brand colours / current brand guide;
- preferred visual references;
- photos that the client owns or is licensed to use;
- social links;
- domain/hosting ownership details only when necessary;
- business address and opening hours if public;
- languages required: KZ / RU / EN.

Do not ask the client to send passwords in ordinary chat. Prefer delegated access, platform invitations or secure secret storage.

## Step 3 — offer and service knowledge

For every priority service collect:
- exact service name;
- plain-language description;
- price or whether price must be requested;
- duration if relevant;
- eligibility/limitations;
- booking rules;
- frequently asked questions;
- questions the AI must hand over to a human;
- prohibited claims.

## Step 4 — lead flow

Decide:
- main conversion: call / booking / quote / consultation / visit;
- required lead fields;
- Telegram, WhatsApp, email or CRM handoff;
- who receives a hot lead;
- expected response hours;
- follow-up cadence;
- status names;
- opt-out handling.

## Step 5 — AI guardrails

Configure:
- approved knowledge base;
- supported languages;
- tone;
- maximum answer length;
- topics requiring human handoff;
- claims the AI may not make;
- pricing rules;
- emergency/high-stakes disclaimers where relevant.

Healthcare: no diagnosis, prescribing or emergency triage by the sales bot. Legal/financial: no personalised professional advice unless the client has an appropriate professional workflow and review.

## Step 6 — bot setup

Telegram:
- create/identify bot through BotFather;
- add TELEGRAM_BUSINESS_BOT_TOKEN to deployment secret storage;
- generate strong TELEGRAM_BUSINESS_WEBHOOK_SECRET;
- run the included webhook registration script after production deploy.

WhatsApp Cloud API:
- client owns/authorises the Meta business assets;
- set WHATSAPP_VERIFY_TOKEN;
- set WHATSAPP_APP_SECRET;
- set WHATSAPP_ACCESS_TOKEN;
- set WHATSAPP_PHONE_NUMBER_ID;
- set current WHATSAPP_GRAPH_VERSION;
- configure webhook URL and messages subscription.

## Step 7 — acceptance criteria

Before development begins, agree measurable acceptance criteria:
- target pages and sections exist;
- mobile layout passes agreed devices;
- forms save leads;
- AI answers approved FAQ correctly;
- bot receives and responds to test messages;
- owner dashboard shows test lead;
- no broken links;
- basic performance/accessibility checks pass;
- analytics/events fire if included.

## Step 8 — launch approval

Get explicit written approval before switching production domain, replacing an existing site, enabling paid messaging, or publishing under the client's accounts.
