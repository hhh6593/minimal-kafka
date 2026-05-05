# MSK 2-Broker 운영 주의사항 + 최신 KIP 트렌드 (2026-05 기준)

> **임시 문서.** 다운로드 후 삭제 예정 브랜치(`tmp/msk-2broker-and-latest-kips-2026-05`)에 보관.
> minimal-kafka의 학습 시나리오로 검증한 내부 동작과, 실 운영(특히 AWS MSK 2-broker + 아웃박스 패턴) 사이의 간극을 메우기 위한 메모.

---

## 목차

1. [MSK 2-broker 클러스터 운영 주의사항](#1-msk-2-broker-클러스터-운영-주의사항)
   - 1.1 [근본 한계 — RF=2가 상한](#11-근본-한계--rf2가-상한)
   - 1.2 [min.insync.replicas 트레이드오프](#12-mininsyncreplicas-트레이드오프)
   - 1.3 [Internal 토픽 RF 트랩](#13-internal-토픽-rf-트랩-__consumer_offsets-__transaction_state)
   - 1.4 [아웃박스 패턴 권장 구성](#14-아웃박스-패턴-권장-구성)
   - 1.5 [2-broker 환경에서 EOS는 비추천](#15-2-broker-환경에서-eos는-비추천)
   - 1.6 [3-broker 증설 트리거](#16-3-broker-증설-트리거)
   - 1.7 [관측 — 무엇을 보아야 하는가](#17-관측--무엇을-보아야-하는가)
2. [최신 KIP 트렌드 (4.0 GA 이후)](#2-최신-kip-트렌드-40-ga-이후)
   - 2.1 [KIP-848 Next-Gen Consumer Rebalance](#21-kip-848-next-gen-consumer-rebalance-protocol)
   - 2.2 [KIP-890 Transactions Server-Side Defense](#22-kip-890-transactions-server-side-defense)
   - 2.3 [KIP-966 Eligible Leader Replicas](#23-kip-966-eligible-leader-replicas)
   - 2.4 [KIP-932 Queues / Share Groups](#24-kip-932-queues--share-groups)
   - 2.5 [KIP-1150 Diskless Topics](#25-kip-1150-diskless-topics)
   - 2.6 [KIP-1071 Streams Rebalance Protocol](#26-kip-1071-streams-rebalance-protocol)
3. [도입 우선순위 매트릭스](#3-도입-우선순위-매트릭스)
4. [참고 링크](#4-참고-링크)

---

## 1. MSK 2-broker 클러스터 운영 주의사항

AWS MSK의 가장 작은 production 구성은 보통 2-broker(2-AZ). 비용 절감 목적이지만 Apache Kafka의 복제 모델과 정합성 측면에서 **본질적 한계**가 여러 개 있다. 아래는 minimal-kafka V07~V12 시나리오에서 재현 가능한 트랩들을 운영 관점으로 재정리한 것.

### 1.1 근본 한계 — RF=2가 상한

브로커가 2대뿐이면 RF=3이 불가능하다. 자동으로 강제되지 않고, 토픽 생성 명령은 `InvalidReplicationFactorException`으로 거부된다. 따라서 _모든 토픽_은 RF=2 또는 RF=1.

| RF | 의미 | 적용 |
|----|------|------|
| RF=1 | 복제 없음 — broker 1대만 죽어도 partition offline | 절대 비추천 (production) |
| RF=2 | broker 1대 살아있으면 데이터 살아남음 | 표준. 단, ISR/min.isr 설정에 민감 |

### 1.2 min.insync.replicas 트레이드오프

2-broker + RF=2에서 `min.insync.replicas` 선택은 **가용성 vs 내구성**의 직접 트레이드오프다. 중간이 없다.

| min.isr | 1 broker 장애 시 | 데이터 유실 가능성 |
|---------|------------------|--------------------|
| 2 | `NotEnoughReplicasException` 즉시 produce 전면 블록 | 0 (단, 가용성 0) |
| 1 | leader 살아있으면 produce 성공 | 복제 전 leader 장애 시 일부 유실 가능 |

**아웃박스 패턴은 가용성 우선이 합리적이다.** Kafka가 잠시 부재해도 DB의 outbox 테이블이 안전망 역할을 하기 때문에, `min.isr=2`로 produce를 막아 DB 적체를 만드는 것보다 `min.isr=1`로 가용성을 확보하는 편이 전체 SLA에 유리하다.

```bash
# 권장 — 아웃박스 토픽
kafka-configs.sh --bootstrap-server msk:9092 \
  --entity-type topics --entity-name outbox.payments --alter \
  --add-config min.insync.replicas=1
```

### 1.3 Internal 토픽 RF 트랩 (`__consumer_offsets`, `__transaction_state`)

MSK 클러스터를 처음 만들면 broker default가 `offsets.topic.replication.factor=3` / `transaction.state.log.replication.factor=3`인 경우가 많다. broker가 2대인데 RF가 3이면:

- 일부 MSK 버전: 자동으로 `min(broker_count, default_RF)` = 2로 떨어뜨려 생성 (silent ok).
- 다른 MSK 버전: RF=1로 생성 (silent durability loss) — broker 1대 다운 시 컨슈머 그룹 또는 트랜잭션 코디네이터 정지.

**클러스터 생성 직후 가장 먼저 확인해야 할 것:**

```bash
kafka-topics.sh --bootstrap-server msk:9092 --describe --topic __consumer_offsets | head -1
kafka-topics.sh --bootstrap-server msk:9092 --describe --topic __transaction_state | head -1
# ReplicationFactor가 broker 수와 일치하는지 확인
```

Terraform으로 명시:

```hcl
resource "aws_msk_configuration" "two_broker" {
  name = "two-broker-safe"
  server_properties = <<EOF
offsets.topic.replication.factor=2
transaction.state.log.replication.factor=2
transaction.state.log.min.isr=1
min.insync.replicas=1
default.replication.factor=2
EOF
}
```

### 1.4 아웃박스 패턴 권장 구성

Debezium + Kafka producer 조합의 2-broker 안전 셋:

```properties
# Topic configs
replication.factor=2
min.insync.replicas=1
retention.ms=604800000              # 7d (DB outbox는 24h 이상 보존)

# Producer configs
acks=all
enable.idempotence=true
delivery.timeout.ms=600000          # 10m — 짧은 AZ 장애 흡수
linger.ms=20                        # 회복 후 batch catch-up
max.in.flight.requests.per.connection=5

# Debezium connect configs
errors.retry.timeout=600000
errors.retry.delay.max.ms=10000
retriable.restart.connector.wait.ms=10000
```

**주요 포인트:**
- `acks=all` + `min.isr=1` 조합은 "ISR 멤버 모두에게 ack"를 의미. ISR이 1로 줄면 leader-only ack로 동작. 데이터 유실 윈도우는 leader가 follower로 복제되기 전에 죽는 경우뿐.
- `enable.idempotence=true`는 retry 시 중복 방지. 2-broker 환경의 잦은 retry에서 필수.
- DB outbox 테이블 retention을 짧게 잡으면 안전망이 무력화된다 — 최소 24h 권장.

### 1.5 2-broker 환경에서 EOS는 비추천

트랜잭셔널 producer(EOS)를 2-broker에 적용하면:

- `__transaction_state` RF가 사실상 2가 상한.
- `transaction.state.log.min.isr=2`로 두면 broker 1대 장애 시 EOS 전면 정지.
- `min.isr=1`로 낮추면 EOS의 정확한 일회 처리 보장이 약화 (장애 시 데이터 유실 또는 중복 가능).

**결론:** 2-broker는 _at-least-once + 아웃박스 + 멱등 핸들러_ 조합이 EOS보다 운영상 유리하다. EOS가 필요하면 3-broker로 증설하라.

### 1.6 3-broker 증설 트리거

다음 중 하나라도 해당하면 3-broker로 증설 계획:

- `BytesInPerSec` 70%를 정기적으로 초과
- 트랜잭셔널 producer 도입 결정
- partition 수가 broker당 권장치(KRaft 기준 broker당 ~4000 partition replicas) 70% 도달
- AZ 장애 빈도 vs 복구 비용 분석에서 가용성 SLA 미달

증설 절차:

```bash
# 1) MSK 콘솔/Terraform으로 broker 추가
# 2) RF=2 → RF=3 재분배
kafka-reassign-partitions.sh --bootstrap-server msk:9092 \
  --topics-to-move-json-file topics.json \
  --broker-list "1,2,3" --generate

# 3) 검증 후 실행
kafka-reassign-partitions.sh ... --execute
kafka-reassign-partitions.sh ... --verify

# 4) min.insync.replicas=2 복원 (RF=3 with min.isr=2가 표준 안정 구성)
```

### 1.7 관측 — 무엇을 보아야 하는가

| 메트릭 | 임계 | 의미 |
|--------|------|------|
| `UnderMinIsrPartitionCount` | > 0 | produce 블록 또는 ack 약화 (핵심) |
| `UnderReplicatedPartitions` | > 0 | 복제 지연. produce는 OK |
| `OfflinePartitionsCount` | > 0 5분 지속 | 즉시 인시던트 |
| `RequestHandlerAvgIdlePercent` | < 30% | broker 포화 |
| `ProduceRequestRate` 급강하 | — | 무전 상태(broker 측 거부) 가능 |
| Debezium replication slot lag (PG) | > 1GB | Kafka 부재로 outbox 적체 |

**`UnderMinIsrPartitionCount`가 핵심이다.** `UnderReplicatedPartitions`만 모니터링하면 "복제는 늦지만 produce는 됨" 상태와 "produce 전면 블록" 상태를 구별할 수 없다.

---

## 2. 최신 KIP 트렌드 (4.0 GA 이후)

2026-05 기준, Apache Kafka 4.0 GA(2025) 이후 운영자가 알아야 할 굵직한 변화 6가지.

### 2.1 KIP-848 Next-Gen Consumer Rebalance Protocol

**상태:** 4.0 GA. `group.protocol=consumer`로 활성화. 기본값은 `classic`(deprecated 예정).

**핵심 변화:** 클라이언트 측 assignor → **server-side assignor**. 컨슈머 합의가 heartbeat에 push 형태로 옴.

**운영 영향:**
- 클라이언트 측 `partition.assignment.strategy` 설정이 무시됨. RangeAssignor를 강제하던 기존 운영은 자동으로 표준 assignor로 대체.
- 정적 멤버십(`group.instance.id`) 시멘틱 미세 변화 — graceful shutdown 시 leave 신호 전파 경로가 다름. 기존 deploy 스크립트(`pod terminate → 즉시 다음 pod 시작`)에서 짧은 미할당 윈도우가 생길 수 있음.
- 동일 그룹 내 classic + consumer 혼재 가능 — rolling 마이그레이션 OK.

**권장:**
- 점진적 활성화. 단일 인스턴스 → 일부 → 전체.
- SIGTERM 핸들러에 `consumer.close(Duration.ofSeconds(30))` 명시.
- `rebalance-rate-per-hour`, `partition-assignments-per-rebalance` baseline 재설정.

```properties
# 점진적 활성화 — 일부 인스턴스부터
group.protocol=consumer
group.id=payments
```

### 2.2 KIP-890 Transactions Server-Side Defense

**상태:** 4.0 GA (v2 활성화).

**핵심 변화:** 매 commit/abort 시 producer epoch 자동 bump. 좀비 producer가 다음 commit 시 epoch invalid임을 broker가 즉시 검출.

**운영 영향:** 기존 `ProducerFencedException`만 catch하던 코드가 깨진다. KIP-890 후에는 다음 에러들도 fatal recovery로 처리해야:

- `ProducerFencedException`
- `OutOfOrderSequenceException`
- `InvalidProducerEpochException`
- `UnsupportedVersionException`
- `AuthorizationException`

**권장 핸들러 패턴:**

```java
try {
    producer.commitTransaction();
} catch (ProducerFencedException
       | OutOfOrderSequenceException
       | InvalidProducerEpochException
       | UnsupportedVersionException
       | AuthorizationException e) {
    producer.close(Duration.ZERO);
    producer = createNewTransactionalProducer();  // 동일 transactional.id로 재초기화
} catch (KafkaException e) {
    if (isRetriable(e)) { /* retry */ }
    else { throw e; }
}
```

Kafka Streams 4.0+는 라이브러리 레벨에서 자동 처리. 직접 Producer를 쓰는 사용자만 코드 수정 필요.

### 2.3 KIP-966 Eligible Leader Replicas

**상태:** 4.0 GA part1 / 4.1+ part2 (관측 도구 강화).

**핵심 변화:** ISR이 비어도 _과거 ISR이었던 last-known-good replica_(ELR)는 leader 후보로 둔다. unclean leader election과 다름 — ELR은 데이터 유실 없는 회복 경로.

**운영 영향:**
- 다중 broker 동시 장애 시 partition이 `Leader=none`을 유지하는 경우 생김. Pre-KIP-966에서는 unclean=true면 OSR이 leader가 되어 데이터 유실, false면 즉시 offline. KIP-966은 그 사이에 "ELR 회복 대기" 구간을 둔다.
- `Leader=none` 지속 시 가용성과 내구성 트레이드오프 결정 필요.

**권장:**

```bash
# ELR 상태 확인 (4.1+ ELR 컬럼 출력)
kafka-topics.sh --bootstrap-server X --describe --topic critical
# Topic: critical Partition: 3  Leader: -1  Replicas: 1,2,3  Isr:   ELR: 2

# Critical 토픽은 RF=4~5 고려 — ELR 후보 풀 확장
# OfflinePartitionsCount > 0 5분 지속 시 unclean toggle 결재 절차
```

### 2.4 KIP-932 Queues / Share Groups

**상태:** 4.0 EA (Early Access). 4.x 동안 시멘틱 변경 가능.

**핵심 변화:** 컨슈머 그룹의 큐 시멘틱 변형. 한 partition을 여러 컨슈머가 분산해서 읽고, 각 record를 개별 ack. AMQP/SQS와 비슷.

**중요한 함정:** Share Group은 **partition 내 순서 보장이 없다**. 처리 실패 시 다른 컨슈머에 redelivery. 멱등성 없는 핸들러는 중복 처리.

**적용 가능한 워크로드:**
- ✅ 이미지 썸네일 생성, 알림 발송, 외부 API 호출 등 _독립적 작업 단위_.
- ❌ **아웃박스 컨슈머**, 트랜잭셔널 핸들러, 같은 aggregate id의 순서 의존 처리.

```bash
# 그룹 모드 확인
kafka-consumer-groups.sh --bootstrap-server X --describe --group X --members
# TYPE 컬럼: share = KIP-932, consumer = KIP-848, classic = 기존
```

**적용 검사 — 모두 yes일 때만:**
1. partition 내 순서가 무관한가?
2. 핸들러가 멱등인가?
3. at-least-once OK인가?

### 2.5 KIP-1150 Diskless Topics

**상태:** 2026-03 Accepted. 구현체별(Aiven, Confluent, Apache trunk) 차이 큼. **Production 채택 신중.**

**핵심 변화:** 데이터를 broker 로컬 디스크 대신 object storage(S3 등)에 직접 기록. broker는 라우팅 + 메타데이터만.

**장점:**
- RF 비용 0 (S3가 자체 복제)
- broker 디스크 IO 0
- cross-AZ 전송 비용 절감 (producer가 직접 S3)

**본질적 단점:**
- Produce P99 latency = S3 PUT P99 (수백ms)
- 작은 batch + 짧은 linger의 경우 S3 PUT 비용이 EBS보다 비쌈
- Consumer fetch가 S3 GET을 broker가 패스/캐시하는지 구현 의존
- LSO/LEO 의미 변화 — lag 메트릭 baseline 재설정 필요

**적합한 토픽:**
- ✅ 스루풋 작고 retention 긴 토픽: audit log, slow-change CDC, archival
- ❌ 트랜잭셔널 outbox, 실시간 fanout, latency-sensitive

**도입 검사 매트릭스:**

| 조건 | Diskless 적합 |
|------|---------------|
| `record-send-rate` > 10000/s | ❌ |
| `linger.ms` < 10 | ❌ |
| read_committed 컨슈머가 latency-sensitive | ❌ |
| retention < 1 day | ❌ |
| 모두 반대 | ✅ 후보 |

**비용 모델링:** S3 PUT/GET 단가 × 추정 빈도를 broker EBS gp3 비용과 명시적 비교. `linger.ms`를 키워야 PUT 빈도 감소.

### 2.6 KIP-1071 Streams Rebalance Protocol

**상태:** 4.0+ 진행 중. KIP-848을 Streams에 확장.

**핵심:** Streams의 group rebalance를 새 프로토콜에 맞춰 재설계. Stream task 할당의 server-side 처리, warm-up replica 고려, sticky 강화.

**운영 영향:** 4.x Streams 업그레이드 시 rebalance 시간/빈도가 변화. Streams 앱의 rebalance baseline을 재측정하라.

---

## 3. 도입 우선순위 매트릭스

| KIP | 운영 임팩트 | 위험 | 도입 권장 시점 |
|-----|-------------|------|----------------|
| KIP-848 | 높음 (rebalance 시간 단축) | 중 (deploy 스크립트 검증 필요) | 4.0 안정화 후 점진적 |
| KIP-890 | 높음 (트랜잭셔널 안정성) | 중 (catch 갱신 필수) | 트랜잭셔널 사용 시 즉시 |
| KIP-966 | 중 (다중 장애 회복) | 낮음 | 자동 활성화 시 그대로 |
| KIP-932 | 워크로드 의존 | 높음 (시멘틱 다름) | 적합 워크로드만, EA 동안 신중 |
| KIP-1150 | 비용 절감 | 매우 높음 (PoC 필수) | 비용 압박 + 적합 토픽만 |
| KIP-1071 | 중 (Streams) | 낮음 | Streams 사용 시 KIP-848과 함께 |

---

## 4. 참고 링크

### MSK / 2-broker
- [AWS MSK Best Practices](https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices.html)
- [AWS MSK Configuration Properties](https://docs.aws.amazon.com/msk/latest/developerguide/msk-configuration-properties.html)
- [Debezium Outbox Event Router](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html)

### KIPs
- [KIP-848 Next-Gen Consumer Rebalance](https://cwiki.apache.org/confluence/x/HhD1D)
- [KIP-890 Transactions Server-Side Defense](https://cwiki.apache.org/confluence/display/KAFKA/KIP-890%3A+Transactions+Server-Side+Defense)
- [KIP-966 Eligible Leader Replicas](https://cwiki.apache.org/confluence/display/KAFKA/KIP-966%3A+Eligible+Leader+Replicas)
- [KIP-932 Queues / Share Groups](https://cwiki.apache.org/confluence/display/KAFKA/KIP-932%3A+Queues+for+Kafka)
- [KIP-1150 Diskless Topics](https://cwiki.apache.org/confluence/display/KAFKA/KIP-1150%3A+Diskless+Topics)
- [KIP-1071 Streams Rebalance Protocol](https://cwiki.apache.org/confluence/display/KAFKA/KIP-1071%3A+Streams+Rebalance+Protocol)

### 관련 (배경 지식)
- [KIP-98 Exactly Once Delivery and Transactional Messaging](https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging)
- [KIP-447 Producer Scalability for EOS v2](https://cwiki.apache.org/confluence/display/KAFKA/KIP-447%3A+Producer+scalability+for+exactly+once+semantics)
- [KIP-679 Strongest Delivery Default](https://cwiki.apache.org/confluence/display/KAFKA/KIP-679%3A+Producer+will+enable+the+strongest+delivery+guarantee+by+default)
- [KIP-405 Tiered Storage](https://cwiki.apache.org/confluence/display/KAFKA/KIP-405%3A+Kafka+Tiered+Storage)

---

> **확인 시점**: 2026-05. KIP 상태(Accepted/GA/EA)는 빠르게 바뀌니 cwiki 페이지의 갱신일을 항상 다시 확인하라.
