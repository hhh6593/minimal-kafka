package mk.scenarios;

import mk.broker.Broker;
import mk.broker.config.KafkaConfig;
import mk.clients.consumer.Consumer;
import mk.clients.consumer.ConsumerRecord;
import mk.clients.producer.Partitioner;
import mk.clients.producer.Producer;
import mk.clients.producer.ProducerConfig;
import mk.clients.producer.ProducerRecord;
import mk.clients.producer.RecordMetadata;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v3 — Multi-partition + partitioner scenarios.
 *
 * Reproduces:
 *   - keyed hash partitioner → same key always lands in same partition
 *   - the "hot partition" pathology: a handful of hot keys land in a single partition
 *   - null key with RoundRobin distributes roughly evenly
 *   - null key with Sticky clusters the batch until {@link Partitioner.Sticky#rotate}
 */
class V03_PartitioningTest {

    @Test
    void hashPartitioner_sameKeyAlwaysSamePartition() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            int port = broker.boundPort();

            ProducerConfig cfg = new ProducerConfig().host("127.0.0.1").port(port)
                    .partitions(8).partitioner(new Partitioner.Hash());

            try (Producer p = new Producer(cfg)) {
                int[] hits = new int[8];
                for (int i = 0; i < 500; i++) {
                    RecordMetadata md = p.send(ProducerRecord.of("t", "hot-key", "v" + i));
                    hits[md.partition()]++;
                }
                int hot = 0, others = 0;
                for (int h : hits) { if (h > 0 && hot == 0) hot = h; else others += h; }
                assertEquals(500, hot);
                assertEquals(0, others, "all records with same key must land on exactly one partition");
            }
        }
    }

    @Test
    void roundRobin_distributesAcrossPartitions() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            int port = broker.boundPort();

            ProducerConfig cfg = new ProducerConfig().host("127.0.0.1").port(port)
                    .partitions(4).partitioner(new Partitioner.RoundRobin());

            try (Producer p = new Producer(cfg)) {
                Map<Integer, Integer> counts = new HashMap<>();
                for (int i = 0; i < 400; i++) {
                    RecordMetadata md = p.send(ProducerRecord.of("t", "m" + i));
                    counts.merge(md.partition(), 1, Integer::sum);
                }
                assertEquals(4, counts.size());
                for (int c : counts.values()) assertEquals(100, c);
            }
        }
    }

    @Test
    void sticky_batchesUntilRotated() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            int port = broker.boundPort();

            Partitioner.Sticky sticky = new Partitioner.Sticky();
            ProducerConfig cfg = new ProducerConfig().host("127.0.0.1").port(port)
                    .partitions(4).partitioner(sticky);

            try (Producer p = new Producer(cfg)) {
                Map<Integer, Integer> counts = new HashMap<>();
                for (int batch = 0; batch < 4; batch++) {
                    for (int i = 0; i < 25; i++) {
                        RecordMetadata md = p.send(ProducerRecord.of("t", "m" + batch + "-" + i));
                        counts.merge(md.partition(), 1, Integer::sum);
                    }
                    sticky.rotate(4);
                }
                assertEquals(4, counts.size(), "sticky rotates cover all partitions over time");
                for (int c : counts.values()) assertEquals(25, c);
            }
        }
    }

    @Test
    void hotPartitionConsumerLag() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            int port = broker.boundPort();

            ProducerConfig cfg = new ProducerConfig().host("127.0.0.1").port(port)
                    .partitions(4).partitioner(new Partitioner.Hash());

            try (Producer p = new Producer(cfg)) {
                for (int i = 0; i < 1000; i++) {
                    // two keys only → two partitions touched, the other two stay empty
                    String key = (i % 10 == 0) ? "rare" : "hot";
                    p.send(ProducerRecord.of("t", key, "v" + i));
                }
            }

            int[] counts = new int[4];
            for (int part = 0; part < 4; part++) {
                try (Consumer c = new Consumer("127.0.0.1", port, "t", part, 0L)) {
                    long deadline = System.nanoTime() + 1_000_000_000L;
                    int seen = 0;
                    while (System.nanoTime() < deadline) {
                        var b = c.poll(500);
                        if (b.isEmpty()) break;
                        for (ConsumerRecord ignored : b) seen++;
                    }
                    counts[part] = seen;
                }
            }
            int emptyParts = 0, skewedMax = 0, total = 0;
            for (int c : counts) {
                total += c;
                if (c == 0) emptyParts++;
                if (c > skewedMax) skewedMax = c;
            }
            assertEquals(1000, total);
            assertEquals(2, emptyParts, "hash on 2 keys should leave 2 partitions idle");
            assertTrue(skewedMax >= 800, "hot partition should hold most of the traffic, got " + skewedMax);
        }
    }
}
