# Malik Codex API Keys

Do not hardcode API keys in frontend or commit them to Git.

Use environment variables:

```bash
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
MALIK_CODEX_PROVIDER=openai
MALIK_CODEX_MODEL=gpt-5.5
```

Frontend settings only collect UI input. Real secure storage should be implemented through backend environment variables or encrypted database storage.

Cost controls:

- Session request limit
- Task request limit
- Full Boss Mode confirmation
- Stop generation
- Cost estimate placeholder
- Provider fallback disabled by default
- Local safe mode without keys

