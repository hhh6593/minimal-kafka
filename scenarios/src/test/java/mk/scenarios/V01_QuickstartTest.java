package mk.scenarios;

import mk.broker.Broker;
import mk.broker.config.KafkaConfig;
import mk.clients.consumer.Consumer;
import mk.clients.consumer.ConsumerRecord;
import mk.clients.producer.Producer;
import mk.clients.producer.ProducerRecord;
import mk.clients.producer.RecordMetadata;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v1 quickstart smoke test: start broker on an ephemeral port, produce three records,
 * consume them back, assert offsets and values.
 *
 * Run:  ./gradlew :scenarios:test --tests mk.scenarios.V01_QuickstartTest
 */
class V01_QuickstartTest {

    @Test
    void produceAndConsumeRoundTrip() throws Exception {
        KafkaConfig cfg = KafkaConfig.defaults().withPort(0); // ephemeral
        try (Broker broker = new Broker(cfg)) {
            broker.start();
            int port = broker.boundPort();

            try (Producer producer = new Producer("127.0.0.1", port)) {
                RecordMetadata m0 = producer.send(ProducerRecord.of("demo", "k1", "hello"));
                RecordMetadata m1 = producer.send(ProducerRecord.of("demo", "k2", "world"));
                RecordMetadata m2 = producer.send(ProducerRecord.of("demo", "k3", "!"));
                assertEquals(0, m0.offset());
                assertEquals(1, m1.offset());
                assertEquals(2, m2.offset());
            }

            try (Consumer consumer = new Consumer("127.0.0.1", port, "demo", 0, 0L)) {
                List<ConsumerRecord> all = new ArrayList<>();
                long deadline = System.nanoTime() + java.time.Duration.ofSeconds(5).toNanos();
                while (all.size() < 3 && System.nanoTime() < deadline) {
                    all.addAll(consumer.poll(100));
                    if (all.size() < 3) Thread.sleep(50);
                }
                assertEquals(3, all.size(), "expected 3 records, got " + all.size());
                assertEquals("hello", all.get(0).valueAsString());
                assertEquals("world", all.get(1).valueAsString());
                assertEquals("!",     all.get(2).valueAsString());
                assertEquals("k1",    all.get(0).keyAsString());
            }
        }
    }

    @Test
    void consumerStartingFromMiddleOffset() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            int port = broker.boundPort();

            try (Producer p = new Producer("127.0.0.1", port)) {
                for (int i = 0; i < 5; i++) p.send(ProducerRecord.of("t", "m" + i));
            }

            try (Consumer c = new Consumer("127.0.0.1", port, "t", 0, 3L)) {
                List<ConsumerRecord> got = new ArrayList<>();
                long deadline = System.nanoTime() + java.time.Duration.ofSeconds(3).toNanos();
                while (got.size() < 2 && System.nanoTime() < deadline) {
                    got.addAll(c.poll(100));
                    if (got.size() < 2) Thread.sleep(50);
                }
                assertEquals(2, got.size());
                assertEquals(3L, got.get(0).offset());
                assertEquals("m3", got.get(0).valueAsString());
            }
        }
    }

    @Test
    void fetchFromEmptyTopicReturnsEmpty() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            try (Consumer c = new Consumer("127.0.0.1", broker.boundPort(), "never-used", 0, 0L)) {
                assertTrue(c.poll(10).isEmpty());
            }
        }
    }
}
