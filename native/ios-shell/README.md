# Malik AI — iOS shell

This folder turns the production Malik AI web app into a native iOS container with Capacitor.

Production URL: `https://malikaiworld.world`

## What is already configured

- Native app name: `Malik AI`
- Bundle ID: `world.malikai.app`
- HTTPS-only production URL
- iOS mobile content mode
- Black fallback screen
- Capacitor 8.5.1

## Generate the Xcode project

Run on macOS with Node.js installed:

```bash
cd native/ios-shell
npm install
npm run ios:add
npm run ios:open
```

After the first generation, use:

```bash
npm run ios:update
```

## Install on an iPhone

1. Connect the iPhone to the Mac.
2. Open the generated iOS project in Xcode (`npm run ios:open`).
3. In Signing & Capabilities choose your Apple Development Team.
4. Select the connected iPhone as the run destination.
5. Press Run.

For TestFlight/App Store distribution, use an Apple Developer Program account and archive/upload from Xcode.

## Instant no-browser iPhone mode without an IPA

Malik AI already exposes an iOS-capable web app manifest and Apple web-app metadata. On iPhone open `https://malikaiworld.world` in Safari, choose Share → Add to Home Screen, then launch Malik AI from its Home Screen icon. It opens in standalone mode without Safari's address bar or browser controls.
