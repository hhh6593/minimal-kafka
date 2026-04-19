# minimal-kafka 로드맵

Kafka 4.2.0 기준의 핵심 동작과 실전 트러블을 **코드로 직접 보고 손으로 재현**하기 위한 학습용 프로젝트.

## 철학

1. **구조 투명성 > DRY**. 버전 간 코드가 조금 겹쳐도 한 버전만 봐도 이해 가능한 것을 우선한다.
2. **시나리오 재현 가능성**. 모든 트러블 케이스는 `./gradlew :scenarios:test --tests ...` 명령 하나로 재현된다.
3. **실제 Kafka와의 연결고리**. 각 가이드는 해당 문제가 실제 Kafka 소스의 어느 클래스 / 어느 설정키에 해당하는지 명시한다.
4. **스코프 제약**. 합의 프로토콜(KRaft 전체), SASL/SSL, ACL, Connect, Streams, MirrorMaker는 구현하지 않는다.

## 프로젝트 구조

```
minimal-kafka/
  broker/     JVM 내 미니 브로커 (network, log, api, config)
  clients/    Producer / Consumer + CLI
  scenarios/  버전별 JUnit 재현 테스트
  docs/       가이드 문서 (이 파일 포함)
```

## 실행 기본

```bash
# 전체 빌드 + 전 테스트
./gradlew build

# v1 시나리오만
./gradlew :scenarios:test --tests 'mk.scenarios.V01_*'

# 브로커 단독 실행 (포트 9092)
./gradlew :broker:run

# 프로듀서 / 컨슈머 CLI
./gradlew :clients:runProducer --args="127.0.0.1 9092 demo"
./gradlew :clients:runConsumer --args="127.0.0.1 9092 demo"
```

## 버전 로드맵

| 버전 | 주제 | 메인 시나리오 | 상태 |
|------|------|--------------|------|
| v1  | 퀵스타트. 단일 브로커, 메모리 로그, 단일 파티션 produce/fetch | round-trip smoke (3 테스트) | ✅ |
| v2  | 파일 로그 세그먼트 + fsync | 브로커 kill 시 마지막 N건 유실 (3 테스트) | ✅ |
| v3  | 멀티 파티션 + 파티셔너 | 핫 파티션(키 편중), null key sticky/RR (4 테스트) | ✅ |
| v4  | 프로듀서 배칭 + acks | linger/batch 트레이드오프, sentinel offset (4 테스트) | ✅ |
| v5  | 멱등 프로듀서 | retries + !idempotence → 중복; seq gap (5 테스트) | ✅ |
| v6  | 컨슈머 poll 루프 | `session.timeout.ms` 초과 → 강퇴 → 재조인 (2 테스트) | ✅ |
| v7  | 컨슈머 그룹 코디네이션 | k8s 롤링 리스타트 리밸런스 스톰, static 완화 (2 테스트) | ✅ |
| v8  | assignor | range / roundrobin / sticky 비교 (4 테스트) | ✅ |
| v9  | 오프셋 커밋 시멘틱 | auto commit → skip / 수동 전략 (2 테스트) | ✅ |
| v10 | 리플리케이션 + ISR | follower 지연 → ISR shrink / min.isr 거부 (3 테스트) | ✅ |
| v11 | unclean leader election | ISR 전멸 후 stale 승격 → HWM 되감기 (2 테스트) | ✅ |
| v12 | 컨트롤러 / 메타데이터 | leader election epoch bump (2 테스트) | ✅ |
| v13 | 리텐션 & 컴팩션 | retentionBytes, dedup by key (2 테스트) | ✅ |
| v14 | 운영 트러블 | fetch cap, 쿼터 스로틀 (2 테스트) | ✅ |
| v15 | 드문 실전 케이스 6종 | 아래 v15 섹션 참고 (11 테스트) | ✅ |

**총 테스트 51개 / 전부 PASSED.**

## v15: 드문 실전 케이스 (검증된 출처 기반)

아래 6개는 실제 KIP / JIRA / 공식 블로그로 검증된 실전 이슈를 단순화해 재현한다. 각 시나리오의 `SourceRef` 링크는 출처를 직접 확인한 공식 문서 기준이다.

