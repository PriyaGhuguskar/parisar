#!/usr/bin/env bash
# Start the Android emulator + Expo dev server and open Parisar in it.
# Daily use:  cd apps/mobile && pnpm emu
#
# One-time setup (already done on this laptop):
#   - Android SDK in ~/Android/Sdk (emulator, platform-tools, android-35 image)
#   - virtual phone "Parisar_Pixel"
#   - Parisar development build installed on it (reinstall:
#     adb install -r ~/.local/share/android-dev/parisar-dev.apk)
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"
AVD="${AVD:-Parisar_Pixel}"
PORT=8081

if ! "$ADB" devices | grep -q "^emulator-"; then
  echo "Starting the $AVD emulator…"
  nohup "$ANDROID_HOME/emulator/emulator" -avd "$AVD" -gpu auto -no-snapshot-save -no-boot-anim \
    >/tmp/parisar-emulator.log 2>&1 &
fi

echo "Waiting for Android to boot…"
until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 3; done

# The emulator reaches the laptop's dev server as its own localhost:8081.
"$ADB" reverse tcp:$PORT tcp:$PORT >/dev/null

# Open Parisar once the server is up (runs in the background).
(
  until curl -s --max-time 2 "http://localhost:$PORT/status" | grep -q running; do sleep 2; done
  "$ADB" shell am start -a android.intent.action.VIEW \
    -d "exp+parisar://expo-development-client/?url=http%3A%2F%2Flocalhost%3A$PORT" >/dev/null
) &

echo "Starting the dev server — save a file and the emulator updates. Ctrl+C to stop."
cd "$(dirname "$0")/.."
exec npx expo start --dev-client --port $PORT
