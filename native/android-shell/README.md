# Malik AI Android

This folder builds Malik AI as an installable Android application.

- App name: `Malik AI`
- Android package: `world.malikai.app`
- Production UI: `https://malikaiworld.world`
- Native runtime: Capacitor 8.5.1
- Output for quick phone testing: `Malik-AI.apk`

## Fastest path: GitHub Actions

The workflow `.github/workflows/malik-android-apk.yml` automatically generates the native Android project and builds an installable APK.

Open the repository on GitHub -> Actions -> `Build Malik AI Android APK` -> latest successful run -> Artifacts -> `Malik-AI-Android-APK`.

Extract the artifact and install `Malik-AI.apk` on Android. Android may ask to allow installation from the browser/files app used to open the APK.

## Local Windows build

```powershell
cd native\android-shell
npm install
npx cap add android
npx cap sync android
node prepare-android.mjs
npx cap open android
```

The preparation step applies the Malik AI black/white launcher icon, black Android system bars, and microphone/camera/location permissions.

The GitHub Actions APK is a debug-signed installable build intended for direct testing. For public long-term distribution and seamless upgrades, create a private release keystore and build a release-signed APK/AAB without committing the keystore or passwords to Git.
