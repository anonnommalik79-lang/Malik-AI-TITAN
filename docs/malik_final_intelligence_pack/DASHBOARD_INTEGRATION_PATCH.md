# Dashboard integration patch

Add this import near other component imports:

```tsx
import { FinalIntelligenceHome } from "@/components/sovereign/malik-intelligence"
```

Add a new view id in your view registry/sidebar if your dashboard supports it:

```ts
{
  id: "final-intelligence",
  title: "Final Intelligence",
  icon: <Sparkles className="h-4 w-4" />,
}
```

Inside renderActiveView / view switch:

```tsx
if (activeView === "final-intelligence") {
  return (
    <FinalIntelligenceHome
      onPrompt={(prompt) => handleSendMessage(prompt)}
    />
  )
}
```

If your dashboard has no view system, place this inside any safe section:

```tsx
<FinalIntelligenceHome onPrompt={(prompt) => handleSendMessage(prompt)} />
```

This pack is additive. It does not force changes into dashboard to avoid breaking your working Render build.
