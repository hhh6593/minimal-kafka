# v01 — 퀵스타트

가장 단순한 상태에서 **브로커 ↔ 프로듀서 ↔ 컨슈머** 왕복을 눈으로 확인한다. 트러블은 없다. 이후 모든 버전의 baseline.

## v1에 존재하는 것

| 구성 요소 | 파일 | 실제 Kafka 대응 |
|----------|------|----------------|
| 브로커 facade | [`broker/src/main/java/mk/broker/Broker.java`](../broker/src/main/java/mk/broker/Broker.java) | `kafka.server.KafkaBroker` |
| 수락자 (블로킹 NIO accept) | [`.../network/Acceptor.java`](../broker/src/main/java/mk/broker/network/Acceptor.java) | `kafka.network.SocketServer` + `Acceptor` |
| 연결 핸들러 (read→handle→write 루프) | [`.../network/ConnectionHandler.java`](../broker/src/main/java/mk/broker/network/ConnectionHandler.java) | `kafka.network.Processor` + `KafkaRequestHandlerPool` |
| API 라우터 | [`.../api/ApiHandler.java`](../broker/src/main/java/mk/broker/api/ApiHandler.java) | `kafka.server.KafkaApis` |
| 인메모리 로그 | [`.../log/InMemoryLog.java`](../broker/src/main/java/mk/broker/log/InMemoryLog.java) | `kafka.log.UnifiedLog` (디스크 세그먼트는 v2) |
| 와이어 프레이밍 | [`.../protocol/Wire.java`](../broker/src/main/java/mk/broker/protocol/Wire.java) | Kafka binary protocol (v4에서 바이너리로 전환 예정) |

## v1에 **없는** 것 (의도적으로)

- 디스크 영속성 — 프로세스 종료 시 데이터 전부 증발
- 멀티 파티션 / 파티셔너 — 프로듀서가 파티션 번호 직접 지정
- acks 레벨, 배칭, 재시도, 멱등성
- 컨슈머 그룹, 리밸런스, 오프셋 커밋 저장소
- 리플리케이션, ISR, HWM 승격
- 컨트롤러, 메타데이터 전파

## 와이어 프로토콜 (v1-v3 공용)

4바이트 big-endian 길이 prefix + JSON 본문. `tcpdump -A -i lo0 port 9092` 로 평문 관찰 가능.

**PRODUCE**
```json
{ "api":"PRODUCE", "topic":"demo", "partition":0,
  "records":[ { "key":"<base64>", "value":"<base64>" } ] }
```
응답
```json
{ "ok":true, "api":"PRODUCE", "topic":"demo", "partition":0,
  "baseOffset":0, "logEndOffset":1 }
```

**FETCH**
```json
{ "api":"FETCH", "topic":"demo", "partition":0, "offset":0, "maxRecords":500 }
```
응답
```json
{ "ok":true, "api":"FETCH", "topic":"demo", "partition":0,
  "records":[ {"offset":0,"timestamp":1700000000000,"value":"<base64>"} ],
  "highWatermark":1 }
```

## 실행

### 선행 조건
- JDK 17 이상. 프로젝트는 Gradle 툴체인으로 자동 매칭을 시도한다.
- Gradle 설치 불필요 — 프로젝트 wrapper(`./gradlew`) 사용.

### 자동 smoke 테스트
```bash
./gradlew :scenarios:test --tests 'mk.scenarios.V01_QuickstartTest'
```
세 개 테스트가 통과해야 v1 상태 정상:
- `produceAndConsumeRoundTrip` — 3건 produce → 3건 consume, 오프셋 0/1/2 검증
- `consumerStartingFromMiddleOffset` — 임의 오프셋 5건 produce 후 offset 3부터 consume
- `fetchFromEmptyTopicReturnsEmpty` — 존재하지 않는 토픽 fetch 시 빈 배열

### 수동 실행 (세 터미널)
```bash
# T1: 브로커
./gradlew :broker:run

# T2: 컨슈머
./gradlew --quiet :clients:runConsumer --args="127.0.0.1 9092 demo"

# T3: 프로듀서 (stdin에 입력, Ctrl+D로 종료)
./gradlew --quiet :clients:runProducer --args="127.0.0.1 9092 demo"
> hello
> world
```

컨슈머 터미널에 즉시 `offset=0 value=hello`, `offset=1 value=world` 출력.

## 관찰 포인트

### 1. 오프셋은 파티션 지역 변수
`InMemoryLog.append()`가 `records.size()`를 base offset으로 반환한다. 파티션 경계를 넘어가면 오프셋은 **공유되지 않는다**. 이것이 Kafka에서 "오프셋은 (topic, partition) 단위"라는 규칙의 뿌리다.

### 2. Producer와 Consumer는 모두 "블로킹 TCP 소켓 한 개"
v1은 connection pooling, 재시도, metadata cache가 없다. 프로듀서 인스턴스는 단일 소켓을 쥐고 한 번에 한 요청만 보낸다. 실제 Kafka 클라이언트는 `Sender` 백그라운드 스레드 + pipelined in-flight + 메타데이터 갱신을 병행한다. v4에서 일부 도입한다.

### 3. 컨슈머는 "pull" — offset을 **클라이언트가 진행**시킨다
`Consumer.poll()`이 내부적으로 `nextOffset`을 갱신한다. 브로커는 컨슈머가 어디까지 읽었는지 전혀 모른다. 이것이 `offset commit` (v9에서 도입)이 따로 존재하는 이유다.

### 4. 토픽은 첫 produce/fetch에 자동 생성된다
`LogManager.getOrCreate()` 참조. v3에서 명시적 생성으로 전환하며, 실제 Kafka의 `auto.create.topics.enable` 설정과 그 안티패턴을 다룬다.

## 실제 Kafka와의 대응 표

| v1 시도 | 실제 Kafka 4.2.0 |
|--------|-----------------|
| 길이 prefix + JSON | Kafka binary protocol (ApiKey short + version + correlationId + …) |
| `Acceptor` 단일 스레드 + fixed IO pool | `SocketServer`의 acceptors/processors/io-thread pool, `num.network.threads`, `num.io.threads` |
| 연결마다 한 요청 시리얼 처리 | in-flight 다중 요청, pipelining |
| 인메모리 `ArrayList` | `LogSegment` + `OffsetIndex` + `TimeIndex` (메모리-매핑) |

## 자기 점검 퀴즈

1. v1 브로커를 죽였다 다시 띄우면 직전 produce한 메시지는 어떻게 되는가? 왜?
2. 두 프로듀서가 같은 파티션에 동시에 append할 때 base offset이 겹치지 않도록 하는 코드 위치는 어디인가?
3. 컨슈머가 offset 1000을 요청했는데 현재 로그가 100건뿐이라면 어떤 응답이 오는가? 실제 Kafka의 동작과 어떻게 다른가?

힌트: 1번은 v2의 주제. 3번은 실제 Kafka는 `OffsetOutOfRangeException` + `auto.offset.reset` 정책이 작동.

## 다음 (v2) 예고

v2는 `InMemoryLog`를 **파일 기반 세그먼트 + 오프셋 인덱스**로 교체한다. 그리고 의도적으로 fsync를 빼둔다. 브로커를 `SIGKILL`로 죽이면 직전 produce한 N건이 사라지는 것을 재현하고, Kafka의 `log.flush.interval.messages` / `log.flush.interval.ms` 정책과 page cache 의존의 본질을 다룬다.