### v15-1. 좀비 트랜잭션: 프로듀서 epoch 미승급으로 인한 중복 커밋

- **현상**: 트랜잭션 프로듀서가 한 번 commit 완료 후 네트워크 지연 등으로 재시도하면, 이전 트랜잭션의 메시지가 새 트랜잭션에 섞여 **예상치 못한 메시지가 커밋**된다.
- **근본 원인**: Kafka 4.0 이전 프로토콜은 commit/abort마다 producer epoch를 bump하지 않았다. 동일 PID+epoch로 들어온 좀비 write가 거부되지 않고 그대로 적재된다.
- **4.0 이후 수정**: `transaction.version=2` (서버에서 자동 활성, 4.0 이상 클라이언트 필요) — 매 commit/abort 시 epoch bump. 이전 epoch의 write는 fence.
- **미니멀 재현 계획**: v15에서 PID/epoch 개념만 도입한 후, bump-on-commit 토글 설정을 둠. 토글 off 상태에서 "지연된 send 재전송"을 주입하면 이중 append, on 상태에서는 `InvalidProducerEpochException`으로 거부됨을 테스트로 증명.
- **SourceRef**:
  - KIP-890 — [Transactions Server-Side Defense (cwiki.apache.org)](https://cwiki.apache.org/confluence/display/KAFKA/KIP-890:+Transactions+Server-Side+Defense)
  - KAFKA-14402 umbrella — mail archive [[jira] Resolved KAFKA-14402](https://www.mail-archive.com/dev@kafka.apache.org/msg145782.html)
  - Current 2024 세션 — [Fortifying Your Transactions with KIP-890](https://current.confluent.io/2024-sessions/fortifying-your-transactions-with-kip-890)

### v15-2. KRaft 좀비 컨트롤러: 네트워크 파티션 중 stale metadata 지속 응답

- **현상**: 컨트롤러 리더 브로커가 나머지 quorum과 네트워크 분리되면, 고립된 리더는 자발적으로 리더 포기를 하지 않고 **옛 epoch로 클라이언트에 오래된 메타데이터를 계속 응답**한다. 일부 파티션에 대해 어떤 클라이언트는 옛 리더, 어떤 클라이언트는 신 리더를 보게 됨.
- **근본 원인**: pull 기반 모델이라 고립된 리더에게는 자발적 step-down 트리거가 없다. Fetch heartbeat 타임아웃 없이 리더 지위를 유지함.
- **수정**: `quorum.fetch.timeout.ms` — 일정 시간 동안 quorum majority로부터 Fetch 미수신이면 신규 election 시작. 3.7.0에서 수정.
- **미니멀 재현 계획**: 단일 "controller" 스레드가 메타데이터를 배포. 네트워크 주입기로 controller와 일부 broker 간 소켓만 끊고, controller가 fetch-timeout 체크 없이 계속 응답하는 상태 → 클라이언트가 잘못된 리더로 Produce 시도 → `NOT_LEADER_OR_FOLLOWER` 루프를 관찰. 타임아웃 추가 후 해결.
- **SourceRef**:
  - JIRA [KAFKA-15489 "Stale KRaft metadata reported during network partition"](https://issues.apache.org/jira/browse/KAFKA-15489)
  - KIP-595 — [A Raft Protocol for the Metadata Quorum](https://cwiki.apache.org/confluence/display/KAFKA/KIP-595:+A+Raft+Protocol+for+the+Metadata+Quorum)

### v15-3. Stale broker epoch ISR join → 데이터 유실 (unclean shutdown 후 재기동)

- **현상**: 브로커가 unclean shutdown (page cache 미플러시 상태에서 전원 차단) 당하면 로컬 로그가 비어 있거나 뒤처진 상태로 재기동된다. 이 브로커가 과거 epoch를 들고 leader에게 Fetch를 보내 ISR에 재합류한 뒤, **비어있는 상태의 HWM이 다른 리플리카에 전파되어 실제 커밋된 데이터가 사라지는** 경로가 성립한다.
- **근본 원인**: Fetch 요청에 broker epoch를 실어 보내지 않아 leader가 stale 브로커를 거르지 못함.
- **수정**: KIP-903 — follower가 Fetch에 자신의 broker epoch를 포함, leader는 metadata cache와 일치하는 epoch일 때만 ISR 합류 허용. 3.5.0 (KRaft 한정)에서 수정.
- **미니멀 재현 계획**: v10 (리플리케이션 도입) 기반으로 follower가 "로컬 로그 비움 + 재등록 시 epoch 동일 유지"하도록 주입. leader가 ISR에 재포함 후 HWM 되감김을 테스트에서 관찰. 이어서 KIP-903식 epoch 검증 추가 시 `STALE_BROKER_EPOCH`로 거부됨을 확인.
- **SourceRef**:
  - KIP-903 — [Replicas with stale broker epoch should not be allowed to join the ISR](https://cwiki.apache.org/confluence/display/KAFKA/KIP-903:+Replicas+with+stale+broker+epoch+should+not+be+allowed+to+join+the+ISR)
  - JIRA [KAFKA-14617](https://issues.apache.org/jira/browse/KAFKA-14617)
  - 3.5.0 릴리즈 — [Apache Kafka 3.5.0 Release Announcement](https://kafka.apache.org/blog/2023/06/15/apache-kafka-3.5.0-release-announcement/)

### v15-4. 멱등 프로듀서 시퀀스 번호 리셋 갭 → 영구 `OutOfOrderSequenceException`

- **현상**: 프로듀서가 멀티 파티션에 send 중, 한 파티션에서 오류로 epoch bump가 발생한다. 해당 타이밍에 **in-flight 배치가 없던 다른 파티션의 시퀀스 번호가 리셋되지 않아**, 이후 send가 영구적으로 `OutOfOrderSequenceException`을 터뜨리고 프로듀서를 재생성해야 복구된다.
- **근본 원인**: epoch bump 처리 시 "in-flight 있는 파티션만" 시퀀스 재설정. 리더 교체 중 in-flight가 비었던 파티션은 seq가 옛 값 그대로 남음.
- **수정**: KAFKA-12152 — 모든 파티션의 시퀀스를 epoch bump와 함께 리셋.
- **미니멀 재현 계획**: v5에서 PID + 파티션별 seq 저장. 테스트는 파티션 A에 대해 강제 retry + epoch bump 유도, 그 사이 파티션 B는 유휴 유지. 이후 B로 send 시 broker가 "예상 seq=0인데 1 들어옴" 에러 반환. 패치(전 파티션 seq 리셋) 적용 후 통과.
- **SourceRef**:
  - JIRA + 패치 — [KAFKA-12152 Idempotent Producer does not reset the sequence number of partitions without in-flight batches (PR #9832)](https://github.com/apache/kafka/pull/9832)
  - librdkafka 사이드 동일 증상 — [librdkafka#3584 "out of order sequence number" fatal](https://github.com/edenhill/librdkafka/issues/3584)

### v15-5. 티어드 스토리지 cold read 레이턴시 — tail read 워크로드 방해

- **현상**: 평소 p99 fetch 2ms 이하이던 컨슈머 그룹에, 과거 데이터를 리플레이하는 컨슈머가 하나 붙자마자 **다른 컨슈머의 p99이 수십~수백 ms로 튐**. 브로커 CPU/네트워크 여유, 디스크 I/O만 치솟음.
- **근본 원인**: 리플레이 컨슈머가 원격 티어(S3/HDFS/GCS)에서 오래된 세그먼트를 페치. 첫 바이트 레이턴시가 50–500ms 단위. broker 측 원격 fetch 처리 스레드가 공용 request handler를 잡고 있으면 tail read에도 레이턴시가 튀는 경로가 존재. (KIP-405에서도 cold read는 원격 본질상 느리다고 명시.)
- **수정 방향**: 원격 fetch용 별도 스레드풀, read-ahead, 일부 배포에서 `remote.fetch.max.wait.ms` 등 분리. KIP-1176 (active segment tiering), KIP-1255 (remote read replicas) 등 후속 개선 진행 중.
- **미니멀 재현 계획**: v13 리텐션 이후 "원격 스토리지" stub 디렉터리 개념 도입. 오래된 세그먼트만 stub로 이동, fetch 시 `Thread.sleep(100)` 주입. tail consumer와 replay consumer를 동시에 돌려 전자의 p99을 측정해 튐을 보임. 이후 fetch 스레드풀 분리 패치.
- **SourceRef**:
  - KIP-405 — [Kafka Tiered Storage](https://cwiki.apache.org/confluence/display/KAFKA/KIP-405:+Kafka+Tiered+Storage) (Motivation 섹션 "remote storage has higher latency")
  - KIP-1176 — [Tiered Storage for Active Log Segment](https://cwiki.apache.org/confluence/display/KAFKA/KIP-1176:+Tiered+Storage+for+Active+Log+Segment)
  - KIP-1255 — [Remote Read Replicas for Kafka Tiered Storage](https://cwiki.apache.org/confluence/display/KAFKA/KIP-1255:+Remote+Read+Replicas+for+Kafka+Tiered+Storage)

### v15-6. Fetch session 캐시 eviction 스톰 — 컨슈머 수 증가 시 메타데이터 재전송 폭주

- **현상**: 컨슈머 수가 `max.incremental.fetch.session.cache.slots` (기본 1000)를 넘는 클러스터에서, **파티션이 많은 컨슈머일수록 incremental fetch 세션이 자주 evict되어 전체 구독 리스트를 매 fetch마다 전송**. 브로커 CPU/네트워크 폭증, 컨슈머 lag 요동.
- **근본 원인**: 세션 캐시 LRU. 슬롯 초과 시 오래된 세션 축출. 축출된 세션은 다음 fetch에서 full-metadata fetch로 회귀.
- **관련 이슈 (4.x 이후)**: `AsyncKafkaConsumer` (KIP-848 신규 컨슈머)가 레거시보다 세션을 더 자주 잃는 문제 별도 수정 중.
- **미니멀 재현 계획**: v14에서 간단한 fetch session 개념 도입, 슬롯 4개로 축소. 컨슈머 5개 동시 구동 → 한 개는 항상 full fetch를 하는 패턴을 메트릭으로 관찰. 이후 슬롯 증가 / LRU → privilege 기반 변경.
- **SourceRef**:
  - KIP-227 — [Introduce Incremental FetchRequests](https://cwiki.apache.org/confluence/display/KAFKA/KIP-227:+Introduce+Incremental+FetchRequests+to+Increase+Partition+Scalability)
  - JIRA/PR [KAFKA-17182 Consumer fetch sessions are evicted too quickly with AsyncKafkaConsumer (PR #17700)](https://github.com/apache/kafka/pull/17700)
  - 실사용 사례 — [Wikimedia Phabricator T303324 Increase max.incremental.fetch.session.cache.slots on Kafka jumbo eqiad](https://phabricator.wikimedia.org/T303324)

## 가이드 문서 포맷 (각 vN-*.md 공통)

1. 전제 — 이전 버전 대비 코드 변경 요약
2. 메인 시나리오 재현 — 정확한 명령 + 기대 출력
3. 1분 요약 — 무엇이 왜
4. 깊이 분석 — 관여 파일:라인, 실제 Kafka 대응 클래스/설정, 자주 틀리는 오진
5. 수정 방법 — 다음 버전에 반영되는 패치
6. 보너스 시나리오 — 같은 코드 상태에서 설정만 바꿔 재현
7. 운영 체크리스트 — 지표/로그/JMX
8. 자기 점검 퀴즈 3문항

## HTML 가이드 문서

`docs/html/index.html`에서 시작. 모노테마 (다크 배경, 모노스페이스 폰트).
각 버전 개별 페이지: `docs/html/v01.html` ~ `v14.html`, v15는 `v15-1.html` ~ `v15-6.html`.

## 실행 요약

```bash
./gradlew build                                # 빌드 + 전 테스트
./gradlew :scenarios:test                      # 시나리오만
./gradlew :scenarios:test --tests 'mk.scenarios.V07_*'   # 특정 버전만
./gradlew :broker:run                          # 단독 브로커
./gradlew :clients:runProducer --args="127.0.0.1 9092 demo"
./gradlew :clients:runConsumer --args="127.0.0.1 9092 demo"
```
