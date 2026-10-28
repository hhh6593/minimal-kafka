#!/usr/bin/env bash
# Builds an offline Android APK of D2 Survivors (https://d2survivors.lol/).
#
#   ./build.sh            mirror the site, patch it for offline use, build the APK
#   ./build.sh --no-fetch reuse build/www from an earlier run
#
# Needs: JDK 17+, python3 (with Pillow for the launcher icons), and an Android
# SDK with platforms;android-35 and build-tools;35.0.0 at $ANDROID_HOME.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SDK="${ANDROID_HOME:-/opt/android-sdk}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-35/android.jar"
OUT="$HERE/build"
WWW="$OUT/www"
APK="$HERE/D2Survivors-offline.apk"

for f in "$BT/aapt2" "$BT/d8" "$BT/zipalign" "$BT/apksigner" "$JAR"; do
  [ -e "$f" ] || { echo "missing $f (install platforms;android-35 and build-tools;35.0.0)" >&2; exit 1; }
done

if [ "${1:-}" != "--no-fetch" ]; then
  rm -rf "$WWW"
  python3 -I "$HERE/tools/mirror.py" "$WWW"
fi
[ -f "$WWW/play/index.html" ] || { echo "no mirror at $WWW" >&2; exit 1; }
python3 -I "$HERE/tools/patch_offline.py" "$WWW"

rm -rf "$OUT/gen" "$OUT/classes" "$OUT/res" "$OUT/assets" "$OUT/compiled" "$OUT"/*.apk "$OUT"/*.zip
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/compiled" "$OUT/assets"
cp -r "$HERE/res" "$OUT/res"
cp -r "$WWW" "$OUT/assets/www"
rm -f "$OUT/assets/www/robots.txt"

# Launcher icons from the site's own icon.
python3 -I - "$WWW/icon-512.png" "$OUT/res" <<'PY'
import sys, os
from PIL import Image
src, res = sys.argv[1], sys.argv[2]
for d, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    os.makedirs(f"{res}/mipmap-{d}", exist_ok=True)
    Image.open(src).convert("RGBA").resize((px, px), Image.LANCZOS).save(f"{res}/mipmap-{d}/ic_launcher.png")
PY

"$BT/aapt2" compile --dir "$OUT/res" -o "$OUT/compiled/res.zip"
"$BT/aapt2" link -o "$OUT/unsigned.apk" -I "$JAR" \
  --manifest "$HERE/AndroidManifest.xml" -A "$OUT/assets" \
  --java "$OUT/gen" --min-sdk-version 24 --target-sdk-version 35 \
  "$OUT/compiled/res.zip"

javac -source 8 -target 8 -Xlint:-options -encoding UTF-8 -bootclasspath "$JAR" -classpath "$JAR:$BT/core-lambda-stubs.jar" \
  -d "$OUT/classes" $(find "$HERE/src" "$OUT/gen" -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$OUT" $(find "$OUT/classes" -name '*.class')
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)

"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

KS="$HERE/keystore/d2survivors-offline.jks"
if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -keystore "$KS" -storepass d2survivors -keypass d2survivors \
    -alias d2s -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=D2 Survivors Offline (personal build)" >/dev/null
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:d2survivors --key-pass pass:d2survivors \
  --ks-key-alias d2s --out "$APK" "$OUT/aligned.apk"
"$BT/apksigner" verify "$APK"
echo "built $APK ($(du -h "$APK" | cut -f1))"
