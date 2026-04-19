# minimal-kafka

> Apache Kafka 4.2.0의 라이프사이클을 **코드 레벨에서** 이해하기 위한 교육용 미니 브로커.
> 단일 JVM, Java 17, Gradle. 51개 재현 테스트 / 15개 버전 / 전부 PASS.

## 왜 만들었나

Kafka 문서는 "이런 개념이 있다"까지는 알려주지만, 현업에서 마주치는 트러블 — 리밸런스 스톰, ISR shrink, 멱등 프로듀서의 OUT_OF_ORDER fatal, KRaft 좀비 컨트롤러 등 — 이 왜·어떻게 일어나는지는 코드를 읽기 전에는 체감되지 않는다. 이 프로젝트는 그 간극을 메우기 위한 최소 재현 환경이다.

- **v1~v14**: 핵심 카프카 컴포넌트를 버전별로 하나씩 도입하며 누적 학습
- **v15**: 실제로 목격된 희귀 케이스 6종 (KIP-890, KAFKA-15489, KIP-903, KAFKA-12152, KIP-405, KIP-227) 검증된 출처 기반 재현

## 빠른 시작

### 선행 조건
- JDK 17+ (프로젝트는 Gradle 툴체인으로 자동 매칭 시도)
- Gradle 설치 불필요 — 래퍼 포함

### 빌드 + 전체 테스트
```bash
./gradlew build
```
51개 테스트 전부 PASS 확인.

### 특정 버전만
```bash
./gradlew :scenarios:test --tests 'mk.scenarios.V07_*'
```

### 수동 실행 (브로커 + 프로듀서 + 컨슈머)
```bash
# T1
./gradlew :broker:run

# T2
./gradlew --quiet :clients:runConsumer --args="127.0.0.1 9092 demo"

# T3
./gradlew --quiet :clients:runProducer --args="127.0.0.1 9092 demo"
> hello
> world
```

## 프로젝트 구조

```
minimal-kafka/
├── broker/                        미니 브로커
│   └── src/main/java/mk/broker/
│       ├── Broker.java            파사드
│       ├── network/               Acceptor, ConnectionHandler
│       ├── protocol/              Wire (4B length + JSON)
│       ├── api/                   ApiHandler, BrokerToggles
│       ├── log/                   Log, InMemoryLog, SegmentedLog, LogManager
│       ├── coordinator/           GroupCoordinator
│       ├── offset/                OffsetStore (__consumer_offsets 축약)
│       ├── producer/              ProducerStateManager, TransactionalProducer
│       ├── replication/           ReplicaManager (ISR, HWM)
│       ├── controller/            Controller stub
│       ├── retention/             Retention (DELETE / COMPACT)
│       ├── fetchsession/          FetchSessionCache (KIP-227 시뮬)
│       └── config/                KafkaConfig
├── clients/                       클라이언트 라이브러리
│   └── src/main/java/mk/clients/
│       ├── producer/              Producer, Partitioner, ProducerConfig
│       ├── consumer/              Consumer, GroupConsumer, Assignors, ConsumerConfig
│       ├── common/                WireClient
│       ├── ProducerMain.java      CLI
│       └── ConsumerMain.java      CLI
├── scenarios/                     시나리오 재현 테스트
│   └── src/test/java/mk/scenarios/
│       ├── V01_QuickstartTest.java
│       ├── V02_DurabilityTest.java
│       ├── ... (V03 ~ V14)
│       └── V15_1..6 (희귀 케이스)
├── docs/
│   ├── ROADMAP.md                 버전별 개요 + v15 출처
│   ├── v01-quickstart.md          초기 마크다운 가이드
│   └── html/
│       ├── index.html             단일 페이지 가이드 (Toss 디자인 시스템)
│       ├── code-guide.html        컴포넌트 딥다이브
│       ├── test.js                Playwright 테스트 18개
│       ├── playwright.config.js
│       └── package.json           @playwright/test
├── build.gradle
├── settings.gradle
└── gradlew / gradlew.bat          Gradle 8.10 래퍼
```

## 버전 로드맵

| 버전 | 주제 | 주요 시나리오 |
|------|------|--------------|
| v1  | 퀵스타트 | Produce/Fetch 왕복 |
| v2  | 디스크 로그 + fsync | unclean kill 시 유실 |
| v3  | 멀티 파티션 + 파티셔너 | 핫 파티션 (키 편중) |
| v4  | 배칭 + acks | linger/batch, sentinel offset |
| v5  | 멱등 프로듀서 | PID/epoch/seq, OUT_OF_ORDER |
| v6  | 컨슈머 poll 루프 | session timeout → 강퇴 |
| v7  | 컨슈머 그룹 | k8s 롤링 리밸런스 스톰 |
| v8  | assignor | range/roundrobin/sticky 비교 |
| v9  | 오프셋 커밋 | auto commit skip vs 수동 |
| v10 | 리플리케이션 + ISR | min.insync.replicas 거부 |
| v11 | unclean leader election | HWM 되감김 |
| v12 | 컨트롤러 + 메타데이터 | epoch bump |
| v13 | 리텐션 + 컴팩션 | DELETE / COMPACT |
| v14 | 운영 트러블 | head-of-line, 쿼터 스로틀 |
| v15 | 드문 실전 케이스 | 아래 참고 |

