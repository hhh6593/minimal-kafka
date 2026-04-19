package mk.scenarios;

import mk.broker.Broker;
import mk.broker.config.KafkaConfig;
import mk.broker.log.TopicConfig;
import mk.broker.retention.Retention;
import mk.clients.producer.Producer;
import mk.clients.producer.ProducerConfig;
import mk.clients.producer.ProducerRecord;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v13 — Retention + compaction.
 *
 * Scenarios:
 *   - retentionBytes is enforced: after running the cleaner, older records are accounted as removed
 *   - compaction counts duplicates per key for removal
 */
class V13_RetentionCompactionTest {

    @Test
    void retention_countsOldRecordsAsRemovable() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            broker.logs().createTopic(new TopicConfig("t", 1, 1,
                    /*retentionBytes=*/ 320L, -1L, TopicConfig.CleanupPolicy.DELETE, 1));

            try (Producer p = new Producer(new ProducerConfig().host("127.0.0.1").port(broker.boundPort()))) {
                for (int i = 0; i < 20; i++) p.send(ProducerRecord.of("t", "v" + i));
            }
            Retention r = new Retention(broker.logs());
            Map<String, Integer> removed = r.enforce();
            assertTrue(removed.get("t") > 0, "cleaner should mark old records as removable");
        }
    }

    @Test
    void compaction_countsDuplicateKeys() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            broker.logs().createTopic(new TopicConfig("t", 1, 1, -1L, -1L,
                    TopicConfig.CleanupPolicy.COMPACT, 1));

            try (Producer p = new Producer(new ProducerConfig().host("127.0.0.1").port(broker.boundPort()))) {
                for (int i = 0; i < 5; i++) {
                    p.send(ProducerRecord.of("t", "k1", "v" + i));
                    p.send(ProducerRecord.of("t", "k2", "v" + i));
                }
            }
            Retention r = new Retention(broker.logs());
            Map<String, Integer> removed = r.enforce();
            // 5 writes to k1 + 5 writes to k2, compaction keeps last of each -> 8 removable
            assertEquals(8, removed.get("t"));
        }
    }
}
