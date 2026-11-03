# Android development over USB

For the currently installed debug APK, start the backend as below and run
`npm run usb` from `app` in a separate terminal. This forwards ports 3000 and 8081,
sets the backend URL, and starts Metro with IPv4 localhost. Keep it running and
open LifeOS on the phone; no rebuild or Expo Go is needed.

If the APK was built with another Metro port, set `LIFEOS_METRO_PORT` to that port
before running the command. A debug APK needs Metro to load JavaScript. A blank
screen with `Unable to load script` can mean Metro is stopped or unreachable.
On this Windows machine, plain `--localhost` bound only to IPv6; the USB startup
script uses `--dns-result-order=ipv4first` to make it reachable through ADB.

Enable USB debugging, connect the phone, and approve the computer on the phone.
Confirm it appears as `device` in `adb devices -l`.

Start the backend in one PowerShell terminal:

```powershell
cd C:\MyProjects\LifeOS\backend
npm run dev
```

Stop any previous frontend Metro process before starting a new one. In a second terminal:

```powershell
cd C:\MyProjects\LifeOS\app
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8081 tcp:8081
$env:EXPO_PUBLIC_API_URL="http://127.0.0.1:3000"
npx expo run:android --device --port 8081
```

This builds and installs the native LifeOS app. Expo Go is not required.
The Expo CLI remains the build tool for this repository. Keep the terminal open
for the JavaScript development server. Reapply `adb reverse` after reconnecting
the device. If using another Metro port, reverse that same port and pass it to
`--port`.

## Windows C++ linker errors

When the SDK path contains spaces, CMake may invoke the 8.3 filename
`CLANG_~1.EXE`. Combined with the NDK's `-no-canonical-prefixes` option, this can
omit C++ runtime linking and produce undefined `std::__ndk1` or `__cxa_*` symbols.
A shortened `sdk.dir` alone did not fix the generated compiler command here.

`app/plugins/withWindowsCxxDriver.js` adds `--driver-mode=g++` to the CMake
C++ flags for Android application and library modules on Windows. It preserves
other flags and is also registered in `app.json` so prebuild regeneration keeps
the workaround. No dependency source files are patched. The currently generated
`android/build.gradle` has the same configuration applied.

The callback must be registered **before** the Android root plugins are applied.
React Native's root plugin eagerly evaluates `:app`; appending the callback at
the end of the root file misses application configuration even if library flags
are updated. Regression checks cover this ordering, migration of the old block,
and repeated generation:

```powershell
node --test app/plugins/withWindowsCxxDriver.test.js
```

Native target compilation can be checked separately from APK assembly. Passing
native compilation does not establish that Gradle packaging or device launch
succeeded.
