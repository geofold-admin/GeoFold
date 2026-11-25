#!/bin/bash
set -e
export NODE_OPTIONS="--max-old-space-size=4096"
export JAVA_HOME="C:/Users/Majes/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2"
export PATH="$JAVA_HOME/bin:$PATH"

cd /f/KERJA/Geofold/mobile/android
# Force rebuild of the JS bundle so our changes are inside the APK
rm -rf app/build/generated/assets/react/release/index.android.bundle
./gradlew packageRelease -PreactNativeArchitectures=arm64-v8a -x :app:lintVitalAnalyzeRelease -x :app:lintVitalRelease
