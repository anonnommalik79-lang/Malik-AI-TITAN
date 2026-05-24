# Codex prompt for MALIK AI launch upgrade

You are a senior frontend engineer and startup landing page strategist.

Repository: Malik-AI-TITAN
Goal: upgrade the static MALIK AI pre-launch website so investors, media and accelerators understand the product immediately.

Strict rules:
- Do not remove the current countdown or hero image.
- Do not break the static deployment.
- Keep the site mobile-first, premium, dark, glassmorphism, no terminal/hacker cheap style.
- Keep existing package.json script working: python -m http.server 3000.
- No secrets, no API keys, no backend assumptions.
- Any waitlist form must not pretend to send data unless backend exists.

Tasks:
1. Add navigation links:
   - Product
   - Investors
   - Press
   - Pitch Deck -> pitch.html
   - Press Kit -> press.html

2. Add/keep these pages:
   - pitch.html: investor one-pager
   - press.html: media press kit
   - robots.txt
   - sitemap.xml
   - README.md

3. Improve index.html sections:
   - Hero: MALIK AI V6.5 TITAN, one prompt -> product, pre-launch, June 1
   - Core product modules: AI assistant, code generator, website builder, image generation, video generation
   - Investor snapshot: 25+ MVP functions, 5 modules, June 1 Early Access
   - Press angle: new AI platform from Kazakhstan preparing for June 1 launch
   - Roadmap: pre-launch, MVP readiness, early access, public demo, investor wave
   - CTA: Join waitlist + View Pitch Deck + Open Press Kit

4. SEO:
   - Add meta description, keywords, OG tags, Twitter card
   - Add JSON-LD SoftwareApplication schema
   - Use canonical URL https://malikaiworld.world

5. After changes:
   - Run local static check
   - Confirm no horizontal scroll on mobile
   - Confirm links work:
     /pitch.html
     /press.html
     /robots.txt
     /sitemap.xml

Commit message:
Add investor and media launch kit for MALIK AI V6.5 TITAN
