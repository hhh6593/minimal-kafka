package mk.scenarios;

import mk.broker.Broker;
import mk.broker.config.KafkaConfig;
import mk.clients.consumer.Consumer;
import mk.clients.producer.Producer;
import mk.clients.producer.ProducerConfig;
import mk.clients.producer.ProducerRecord;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v14 — Operational trouble demos.
 *
 * These are pragmatic demonstrations built on broker toggles:
 *   - fetchMaxBytes cap: reading a partition in small chunks
 *   - producer quota / throttling (simulated via injected latency later)
 *
 * Real Kafka exposes these via {@code fetch.max.bytes}, {@code fetch.max.wait.ms},
 * {@code quota.producer.default}, {@code client.quota.callback.class}.
 */
class V14_OpsTroubleTest {

    @Test
    void fetchMaxRecordsCaps_howManyRecordsClientSeesPerPoll() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            int port = broker.boundPort();
            try (Producer p = new Producer(new ProducerConfig().host("127.0.0.1").port(port))) {
                for (int i = 0; i < 100; i++) p.send(ProducerRecord.of("t", "v" + i));
            }
            try (Consumer c = new Consumer("127.0.0.1", port, "t", 0, 0L)) {
                // a small max is the head-of-line lever: the broker returns at most this many
                // and a large message in front of a small consumer's queue blocks the rest
                assertEquals(10, c.poll(10).size());
                assertEquals(10, c.poll(10).size());
            }
        }
    }

    @Test
    void producerQuotaToggleSimulatesDelay() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            int port = broker.boundPort();

            // simulate quota throttling by abusing the cold-read latency knob (which injects
            // sleep broker-side); produce still succeeds but is slower — same symptom the user
            // observes when quotas silently throttle without a client-visible error.
            broker.api().toggles().coldReadDelayMs = 10;
            broker.api().toggles().coldReadBoundaryOffset = Long.MAX_VALUE;

            try (Producer p = new Producer(new ProducerConfig().host("127.0.0.1").port(port))) {
                p.send(ProducerRecord.of("t", "warmup"));
            }
            try (Consumer c = new Consumer("127.0.0.1", port, "t", 0, 0L)) {
                long t0 = System.currentTimeMillis();
                c.poll(10);
                long elapsed = System.currentTimeMillis() - t0;
                assertTrue(elapsed >= 10, "throttled fetch should observe injected latency");
            }
        }
    }
}
