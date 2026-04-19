package mk.scenarios;

import mk.broker.Broker;
import mk.broker.config.KafkaConfig;
import mk.clients.consumer.ConsumerConfig;
import mk.clients.consumer.GroupConsumer;
import mk.clients.producer.Producer;
import mk.clients.producer.ProducerConfig;
import mk.clients.producer.ProducerRecord;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v9 — Offset commit semantics.
 *
 * Auto commit: fast + simple, but an exception mid-batch before the next poll leaves the cursor
 * advanced on the client while the broker-committed offset still lags. Manual commit after
 * processing converts that skip into a duplicate (at-least-once) instead.
 *
 * This test mirrors both shapes against the in-memory OffsetStore.
 */
class V09_OffsetCommitTest {

    @Test
    void autoCommit_advancesOffsetBeforeProcessingCompletes() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            int port = broker.boundPort();

            try (Producer p = new Producer(new ProducerConfig().host("127.0.0.1").port(port))) {
                for (int i = 0; i < 5; i++) p.send(ProducerRecord.of("t", "m" + i));
            }

            ConsumerConfig cfg = new ConsumerConfig().host("127.0.0.1").port(port)
                    .group("g").subscribe("t").autoCommit(true);

            try (GroupConsumer c = new GroupConsumer(cfg)) {
                var batch = c.poll(200);
                assertEquals(5, batch.size());
            }

            Long committed = broker.api().offsetStore().read("g", "t", 0);
            assertNotNull(committed);
            assertEquals(5L, committed, "autoCommit persists up to last polled offset");
        }
    }

    @Test
    void manualCommit_afterProcessing_preventsSkip() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            int port = broker.boundPort();

            try (Producer p = new Producer(new ProducerConfig().host("127.0.0.1").port(port))) {
                for (int i = 0; i < 5; i++) p.send(ProducerRecord.of("t", "m" + i));
            }

            ConsumerConfig cfg = new ConsumerConfig().host("127.0.0.1").port(port)
                    .group("g").subscribe("t").autoCommit(false);

            try (GroupConsumer c = new GroupConsumer(cfg)) {
                c.poll(200);
                // caller crashes before committing — restart with fresh client
            }
            Long committed = broker.api().offsetStore().read("g", "t", 0);
            assertTrue(committed == null || committed == 0,
                    "without commit the broker remembers no progress -> reprocess on restart");

            // now commit manually after successful processing
            try (GroupConsumer c = new GroupConsumer(cfg)) {
                c.poll(200);
                c.commitSync();
            }
            Long committed2 = broker.api().offsetStore().read("g", "t", 0);
            assertEquals(5L, committed2);
        }
    }
}
