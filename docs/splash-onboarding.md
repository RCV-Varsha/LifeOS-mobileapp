# Splash and onboarding

LifeOS now starts through an entry layer without replacing the existing screen
navigation, session service, or planning logic.

- Native launch: supplied transparent LifeOS mark on the app's warm ivory canvas.
- React splash: centered mark, serif wordmark, and `PLAN · FOCUS · GROW`, with a
  short fade and 0.97-to-1 scale. The sequence lasts at most 1.1 seconds, with no
  intentional delay when reduced motion is enabled.
- First launch: Clarity → Focus → Direction → Control. Back, Next, Skip, and
  Get started share one responsive layout with four page indicators.
- Skip and Get started save `lifeos.onboarding.completed.v1` through AsyncStorage
  before entering the existing session check. Failed saves offer retry instead
  of silently losing completion. A slow local read has a bounded waiting state.
- Returning users bypass onboarding after the splash. The existing `/me` check
  still determines whether the main UI mounts, with a timeout and retry action.

There is no sign-in screen or persisted authentication token in the current
project; its backend still supplies the development identity. This change does
not introduce or claim production authentication. Existing installations without
the completion preference see onboarding once after this update. Clearing app
data or reinstalling without restored data will show onboarding again.

## Assets and layout

`app/assets/lifeos-logo.png` is an unchanged copy of the supplied transparent mark
(`ChatGPT Image Sep 19, 2026, 06_41_36 AM.png`). Its original aspect ratio and
colors are preserved. No generated logo, recoloring, nature imagery, or new
illustration assets are used. The other supplied images are visual references.

The screen body scrolls when space is limited or text is enlarged. Actions and
pagination stay outside the scroll body, inside safe areas. Page changes use a
220ms fade and small horizontal translation; reduced-motion settings disable it.
Android Back returns to the previous onboarding page; at page one it follows
normal Android behavior. Completing onboarding unmounts this handler before the
existing LifeOS navigation takes over.

## Build and checks

Adding AsyncStorage and expo-splash-screen requires a new native APK. Metro-only
reloads of an old APK do not include these modules.

```powershell
cd app
node --experimental-strip-types --test scripts/onboarding.test.cjs plugins/withWindowsCxxDriver.test.js
npx tsc --noEmit
npx expo export --platform android --output-dir dist/onboarding-export
npx expo prebuild --platform android --no-install
```

Test the cold launch, all four pages, Skip, Back, Android Back, and Get started.
After completion, force-stop and relaunch to confirm onboarding stays dismissed.
Exercise a small viewport and enlarged text as well as the normal phone viewport.
Do not clear the user's app data to test onboarding. Test only its completion key
on a debug install, preserving any previous value.

Android controls the system launch-screen layout. The complete animated wordmark
and tagline are rendered in React after that native screen. Expo notes that
development builds do not fully reproduce the final standalone native splash;
check a release build before shipping.

Reference: [Expo splash-screen documentation](https://docs.expo.dev/versions/v55.0.0/sdk/splash-screen/).

## Verification record — September 19, 2026

- Mobile TypeScript: passed.
- Entry-state tests: 7 passed. Windows build-plugin tests: 4 passed.
- Android production JavaScript export: passed, with the supplied logo bundled.
- Native ARM64 debug APK: Gradle `assembleDebug` passed (204 tasks).
- Supplied and bundled logo SHA-256 hashes match.
- Metro excludes generated build artifacts while continuing to watch app source.
- Physical phone: APK update subsequently installed successfully. Cold launch
  reached the first onboarding page, and its rendered screenshot was inspected:
  supplied logo, headline, body copy, pagination, and Next/Skip controls are
  visible without clipping at the phone's normal size.
- Android rejected automated taps with `INJECT_EVENTS` permission denied.
  Remaining pages, interactive completion, small-screen behavior, and restart
  persistence still need manual device checks. No device security settings were
  changed to bypass that restriction.

The full Android build used a short project-local Java socket directory and a
temporary PKCS12 truststore exported from the existing Windows trusted public
certificates. Those machine-specific artifacts remain in ignored `app/dist`;
certificate validation was not disabled. The Metro exclusion prevents temporary
Java sockets in that folder from causing Windows file-watcher errors.
