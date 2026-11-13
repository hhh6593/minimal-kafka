#!/usr/bin/env bash
# Builds the Baram Survivors APK, for playing alone on your own phone.
#
#   ./build.sh IMAGES_DIR [AUDIO_DIR] [AVATAR_DIR] [TOWN_DIR] [SKILL_FX_DIR] [MODERN_DIR]
#
# IMAGES_DIR is the unpacked image download (the folder holding image/, magics/, itemImage/,
# maps/ and _pages.json). AUDIO_DIR holds bgm/ and sfx/ sound files (default: ./audio); see README.
# AVATAR_DIR is the unpacked wardrobe download (oldbaram_avatar_sprites): the hero is dressed
# from it, with walking and casting frames. Without it the class pictures stand in.
# SKILL_FX_DIR: the skill-icon download's numbered effect GIFs (사이트번호별/).
# MODERN_DIR: today's client effects for the last spell of each tree, new_<skill id>.gif.
# GEAR_DIR: today's client item pictures, <item name>.png (tools/fetch_gear.py downloads them).
# TOWN_DIR holds town.png (a village map from the 1996 client, 48-pixel tiles) and smithy.png.
# The art and sound go into the APK only, never into the repository.
#
# Needs: JDK 17+, python3 with Pillow, and an Android SDK with platforms;android-35 and
# build-tools;35.0.0 at $ANDROID_HOME (default /opt/android-sdk).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
IMAGES="${1:?usage: ./build.sh IMAGES_DIR [AUDIO_DIR] [AVATAR_DIR] [TOWN_DIR] [SKILL_FX_DIR] [MODERN_DIR] [GEAR_DIR]}"
AUDIO="${2:-$HERE/audio}"
AVATAR="${3:-}"
TOWN="${4:-}"
SKILLFX="${5:-}"
MODERN="${6:-}"
GEAR="${7:-}"
SDK="${ANDROID_HOME:-/opt/android-sdk}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-35/android.jar"
OUT="$HERE/build"
APK="$HERE/BaramSurvivors.apk"

for f in "$BT/aapt2" "$BT/d8" "$BT/zipalign" "$BT/apksigner" "$JAR"; do
  [ -e "$f" ] || { echo "missing $f (install platforms;android-35 and build-tools;35.0.0)" >&2; exit 1; }
done
[ -f "$IMAGES/_pages.json" ] || { echo "no _pages.json in $IMAGES: pass the unpacked image folder" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/compiled" "$OUT/assets"
cp -r "$HERE/web" "$OUT/assets/www"
python3 -I "$HERE/tools/prepare_assets.py" "$IMAGES" "$OUT/assets/www/assets" "$AUDIO" $AVATAR $TOWN $SKILLFX $MODERN $GEAR
cp -r "$HERE/res" "$OUT/res"

# Each build gets a higher version code (minutes since 2026-01-01) so Android installs it as an
# update, and the title screen shows which build is running.
VERSION_CODE=$(( ($(date +%s) - 1767225600) / 60 ))
VERSION_NAME="$(date +%Y.%m.%d-%H%M)"
sed -e "s/android:versionCode=\"[0-9]*\"/android:versionCode=\"$VERSION_CODE\"/" \
    -e "s/android:versionName=\"[^\"]*\"/android:versionName=\"$VERSION_NAME\"/" \
    "$HERE/AndroidManifest.xml" > "$OUT/AndroidManifest.xml"
python3 -I - "$OUT/assets/www/assets/manifest.json" "$VERSION_NAME" <<'PY'
import json, sys
p, v = sys.argv[1], sys.argv[2]
m = json.load(open(p, encoding="utf-8"))
m["version"] = v
json.dump(m, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
PY

# Launcher icon: the four classes' faces on a wooden tile.
python3 -I - "$OUT/assets/www/assets/hero" "$OUT/res" <<'PY'
import sys, os
from PIL import Image, ImageDraw
heroes, res = sys.argv[1], sys.argv[2]
base = Image.new("RGBA", (192, 192), (43, 29, 18, 255))
d = ImageDraw.Draw(base)
d.rectangle([0, 0, 191, 191], outline=(160, 122, 70, 255), width=6)
hero = Image.open(os.path.join(heroes, "1003.png")).convert("RGBA")
s = min(150 / hero.width, 150 / hero.height)
hero = hero.resize((int(hero.width * s), int(hero.height * s)), Image.NEAREST)
base.alpha_composite(hero, ((192 - hero.width) // 2, 180 - hero.height))
for name, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    os.makedirs(f"{res}/mipmap-{name}", exist_ok=True)
    base.resize((px, px), Image.NEAREST).save(f"{res}/mipmap-{name}/ic_launcher.png")
PY

"$BT/aapt2" compile --dir "$OUT/res" -o "$OUT/compiled/res.zip"
"$BT/aapt2" link -o "$OUT/unsigned.apk" -I "$JAR" \
  --manifest "$OUT/AndroidManifest.xml" -A "$OUT/assets" \
  --java "$OUT/gen" --min-sdk-version 24 --target-sdk-version 35 \
  "$OUT/compiled/res.zip"

javac -source 8 -target 8 -Xlint:-options -encoding UTF-8 -bootclasspath "$JAR" -classpath "$JAR:$BT/core-lambda-stubs.jar" \
  -d "$OUT/classes" $(find "$HERE/src" "$OUT/gen" -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$OUT" $(find "$OUT/classes" -name '*.class')
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)

"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

# Keep this key: an update installs over the old app (keeping records) only when signed with it.
KS="$HERE/keystore/baram-survivors.jks"
if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -keystore "$KS" -storepass baramsurvivors -keypass baramsurvivors \
    -alias baram -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Baram Survivors (personal build)" >/dev/null
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:baramsurvivors --key-pass pass:baramsurvivors \
  --ks-key-alias baram --out "$APK" "$OUT/aligned.apk"
"$BT/apksigner" verify "$APK"
echo "built $APK ($(du -h "$APK" | cut -f1))"
