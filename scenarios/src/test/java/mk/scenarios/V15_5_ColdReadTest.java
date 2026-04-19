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
 * v15-5 — Tiered storage cold read latency (KIP-405 motivation, KIP-1176 follow-up).
 *
 * A consumer reading offsets below the "cold boundary" gets delayed. A tail consumer reading
 * above the boundary is not delayed. Real Kafka's analog: older segments served from S3/HDFS
 * with 50–500ms first-byte latency while hot tail data is served from page cache in microseconds.
 */
class V15_5_ColdReadTest {

    @Test
    void coldReadsAreDelayed_tailReadsAreNot() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            int port = broker.boundPort();

            try (Producer p = new Producer(new ProducerConfig().host("127.0.0.1").port(port))) {
                for (int i = 0; i < 100; i++) p.send(ProducerRecord.of("t", "v" + i));
            }

            // anything below offset 80 is "cold" — served with +50ms injected
            broker.api().toggles().coldReadBoundaryOffset = 80;
            broker.api().toggles().coldReadDelayMs = 50;

            long coldStart = System.currentTimeMillis();
            try (Consumer c = new Consumer("127.0.0.1", port, "t", 0, 0L)) {
                c.poll(5);
            }
            long coldElapsed = System.currentTimeMillis() - coldStart;

            long tailStart = System.currentTimeMillis();
            try (Consumer c = new Consumer("127.0.0.1", port, "t", 0, 90L)) {
                c.poll(5);
            }
            long tailElapsed = System.currentTimeMillis() - tailStart;

            assertTrue(coldElapsed >= 50, "cold read should observe injected latency, got " + coldElapsed);
            assertTrue(tailElapsed < coldElapsed, "tail should be faster than cold");
        }
    }
}
