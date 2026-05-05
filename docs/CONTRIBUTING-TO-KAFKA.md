# Apache Kafka 컨트리뷰션 시작 가이드

> **누구를 위한 글인가**
> minimal-kafka 프로젝트로 카프카 내부 동작(멱등 프로듀서, ISR/HWM, GroupCoordinator, KRaft, Fetch session 등)을 학습 중이고, 그 다음 단계로 **실제 Apache Kafka 첫 PR**을 노리는 입문자.
>
> **확인 시점**: 2026-05. KIP 상태와 라벨 정책은 빠르게 바뀌니 인용한 위키/JIRA 페이지의 갱신일을 항상 다시 확인하라.

---

## 목차

1. [들어가며 — minimal-kafka에서 실 카프카로](#1-들어가며)
2. [공식 컨트리뷰션 프로세스](#2-공식-컨트리뷰션-프로세스)
3. [첫 컨트리뷰션 4단계 로드맵](#3-첫-컨트리뷰션-4단계-로드맵)
4. [minimal-kafka 학습 영역 → 실 카프카 컴포넌트 매핑](#4-minimal-kafka-학습-영역--실-카프카-컴포넌트-매핑)
5. [newbie JIRA 후보 (1순위)](#5-newbie-jira-후보-1순위)
6. [KIP follow-up 후보 (2순위)](#6-kip-follow-up-후보-2순위)
7. [첫 PR 실전 체크리스트](#7-첫-pr-실전-체크리스트)
8. [흔한 실수 11가지 사례 분석](#8-흔한-실수-11가지-사례-분석)
9. [최근 머지된 PR 사례 분석](#9-최근-머지된-pr-사례-분석)
10. [부록](#10-부록)

---

## 1. 들어가며

minimal-kafka는 카프카의 핵심 라이프사이클을 단일 JVM, 51개 시나리오로 압축한 학습용 미니 브로커다. 이 프로젝트로 V01~V15까지 작업했다면 이미 **실 Apache Kafka 코드베이스의 어느 디렉터리를 읽어야 할지**를 안다는 뜻이다.

문제는 그 다음이다. 실 Apache Kafka는

- 모듈 30+ 개 / 약 100만 줄 Java + Scala
- 매주 머지되는 PR 50~100건
- KIP라는 자체 RFC 프로세스
- ASF 메일링리스트 + Confluence + JIRA + GitHub의 4중 워크플로

라는 진입 장벽을 가진다. 이 가이드는 그 장벽을 **첫 PR 머지까지 4단계로 분해**해 따라가게 한다. minimal-kafka에서 다룬 컴포넌트별로 실제 카프카에서 어디를 보면 되는지(§4), 어떤 newbie JIRA를 픽업할 만한지(§5), 첫 PR이 닫히지 않으려면 무엇을 빼먹지 말아야 하는지(§7~§9)를 본인의 학습 영역과 매칭해 제시한다.

KIP는 입문자에게 진입장벽이 매우 높으므로 **이 가이드는 "newbie 라벨 JIRA 우선, KIP follow-up은 그 다음 단계"** 순으로 구성된다.

---

## 2. 공식 컨트리뷰션 프로세스

### 2.1 핵심 출처 4종

다른 페이지가 안내하는 내용은 결국 이 네 페이지의 변형이다. 한 번씩 통독하라.

- [How to Contribute (kafka.apache.org)](https://kafka.apache.org/contributing) — 시작점
- [Contributing Code Changes (Confluence wiki)](https://cwiki.apache.org/confluence/display/KAFKA/Contributing+Code+Changes) — 가장 권위 있는 워크플로 정의
- [Patch submission and review (Confluence wiki)](https://cwiki.apache.org/confluence/display/KAFKA/Patch+submission+and+review) — 리뷰 사이클 상세
- [apache/kafka CONTRIBUTING.md](https://github.com/apache/kafka/blob/trunk/CONTRIBUTING.md) — 짧은 PR 규칙

### 2.2 사전 준비

| 항목 | 필요 시점 | 비고 |
|------|----------|------|
| GitHub 계정 | 처음부터 | 본인 이름 / 이메일이 ASF JIRA와 동일하면 좋음 |
| ASF JIRA 계정 | 첫 티켓 픽업 직전 | [self-serve 포털](https://selfserve.apache.org/jira-account.html). 신청 후 [KAFKA 프로젝트](https://issues.apache.org/jira/projects/KAFKA)에서 권한 요청. 권한이 없을 경우 dev@ 메일링에 한 줄 메일 — [샘플](https://www.mail-archive.com/dev@kafka.apache.org/msg151016.html) |
| ICLA 서명 | non-trivial PR 직전 | 사소(`MINOR:`/`HOTFIX:`) 패치는 불요. KIP을 동반하는 기여는 [ASF ICLA](https://www.apache.org/licenses/contributor-agreements.html#clas) 서명 후 secretary@apache.org 제출. 회사 코드라면 CCLA 추가 |
| `apache/kafka` 포크 | 빌드 직전 | trunk 브랜치 기준으로 작업 |
| `dev@kafka.apache.org` 구독 | 첫 KIP 토론 시점 | [메일링 리스트 안내](https://kafka.apache.org/contact). 가입 즉시 24시간 트래픽 체감 |
| ASF Slack `#kafka` | 선택 | 빠른 질문용. 공식 결정은 메일링에서만 유효 |

### 2.3 빌드와 테스트

JDK 17 권장(CI는 11/17/21을 모두 돌림). 작업 디렉터리에서:

```bash
# 한 방에 전체 검증 — 첫 PR 직전에 반드시 돌릴 것
./gradlew check

# 부분 실행 (반복 사이클이 빠름)
./gradlew test
./gradlew unitTest
./gradlew integrationTest

# 모듈 한정
./gradlew :core:test --tests "kafka.log.LogTest"
./gradlew :clients:test --tests "*ProducerTest"

# 스타일 검증 (실패하면 PR이 즉시 빨간불)
./gradlew checkstyleMain checkstyleTest
./gradlew spotlessCheck
./gradlew spotlessApply   # 자동 수정
```

> **Tip**. 빌드만 30~60분 걸린다. 첫 PR을 올리기 직전에는 `./gradlew check`을 백그라운드로 돌려놓고 그동안 PR 본문을 작성하라.

### 2.4 패치 워크플로

```
1. JIRA 검색 → 픽업 → 본인에게 assign (assignee 비어있는지 확인)
2. trunk 최신화 → 새 브랜치 (네이밍 자유, 보통 KAFKA-xxxxx)
3. 코드 작성 + 단위 테스트 + 필요 시 통합 테스트
4. ./gradlew check 통과 확인
5. PR 제목 = "KAFKA-xxxxx: <제목>"  또는 사소하면 "MINOR: ..."
6. PR 본문에 JIRA 링크, 변경 요약, 테스트 방법 명시
7. 리뷰 → 추가 커밋(amend/force-push 금지) → 리뷰어가 머지 직전 squash 요청
8. 머지 후 JIRA 상태 자동 업데이트 (커밋 메시지에 KAFKA-xxxxx 인식)
```

`MINOR:` 또는 `HOTFIX:` 접두사는 trivial 변경(오타, 주석, 한 줄 의존성 bump)에만 허용. 리뷰어가 "JIRA를 만들어 달라"고 요청하면 그쪽이 옳다.

### 2.5 KIP 프로세스 개관

KIP(Kafka Improvement Proposal)는 카프카의 RFC 시스템이다. 다음 변경에 **반드시** 필요하다.

- public API / wire protocol / 설정(config) / 메트릭 / CLI 변경
- 동작이 사용자 관찰 가능하게 바뀌는 모든 변경
- 위험이 큰 내부 리팩터링

라이프사이클: `Draft → Under Discussion → Voting → Accepted → Implemented`.

- **DISCUSS**: dev@ 메일링에 `[DISCUSS] KIP-xxxx <제목>` 제목으로 위키 링크 첨부
- **VOTE**: `[VOTE] KIP-xxxx ...` — **lazy majority** (binding +1 ≥ 3 그리고 -1보다 많음, 최소 72시간 개방). binding 표는 PMC 멤버만 가능
- **구현**: Accepted 후 JIRA epic + sub-task로 쪼개 PR

원문: [Kafka Improvement Proposals](https://cwiki.apache.org/confluence/display/KAFKA/Kafka+Improvement+Proposals), [Bylaws](https://cwiki.apache.org/confluence/display/KAFKA/Bylaws), [KIP-996: Pre-Vote](https://cwiki.apache.org/confluence/display/KAFKA/KIP-996:+Pre-Vote).

> **입문자 주의**. 첫 컨트리뷰션부터 KIP을 쓰지 마라. 기존 KIP의 sub-task 또는 newbie JIRA로 워크플로를 익힌 뒤에 본인 KIP을 시도하라.

---

## 3. 첫 컨트리뷰션 4단계 로드맵

| 단계 | 목표 | 예상 기간 | 대표 활동 |
|------|------|----------|----------|
| **0** | PR 워크플로 한 번 통과 | 1~2주 | 문서 PR, 오타 수정, `MINOR:` 패치 |
| **1** | newbie 라벨 JIRA 1건 머지 | 2~6주 | 테스트 추가, 작은 버그 픽스 |
| **2** | 본인 학습 영역의 KIP follow-up | 1~3개월 | sub-task PR, 메트릭 추가 |
| **3** | 본인 KIP 작성 | 6개월~1년 | DISCUSS → VOTE → 구현 |

### 3.1 단계 0 — 문서 PR로 워크플로 통과

목표는 **빌드 / PR / 리뷰 / 머지 사이클을 한 번 끝까지 가본다**는 것뿐이다. 코드 변경이 작을수록 좋다.

후보:

- `docs/` 마크다운 오타, 깨진 링크
- `README.md`, `CONTRIBUTING.md` 갱신
- JavaDoc 주석 보강
- 깨진 예제 코드 한 줄 수정

PR 제목: `MINOR: Fix typo in operations.html`. ICLA 불요. JIRA도 보통 불요. 리뷰 라운드 1~2회로 끝남.

### 3.2 단계 1 — newbie JIRA 픽업

`newbie`/`newbie++` 라벨은 위키가 명시적으로 입문자에게 권장하는 레이블이다. §5에 영역별 JQL 검색 링크가 있다.

선택 기준:

- assignee가 비어 있을 것 (또는 6개월 이상 비활동)
- 최근 코멘트에 "blocked by KIP-xxxx" 표시가 없을 것
- 변경 라인 수 예상 100~300 LOC
- 본인이 minimal-kafka에서 다뤄본 컴포넌트와 매칭

### 3.3 단계 2 — 학습 영역의 KIP follow-up

이미 Accepted된 KIP의 sub-task는 "설계 토론은 끝났고 구현·테스트·문서가 필요하다"는 뜻이다. 입문자가 안전하게 합류할 수 있는 황금 구간. §6 표 참고.

### 3.4 단계 3 — 본인 KIP 작성

여기서부터는 이 가이드의 범위 밖이다. 다만 단계 0~2를 거치며 만난 한계점에서 KIP가 자연스럽게 도출되는 경우가 많다. minimal-kafka의 V15 시나리오들이 모두 누군가의 KIP에서 출발했음을 떠올리라.

---

## 4. minimal-kafka 학습 영역 → 실 카프카 컴포넌트 매핑

minimal-kafka에서 어디까지 깊이 들어갔는지에 따라 실 카프카에서 진입하기 쉬운 코드 위치가 다르다.

### 4.1 멱등성 / 트랜잭션 (V05, V15-1, V15-4)

**minimal-kafka**: `broker/src/main/java/mk/broker/producer/ProducerStateManager.java`, `TransactionalProducer.java`

**실 Kafka 대응**:
- `clients/src/main/java/org/apache/kafka/clients/producer/internals/TransactionManager.java`
- `core/src/main/scala/kafka/log/ProducerStateManager.scala`
- `transaction-coordinator/` 모듈

**관련 KIP**: [KIP-98 EOS](https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging), [KIP-890 Tx server-side defense](https://cwiki.apache.org/confluence/display/KAFKA/KIP-890:+Transactions+Server-Side+Defense), JIRA [KAFKA-12152](https://issues.apache.org/jira/browse/KAFKA-12152).

**newbie JIRA JQL**:
```
project = KAFKA AND labels in (newbie, "newbie++") AND text ~ "transaction OR idempotent OR producer-state" AND resolution = Unresolved
```

### 4.2 ISR / HWM / 복제 (V10, V11, V15-3)

**minimal-kafka**: `broker/src/main/java/mk/broker/replication/ReplicaManager.java`

**실 Kafka 대응**:
- `core/src/main/scala/kafka/server/ReplicaManager.scala`
- `core/src/main/scala/kafka/cluster/Partition.scala`
- `core/src/main/scala/kafka/server/HighWatermarkCheckpoint.scala`

**관련 KIP**: [KIP-101 Leader Epoch](https://cwiki.apache.org/confluence/display/KAFKA/KIP-101+-+Alter+Replication+Protocol+to+use+Leader+Epoch+rather+than+High+Watermark+for+Truncation), [KIP-903 Stale broker epoch](https://cwiki.apache.org/confluence/display/KAFKA/KIP-903:+Replicas+with+stale+broker+epoch+should+not+be+allowed+to+join+the+ISR), [KIP-966 ELR](https://cwiki.apache.org/confluence/display/KAFKA/KIP-966:+Eligible+Leader+Replicas).

**newbie JIRA JQL**:
```
project = KAFKA AND labels in (newbie, "newbie++") AND component in ("core", "replication") AND text ~ "ISR OR HWM OR replica" AND resolution = Unresolved
```

### 4.3 컨슈머 그룹 / 코디네이션 (V06, V07, V08, V09)

**minimal-kafka**: `broker/src/main/java/mk/broker/coordinator/GroupCoordinator.java`, `clients/.../GroupConsumer.java`, `Assignors.java`

**실 Kafka 대응**:
- `group-coordinator/src/main/java/org/apache/kafka/coordinator/group/GroupCoordinatorService.java`
- `clients/src/main/java/org/apache/kafka/clients/consumer/internals/ConsumerCoordinator.java`
- `clients/src/main/java/org/apache/kafka/clients/consumer/RangeAssignor.java` 등

**관련 KIP**: [KIP-71 Static Membership](https://cwiki.apache.org/confluence/display/KAFKA/KIP-71%3A+Enable+log+compaction+by+default), [KIP-848 Next-gen Consumer Rebalance](https://cwiki.apache.org/confluence/x/HhD1D), [KIP-1071 Streams Rebalance Protocol](https://cwiki.apache.org/confluence/display/KAFKA/KIP-1071:+Streams+Rebalance+Protocol).

**newbie JIRA JQL**:
```
project = KAFKA AND labels in (newbie, "newbie++") AND text ~ "consumer group OR rebalance OR assignor" AND resolution = Unresolved
```

### 4.4 KRaft / 컨트롤러 (V12, V15-2)

**minimal-kafka**: `broker/src/main/java/mk/broker/controller/Controller.java`

**실 Kafka 대응**:
- `metadata/src/main/java/org/apache/kafka/controller/QuorumController.java`
- `raft/src/main/java/org/apache/kafka/raft/KafkaRaftClient.java`
- `metadata/src/main/java/org/apache/kafka/metadata/`

**관련 KIP**: [KIP-595 Raft for Metadata Quorum](https://cwiki.apache.org/confluence/display/KAFKA/KIP-595:+A+Raft+Protocol+for+the+Metadata+Quorum), JIRA [KAFKA-15489 (controller fetch timeout)](https://issues.apache.org/jira/browse/KAFKA-15489).

**newbie JIRA JQL**:
```
project = KAFKA AND labels in (newbie, "newbie++") AND component in ("kraft", "controller", "metadata") AND resolution = Unresolved
```

### 4.5 Fetch session / 성능 (V15-6)

**minimal-kafka**: `broker/src/main/java/mk/broker/fetchsession/FetchSessionCache.java`

**실 Kafka 대응**:
- `core/src/main/scala/kafka/server/FetchSession.scala`
- `core/src/main/scala/kafka/server/FetchSessionCache.scala`

**관련 KIP**: [KIP-227 Incremental FetchRequests](https://cwiki.apache.org/confluence/display/KAFKA/KIP-227:+Introduce+Incremental+FetchRequests+to+Increase+Partition+Scalability), JIRA [KAFKA-17182](https://issues.apache.org/jira/browse/KAFKA-17182).

**newbie JIRA JQL**:
```
project = KAFKA AND labels in (newbie, "newbie++") AND text ~ "fetch session OR fetch cache" AND resolution = Unresolved
```

---

## 5. newbie JIRA 후보 (1순위)

### 5.1 검색 시작점

먼저 다음 두 링크를 북마크하라.

- **모든 열린 newbie / newbie++ 이슈**: [JQL 검색](https://issues.apache.org/jira/issues/?jql=project%20%3D%20KAFKA%20AND%20labels%20in%20(newbie%2C%20%22newbie%2B%2B%22)%20AND%20resolution%20%3D%20Unresolved%20ORDER%20BY%20updated%20DESC)
- **확장 라벨 셋(beginner / good-first-issue 포함)**: [JQL 검색](https://issues.apache.org/jira/issues/?jql=project%20%3D%20KAFKA%20AND%20labels%20in%20(newbie%2C%20%22newbie%2B%2B%22%2C%20%22good-first-issue%22%2C%20beginner)%20AND%20statusCategory%20!%3D%20Done)

영역별 좁히기는 위 URL 끝에 `AND component in ("core","streams","kraft")` 같은 절을 추가하면 된다. §4.1~4.5의 JQL 쿼리를 그대로 복사해 사용하면 된다.

### 5.2 픽업 전 점검 5가지

| # | 점검 항목 | 왜 |
|---|----------|----|
| 1 | assignee가 비어있는가? | 이미 누가 작업 중이면 충돌 |
| 2 | 마지막 활동이 6개월 이내인가? | 너무 오래된 티켓은 코드가 변해 무효일 수 있음 |
| 3 | 코멘트에 "blocked by KIP-xxxx" 또는 "needs design" 표시가 없는가? | 입문자에게는 설계 부담이 큼 |
| 4 | description이 충분히 구체적인가? | "make X better" 류 모호한 티켓은 피하기 |
| 5 | linked PR이 이미 머지됐거나 진행 중인가? | 중복 작업 회피 |

### 5.3 픽업 절차

1. JIRA에서 본인에게 assign (권한 없으면 코멘트로 "May I take this?" 후 권한 요청 메일)
2. 티켓에 한 줄 코멘트로 "Working on this; will open a PR by <날짜>"
3. 2주 이상 진행 못 할 것 같으면 미리 unassign — 다른 사람을 막지 않기

---

## 6. KIP follow-up 후보 (2순위)

minimal-kafka의 학습 영역과 직결되는 진행 중/follow-up 가능 KIP들. **단계 1을 통과한 뒤** 도전하라.

| KIP | 상태 | minimal-kafka 연결 | 입문자 진입 방식 |
|-----|------|-------------------|-----------------|
| [KIP-890 Tx Server-Side Defense](https://cwiki.apache.org/confluence/display/KAFKA/KIP-890:+Transactions+Server-Side+Defense) | v2 GA(4.0), follow-up 진행 | V05, V15-1, V15-4 — 멱등/트랜잭션 epoch bump | sub-task PR로 테스트 추가, JavaDoc 보강 |
| [KIP-903 Stale broker epoch ISR](https://cwiki.apache.org/confluence/display/KAFKA/KIP-903:+Replicas+with+stale+broker+epoch+should+not+be+allowed+to+join+the+ISR) | Implemented(3.7) | V15-3 — broker epoch 검증 | 코드 정착 단계라 안전하게 테스트/문서 미세 보강 |
| [KIP-966 ELR (part 2)](https://cwiki.apache.org/confluence/display/KAFKA/KIP-966:+Eligible+Leader+Replicas) | part1 4.0 GA, part2 진행 | V10, V11 — ISR/HWM | part2 sub-task 다수, 메트릭/문서 영역이 진입 쉬움 |
| [KIP-1303 Tiered Storage Followers Leader Election Deprioritize](https://cwiki.apache.org/confluence/display/KAFKA/KIP-1303:+Deprioritize+Tiered+Storage+Followers+In+Leader+Election) | Discussion | V11 + V15-5 (티어드 + ISR 교차) | DISCUSS 단계라 댓글로 의견 보태기부터 |
| [KIP-1176 Tiered Storage for Active Log Segment](https://cwiki.apache.org/confluence/display/KAFKA/KIP-1176:+Tiered+Storage+for+Active+Log+Segment) | Discussion | V15-5 | 페이지 캐시/리플리케이션 깊이 학습용 |
| [KIP-1267 Tiered Storage Cost Metrics](https://cwiki.apache.org/confluence/display/KAFKA/KIP-1267:+Tiered+Storage+Cost+Attribution+Metrics) | Discussion/Voting | V13/V15-5 | 메트릭 추가는 입문자 안전 영역 |
| [KIP-848 Next-gen Consumer Rebalance](https://cwiki.apache.org/confluence/x/HhD1D) | GA in 4.0 | V07, V08 — 그룹 코디네이션 | broker-side assignor sub-task 풍부 |
| [KIP-1071 Streams Rebalance Protocol](https://cwiki.apache.org/confluence/display/KAFKA/KIP-1071:+Streams+Rebalance+Protocol) | Accepted, 4.2 EA | V07, V08 패턴의 Streams 버전 | 테스트/문서 follow-up 풍부 |
| [KIP-1150 Diskless Topics](https://cwiki.apache.org/confluence/display/KAFKA/KIP-1150:+Diskless+Topics) | Accepted 2026-03 | V13 (리텐션) + V15-5 (티어드) | 새 아키텍처 sub-task 다수 — [Aiven 해설](https://aiven.io/blog/kip-1150-accepted-and-the-road-ahead) |

> **2025–2026 트렌드 (출처: [Red Hat Kafka Monthly Digest Jan 2026](https://developers.redhat.com/blog/2026/02/02/kafka-monthly-digest-january-2026), [Mar 2026](https://developers.redhat.com/blog/2026/04/03/kafka-monthly-digest-march-2026), [4.2.0 Release](https://kafka.apache.org/blog/2026/02/17/apache-kafka-4.2.0-release-announcement/))**: KRaft 마이그레이션 후속(4.0에서 ZK 제거), Tiered Storage GA(KIP-405) 후 메트릭/플러그인 PR 多, Diskless Topics(KIP-1150) sub-task 풍부, Streams Rebalance Protocol(KIP-1071) 테스트/문서 갭 큼, Queues/Share Groups(KIP-932) 신규 영역.

---

## 7. 첫 PR 실전 체크리스트

PR을 올리기 직전, 다음 13개를 모두 확인했는지 점검하라.

```
[ ]  1. JIRA 티켓이 본인에게 assigned 상태이다
[ ]  2. 브랜치가 trunk에서 분기되었고 최신화되어 있다
[ ]  3. PR 제목이 "KAFKA-xxxxx: <제목>" 또는 "MINOR: <제목>" 형식이다
[ ]  4. PR 본문에 JIRA 링크와 변경 요약, 테스트 방법이 있다
[ ]  5. ./gradlew check 가 로컬에서 통과한다
[ ]  6. ./gradlew checkstyleMain checkstyleTest spotlessCheck 통과
[ ]  7. 단위 테스트가 추가되었다 (non-trivial 변경의 경우 필수)
[ ]  8. 통합 테스트 영향이 있다면 ./gradlew integrationTest 실행했다
[ ]  9. 문서 변경 동반: 설정/메트릭/CLI 변경 시 docs/ 갱신
[ ] 10. 커밋이 논리 단위로 분리되어 있다 (리뷰 시 amend/force-push 안 함)
[ ] 11. 변경 라인 수 100~500 LOC (첫 PR이라면 100~300 권장)
[ ] 12. 무관한 변경(리네임, 포맷, 타 모듈)이 섞이지 않았다
[ ] 13. JavaDoc / 주석이 영어로 명료하게 추가되었다
```

### 리뷰 사이클 운영

- 리뷰어가 코멘트 → **새 커밋**으로 반영 (amend 금지)
- 머지 전 리뷰어가 squash 요청하면 그때 squash
- 1~2주 응답 없으면 PR 본문에 `@reviewer` 멘션 한 번 (그 이상은 자제)
- 리뷰어가 정해지지 않으면 dev@ 메일링에 한 줄 — "Looking for a reviewer on https://github.com/apache/kafka/pull/NNNNN"

---

## 8. 흔한 실수 11가지 사례 분석

리뷰어 관점에서 가장 자주 닫히는 PR 패턴. 출처: [Contributing Code Changes](https://cwiki.apache.org/confluence/display/KAFKA/Contributing+Code+Changes), [Code Reviews](https://cwiki.apache.org/confluence/display/KAFKA/Code+Reviews), [Patch submission and review](https://cwiki.apache.org/confluence/display/KAFKA/Patch+submission+and+review).

| # | 패턴 | 왜 닫히나 | 회피법 |
|---|------|----------|-------|
| 1 | KIP 없이 public API/config/protocol 변경 | 사용자 노출 변경은 KIP 필요 | wire format / config / metric / CLI 변경 여부 자가 점검. 의심되면 dev@에 사전 질문 |
| 2 | 거대한 PR (500+ LOC) | 리뷰 부담 | sub-task로 쪼개기. 첫 PR은 100~300 LOC |
| 3 | amend / force-push | 리뷰어가 diff 추적 불가 | 새 커밋으로 추가, 머지 직전에만 squash |
| 4 | 단위 테스트 없음 | non-trivial은 테스트 필수 | 변경 직접 커버하는 단위 테스트 1개 이상 |
| 5 | checkstyle / spotless 미통과 | CI 빨간불 | `./gradlew check` 사전 실행 |
| 6 | PR 제목 형식 위반 | 자동화 도구가 JIRA 인식 못 함 | `KAFKA-xxxxx:` 또는 `MINOR:` 접두 |
| 7 | 문서 미동반 | 사용자가 변경을 모름 | config/metric/CLI 변경 시 `docs/` 갱신 |
| 8 | DISCUSS 스킵하고 큰 PR 먼저 | 합의 없이 시작 | 큰 변경은 dev@에 DISCUSS 메일 먼저 |
| 9 | 리뷰어 멘션 누락 | 1~2주 방치 | 반영 후 `@reviewer` 코멘트 |
| 10 | 무관한 변경 묶기 | 리뷰 어려움 | 원자성 유지, 리네임/포맷은 별도 PR |
| 11 | 위키 댓글로 KIP 토론 | 공식 토론은 메일링 | dev@ 메일링리스트에서만 토론 |

---

## 9. 최근 머지된 PR 사례 분석

실제로 통과한 PR 3건을 따라 읽으면서 "이 정도면 머지된다"는 감각을 형성하라.

### 9.1 KAFKA-19576: Fix typo in state-change log filename after rotate (PR #20269)

- **링크**: [github.com/apache/kafka/pull/20269](https://github.com/apache/kafka/pull/20269)
- **유형**: 한 줄 버그 픽스 (오타로 인해 잘못된 파일명 생성)
- **컨트리뷰터**: 외부 (jaredharley)
- **머지일**: 2025-08
- **배운 점**:
  - 한 줄 변경에도 JIRA 티켓이 있으면 `KAFKA-xxxxx:` 접두 사용
  - 작은 PR은 빠르게 머지된다 — 첫 PR로 이상적인 형태

### 9.2 KAFKA-17931: Revise specifying-test-retries section in README (PR #17679)

- **링크**: [github.com/apache/kafka/pull/17679](https://github.com/apache/kafka/pull/17679)
- **유형**: 문서 개선 (README 섹션 보강)
- **컨트리뷰터**: 외부 (tedyyan)
- **배운 점**:
  - 문서 PR도 KAFKA JIRA로 트래킹된다
  - 코드 손대지 않는 첫 PR로 단계 0에 가장 적합한 형태

### 9.3 KAFKA-19951: Update lz4 dependency for CVE-2025-12183 & CVE-2025-66566 (PR #21035)

- **링크**: [github.com/apache/kafka/pull/21035](https://github.com/apache/kafka/pull/21035)
- **유형**: 의존성 한 줄 bump (CVE 대응)
- **컨트리뷰터**: 외부 (erikanderson)
- **배운 점**:
  - CVE 대응 같은 명확한 사유가 있으면 의존성 bump도 환영됨
  - PR 본문에 CVE ID와 영향 범위 명시가 필수

### 패턴 종합

세 PR 공통점:
- 변경 라인 수 < 50
- PR 제목에 JIRA 또는 MINOR 접두
- 본문에 "왜 필요한가" 한두 문단
- 리뷰 라운드 1~2회

**입문자에게 주는 교훈**: 첫 PR은 작고 명확하게. "기여한 적 없는 사람이 이 PR로 워크플로를 익혔다"는 흔적이면 충분하다.

---

## 10. 부록

### A. 자주 쓰는 JQL 쿼리 모음

브라우저 북마크용. 모두 `https://issues.apache.org/jira/issues/?jql=` 뒤에 붙여쓰면 된다.

```sql
-- 1) 모든 newbie 미해결
project = KAFKA AND labels in (newbie, "newbie++") AND resolution = Unresolved ORDER BY updated DESC

-- 2) 코어 + newbie
project = KAFKA AND labels in (newbie, "newbie++") AND component = "core" AND resolution = Unresolved

-- 3) Streams + newbie
project = KAFKA AND labels in (newbie, "newbie++") AND component = "streams" AND resolution = Unresolved

-- 4) KRaft + newbie
project = KAFKA AND labels in (newbie, "newbie++") AND component in ("kraft", "controller", "metadata") AND resolution = Unresolved

-- 5) 트랜잭션/멱등성 영역
project = KAFKA AND labels in (newbie, "newbie++") AND text ~ "transaction OR idempotent OR producer-state" AND resolution = Unresolved

-- 6) 최근 30일 신규 newbie 티켓
project = KAFKA AND labels in (newbie, "newbie++") AND created > -30d AND resolution = Unresolved

-- 7) 좋은 첫 이슈 (확장 라벨 셋)
project = KAFKA AND labels in (newbie, "newbie++", "good-first-issue", beginner) AND statusCategory != Done
```

### B. dev@ 메일 템플릿

**B.1 JIRA 권한 요청**

```
Subject: Request JIRA contributor permission for KAFKA project

Hi,

I'd like to start contributing to Apache Kafka. Could someone please grant
me Contributor permission so I can self-assign JIRA tickets?

JIRA username: <your-jira-username>
Target tickets: <KAFKA-xxxxx, KAFKA-yyyyy>

Thanks!
<your name>
```

**B.2 KIP DISCUSS 시작**

```
Subject: [DISCUSS] KIP-xxxx: <Title>

Hi all,

I'd like to start a discussion on KIP-xxxx:
<wiki link>

Summary:
- Problem: <one paragraph>
- Proposal: <one paragraph>
- Compatibility: <one paragraph>

Looking forward to feedback.
<your name>
```

### C. 한국어 권장 용어집

| 영어 | 한국어 권장 표기 | 비고 |
|------|----------------|------|
| binding vote | 바인딩 표 | PMC 멤버 표만 카운트 |
| lazy majority | lazy majority | 영어 그대로. "느린 다수결" 의역은 혼동 |
| ICLA / CCLA | ICLA / CCLA | 영어 그대로 |
| JIRA epic / sub-task | JIRA 에픽 / 서브태스크 | |
| trunk | trunk | "본 가지" 의역 비추 |
| cherry-pick | 체리픽 | |
| force-push | 포스 푸시 | 권장하지 않음 |
| squash | 스쿼시 (커밋 합치기) | |

### D. 모든 출처 URL

**공식**
- https://kafka.apache.org/contributing
- https://cwiki.apache.org/confluence/display/KAFKA/Contributing+Code+Changes
- https://cwiki.apache.org/confluence/display/KAFKA/Patch+submission+and+review
- https://cwiki.apache.org/confluence/display/KAFKA/Code+Reviews
- https://cwiki.apache.org/confluence/display/KAFKA/Bylaws
- https://cwiki.apache.org/confluence/display/KAFKA/Kafka+Improvement+Proposals
- https://cwiki.apache.org/confluence/display/KAFKA/Merging+Github+Pull+Requests
- https://github.com/apache/kafka/blob/trunk/CONTRIBUTING.md
- https://www.apache.org/licenses/contributor-agreements.html#clas
- https://selfserve.apache.org/jira-account.html
- https://issues.apache.org/jira/projects/KAFKA
- https://kafka.apache.org/contact

**KIP (본문 인용)**
- https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging
- https://cwiki.apache.org/confluence/display/KAFKA/KIP-101+-+Alter+Replication+Protocol+to+use+Leader+Epoch+rather+than+High+Watermark+for+Truncation
- https://cwiki.apache.org/confluence/display/KAFKA/KIP-227:+Introduce+Incremental+FetchRequests+to+Increase+Partition+Scalability
- https://cwiki.apache.org/confluence/display/KAFKA/KIP-405:+Kafka+Tiered+Storage
- https://cwiki.apache.org/confluence/display/KAFKA/KIP-595:+A+Raft+Protocol+for+the+Metadata+Quorum
- https://cwiki.apache.org/confluence/x/HhD1D
- https://cwiki.apache.org/confluence/display/KAFKA/KIP-890:+Transactions+Server-Side+Defense
- https://cwiki.apache.org/confluence/display/KAFKA/KIP-903:+Replicas+with+stale+broker+epoch+should+not+be+allowed+to+join+the+ISR
- https://cwiki.apache.org/confluence/display/KAFKA/KIP-966:+Eligible+Leader+Replicas
- https://cwiki.apache.org/confluence/display/KAFKA/KIP-996:+Pre-Vote
- https://cwiki.apache.org/confluence/display/KAFKA/KIP-1071:+Streams+Rebalance+Protocol
- https://cwiki.apache.org/confluence/display/KAFKA/KIP-1150:+Diskless+Topics
- https://cwiki.apache.org/confluence/display/KAFKA/KIP-1176:+Tiered+Storage+for+Active+Log+Segment
- https://cwiki.apache.org/confluence/display/KAFKA/KIP-1267:+Tiered+Storage+Cost+Attribution+Metrics
- https://cwiki.apache.org/confluence/display/KAFKA/KIP-1303:+Deprioritize+Tiered+Storage+Followers+In+Leader+Election

**JIRA (본문 인용)**
- https://issues.apache.org/jira/browse/KAFKA-12152
- https://issues.apache.org/jira/browse/KAFKA-14617
- https://issues.apache.org/jira/browse/KAFKA-15489
- https://issues.apache.org/jira/browse/KAFKA-17182

**사례 PR**
- https://github.com/apache/kafka/pull/20269
- https://github.com/apache/kafka/pull/17679
- https://github.com/apache/kafka/pull/21035

**트렌드**
- https://developers.redhat.com/blog/2026/02/02/kafka-monthly-digest-january-2026
- https://developers.redhat.com/blog/2026/04/03/kafka-monthly-digest-march-2026
- https://kafka.apache.org/blog/2026/02/17/apache-kafka-4.2.0-release-announcement/
- https://aiven.io/blog/kip-1150-accepted-and-the-road-ahead

---

## 마지막 한마디

첫 PR은 **머지되는 것보다 워크플로를 한 번 통과하는 것**이 목적이다. 오타 한 글자, 깨진 링크 한 줄로 시작해 ASF 메일링 / JIRA / GitHub의 4중 워크플로를 몸에 익혀라. minimal-kafka에서 V05 코드를 읽었던 그 시간이 실 카프카의 `TransactionManager.java`에서 그대로 작동하는 순간이 온다. 그때까지 작게, 자주, 끈기 있게.
