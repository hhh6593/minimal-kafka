# D2 Survivors 오프라인 안드로이드 래퍼

[D2 Survivors](https://d2survivors.lol/)(framara의 비공식 Diablo II 팬게임)를
인터넷 없이 안드로이드에서 실행하기 위한 **개인용** WebView 래퍼입니다.
게임 코드나 Diablo II 에셋은 이 저장소에 포함하지 않습니다. `build.sh`가 빌드할 때
사이트를 내려받아 APK 안에만 넣습니다. 만든 APK는 재배포하지 마세요.

## 동작 방식

- 앱이 `127.0.0.1:47811`에 작은 HTTP 서버(`LocalServer.java`)를 띄워 APK에 내장된
  사이트 파일을 제공합니다. localhost는 보안 컨텍스트라서 사이트의 서비스워커와 OPFS
  저장소가 그대로 동작합니다. 포트를 고정해 두었기 때문에 추출된 파일과 세이브가 실행할
  때마다 유지됩니다.
- 온라인 사이트는 서버에서 게임 에셋(`/d2/`)을 내려받습니다. 오프라인 앱은 사이트에 원래
  있는 **"내 D2 파일 사용"** 모드를 씁니다. 처음 한 번 Diablo II의 `.mpq` 파일을 선택하면
  게임이 OPFS에 추출하고, 그 뒤로는 완전히 오프라인으로 돌아갑니다.
- `tools/patch_offline.py`가 미러에 적용하는 패치:
  1. `site.json`의 `hostedFiles`를 `false`로 바꿉니다. 서버 에셋 대신 내 파일을 씁니다.
  2. 터치 전용 기기에서 내 파일 모드를 막는 게이트(`Y()`)를 해제합니다.
  3. Cloudflare 분석 비콘을 제거합니다.
  4. `webkitdirectory` 대신 다중 파일 선택을 씁니다. Android WebView에는 폴더 선택기가 없습니다.

## 사용법

1. APK를 설치합니다("출처를 알 수 없는 앱" 허용 필요).
2. 휴대폰에 Diablo II(클래식, 1.14 패치) 파일을 복사해 둡니다. 필수: `d2data.mpq`,
   `d2char.mpq`, `d2sfx.mpq`, `d2exp.mpq`, `patch_d2.mpq`. 선택: `d2music.mpq`,
   `d2xmusic.mpq`, `d2speech.mpq`, `d2xtalk.mpq`.
3. 앱 → **USE MY OWN FILES…** → 위 파일을 **모두 한꺼번에** 선택하면 추출이 시작됩니다.
4. 추출이 끝나면 비행기 모드에서도 플레이할 수 있습니다.

D2R(CASC 폴더)은 폴더 단위로 선택해야 해서 이 앱에서는 지원하지 않습니다.
앱을 삭제하면 추출된 파일과 세이브도 함께 지워집니다(앱 데이터에 저장됨).

## 빌드

```sh
sdkmanager "platforms;android-34" "build-tools;35.0.0"
ANDROID_HOME=/path/to/sdk ./build.sh        # 미러 → 패치 → APK
```

서명 키는 `keystore/d2survivors-offline.jks`에 있습니다. 없으면 새로 만듭니다.
같은 키로 서명해야 데이터를 유지한 채 업데이트 설치가 되니 키를 보관해 두세요.
