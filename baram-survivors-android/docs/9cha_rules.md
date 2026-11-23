# 9차 스킬 작업 규칙 (작업자 공통)

컨테이너가 바뀌어도 남도록 저장소에 둔다. 그림·소리 원본은 저장소에 넣지 않는다.

## 사용자 규칙
- 그림은 공식 바람의나라·연 픽셀만. 직접 그리거나 AI로 만들지 않는다. 자르기·옮기기·뒤집기·색 맞춤·깨진 점을
  옆의 같은 색 점으로 메우는 것은 된다.
- 추출에 얼굴·캐릭터·데미지 숫자("20억")·체력바·이름표·허수아비 표식·바닥 무늬·UI가 섞이면 안 된다. 네모 잘림 없이
  가장자리가 그림 자신의 모양으로 끝나거나 부드럽게 사라져야 한다. 시트는 갈색·어두운 바탕에서 확대해 직접 본다.
- 색 세기는 원작과 같아야 한다(같은 배율로 원작 컷과 나란히 비교). 반투명 그림은 어두운 바닥에서 바래 보이니
  불투명도(`opaque`)·그리기 알파 1로 맞춘다.
- 보이는 범위 = 맞는 범위(쟁·레이드 AI 포함). 직선·전방·이동 기술은 바라보는 방향으로만.
  크기 규칙(game.js): 그림의 그려지는 크기(모든 프레임 합친 상자) ≤ 맞는 범위 × 1.3. 한 몸 = ONE_TILES 1.4칸(fxOn 기본 상한,
  보스는 키만큼), 시전자 위·버프·기원 = SELF_TILES 1.5칸, 한 줄 = LINE_ACROSS 1.3칸, 날아가는 것 = 1.4칸(addFx o.mv),
  면적은 fxSquare/fxTiles/fxIn(2r+1). 단마다 그림을 키우지 않는다(grownFx·meleeBig·casterBig는 크기 그대로).
  원작 크기로 직접 넣는 9차 그림도 capK로 자기 판정 상자 안에. 검사: addFx의 o.body/o.self/o.cap, capK.
- 장면 없는 기술·설명창상 패시브 → 패시브(그림 없음). PVP 기술 → 몬스터 상대로, 모습은 그대로.
- 필살기: 원작 궁극 연출, `cine9: 0.75`(사용자 결정), 어둠 0.15초 + 약 1.1초, 피해 1~2박자. 가운데 내용(화살비 등)을
  살린다. 화면이 어두워지는 것은 필살기뿐.
- 1320 조각은 2662 장면과 같은 그림임을 겹쳐 증명한 경우만.
- 폰 메모리: 셀 360px 이하(cap 420 허용), 시트 폭 4096 이하.
- 커밋은 한국어, 끝에 두 줄:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` /
  `Claude-Session: https://claude.ai/code/session_01LCfg2ukk4pLxB3zK2qpurg`. 모델 이름은 커밋·코드에 넣지 않는다.

## 자료 (S = /tmp/claude-0/-home-user-minimal-kafka/b169fcd6-4910-5b2f-bac5-ebc1ca794116/scratchpad)
- 원작 장면: `$S/s9/gif2662/IMG<n>.gif`(xoxd.tistory.com/2662의 n번째 그림, IMG01~09 별칭 있음), 설명창 `$S/s9/tips/IMG<n>.png`,
  1320 조각 `$S/s9/dl1320/NN.gif`. 기술↔장면 표는 `tools/s9_fx.json`의 각 항목 `src`·`why`와 `web/js/data.js` S9 블록 주석.
- 9차 시트: `python3 tools/s9_fx.py tools/s9_fx.json $S/s9 <GEAR>/s9fx [ids]` 다음 `python3 tools/s9_stamps.py $S/s9 <GEAR>/s9fx`
  (stamps 빌더와 a_ult9 화살비 후처리; `"mode":"stamps"` 항목은 색인 유지).
- 테스트 www: `python3 tools/repack_from_apk.py $S/oldapk/assets/www <GEAR> <OUT_WWW>`(이전 APK 그림 + 지금 web/ + <GEAR>/s9fx)
  후 `cd <OUT_WWW> && python3 -m http.server <PORT>`. 스크린샷:
  `PORT=<port> CLS=<n> DSF=1 WARM=o_a,o_b node tools/s9_shoot.js <outdir> <name> <skillId|ult> "t1,t2"`(5번째 인자에 경로 금지).
  직업 번호: warrior 0, rogue 1, mage 2, poet 3, archer 4, lancer 5, monk 6, magus 7, celestial 8, dokkaebi 9, reaper 10.
- 1320 조각 사용처(중복 금지): #18 흑룡광참(w_heukgwang). (#20은 초혼진무에 잠깐 썼다가 연의 보라 사슬로 되돌려 미사용) 흑룡검풍 오라(w_heukaura)는 연의 흑룡광참 회오리를
  흑적색으로: 입력 `$S/s9/yeon/k_w_blackdragon.webp`+`.json`(이전 APK의 assets/fx와 manifest 항목을 그대로 복사).
- 원작 영웅 76px ↔ 우리 47px (k 0.62).
- js 검사는 반드시 `node --input-type=module --check < web/js/<file>` (data.js는 모듈: 일반 --check로는 병합 잔재를 못 잡음).

## 결정 사항 (사용자가 판단을 맡김, 2026-11-22)
- 쿨타임은 원작보다 길게 유지: 화혼돌파 3초(원작 2), 천궁난사 4초(2), 광폭기사출 3.2초(1.5), 극청룡참 2.5초(1).
  이 게임은 자동 시전이라 원작 쿨로는 여러 마리를 치는 기술이 쉬지 않고 나가 화면을 덮고 다른 기술과 균형이 깨진다.
- 사거리·범위는 그림에 맞춤(보이는 범위 = 맞는 범위): 기공십자광선'쾌 5칸(원작 7), 극청룡참 2×3, 절섬 3×3, 진'투귀살 5칸.
- 장승영역 지속 8초(원작 15)·쿨 20초: 받는 피해 50% 감소가 15초면 사냥이 무너진다.
- 마궁폭사는 연옥'만월 뒤 조건 없이 일반 시전(쿨 9초): 이 게임엔 '붉은달의 기운' 자원이 없다.
- 천신의심판 빛기둥은 원작 픽셀만(숫자에 덮였던 가운데는 비워 둠). 지어낸 메움은 쓰지 않는다.
- 광폭십자광선'쾌(광폭화 전용)는 넣지 않는다: 광폭화 상태가 없다.
- 장승 부서지는 끝 장면은 체력바에 덮여 빼고 0.4초에 사라지게.
- 흑룡광참: 1320 #18을 역순(작은 회오리 → 큰 회오리)으로, 다섯 칸을 나가다 몬스터에 닿으면 그 자리에서 1.2초 돌며 둘레를 끌어들여 벤다.
- 흑룡검풍: 옆에서 도는 바람이 아니라 몸에 두른 흑적색 오라(2.6칸), 둘레 한 칸을 벤다.
- 초혼진무: 연의 보라 사슬(k_w_chohonjin) 하나를 4칸 안 가장 몰린 곳에 3칸으로, 둘레 두 칸의 몬스터를 그 안으로 끌어모아 1.2초 묶음(보스 0.5초). 영웅 둘레에는 뜨지 않는다.