### v15 희귀 케이스 (검증된 출처)

| # | 주제 | 출처 |
|---|------|------|
| v15-1 | 좀비 트랜잭션 프로듀서 | [KIP-890](https://cwiki.apache.org/confluence/display/KAFKA/KIP-890:+Transactions+Server-Side+Defense), KAFKA-14402 |
| v15-2 | KRaft 좀비 컨트롤러 | [KAFKA-15489](https://issues.apache.org/jira/browse/KAFKA-15489), [KIP-595](https://cwiki.apache.org/confluence/display/KAFKA/KIP-595:+A+Raft+Protocol+for+the+Metadata+Quorum) |
| v15-3 | Stale broker epoch ISR | [KIP-903](https://cwiki.apache.org/confluence/display/KAFKA/KIP-903:+Replicas+with+stale+broker+epoch+should+not+be+allowed+to+join+the+ISR), [KAFKA-14617](https://issues.apache.org/jira/browse/KAFKA-14617) |
| v15-4 | 멱등 seq 리셋 갭 | [KAFKA-12152 PR #9832](https://github.com/apache/kafka/pull/9832) |
| v15-5 | 티어드 스토리지 cold read | [KIP-405](https://cwiki.apache.org/confluence/display/KAFKA/KIP-405:+Kafka+Tiered+Storage), KIP-1176, KIP-1255 |
| v15-6 | Fetch session eviction 스톰 | [KIP-227](https://cwiki.apache.org/confluence/display/KAFKA/KIP-227:+Introduce+Incremental+FetchRequests+to+Increase+Partition+Scalability), KAFKA-17182 |

## 문서

### HTML 가이드 (Toss 디자인 시스템)
```bash
open docs/html/index.html          # 메인 — 버전별 시나리오 + 실행 방법
open docs/html/code-guide.html     # 컴포넌트 딥다이브
```

두 페이지 모두 반응형 (375px ~ 1920px) + 다크모드 토글.

### Playwright 검증
```bash
cd docs/html
npm install
npx playwright install chromium
npx playwright test
# 18 tests / 5 viewports / light + dark
```

### 마크다운
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — 전체 로드맵 + v15 출처

## 개발 워크플로

### 새 시나리오 추가
1. `scenarios/src/test/java/mk/scenarios/VXX_<이름>Test.java` 작성
2. 필요하면 `BrokerToggles`에 재현용 플래그 추가
3. 테스트 실행해 PASS 확인
4. `docs/html/index.html`에 해당 버전 카드 갱신 (runbox 포함)
5. `docs/html/test.js`의 앵커 리스트에 ID 추가

### 시나리오 재현 패턴
```java
// 토글로 버그 상태 선택
broker.api().toggles().resetSequenceOnEpochBumpForAllPartitions = false;

// 서버 측 상태를 시나리오가 직접 조작 (실 구현 없이 효과만)
broker.api().producerState().bumpEpoch(pid, inFlight, /*resetAll=*/ false);
broker.api().coordinator().expireDeadMembers(now);  // 시간 의존성 제거
```

세부 패턴은 [`docs/html/code-guide.html`](docs/html/code-guide.html) 의 "시나리오 + 토글" 섹션 참고.

## 구현 원칙

1. **구조 투명성 > DRY**. 한 파일만 읽어도 전체 흐름이 보이도록.
2. **모든 트러블은 재현 가능**. 테스트 하나가 시나리오 하나.
3. **실제 Kafka 대응 명시**. 각 클래스에 JavaDoc으로 Kafka 원본 클래스/설정 주석.
4. **단일 코드베이스**. 버전별 디렉터리 fork 대신 `BrokerToggles`로 "전/후" 토글.

## 스코프 제외

- KRaft 합의 프로토콜 전체 구현
- SASL / SSL / ACL
- Kafka Connect / Streams / MirrorMaker
- 실제 네트워크 리플리케이션 (브로커 간 소켓)
- Kafka 바이너리 와이어 프로토콜 (우리는 JSON 프레이밍)

## 라이선스 및 출처

교육 목적 프로젝트. 실제 Kafka는 [Apache 2.0](https://github.com/apache/kafka/blob/trunk/LICENSE) 하에 배포된다.

HTML 가이드 디자인은 [bitjaru/styleseed](https://github.com/bitjaru/styleseed) `engine/DESIGN-LANGUAGE.md` + `skins/toss/theme.css` 기반.

## 기여

새 시나리오 / v15 후속 케이스 / 문서 개선 환영. 기여 시:
- 모든 시나리오는 검증된 공식 출처(JIRA, KIP, 공식 블로그) 필수
- 테스트 통과 전제
- 실제 Kafka와의 대응 관계를 주석에 명시
