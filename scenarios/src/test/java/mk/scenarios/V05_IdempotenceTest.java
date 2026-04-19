package mk.scenarios;

import mk.broker.Broker;
import mk.broker.config.KafkaConfig;
import mk.clients.producer.Producer;
import mk.clients.producer.ProducerConfig;
import mk.clients.producer.ProducerRecord;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v5 — Idempotent producer (PID/epoch/sequence).
 *
 * Real Kafka: KIP-98. The broker refuses a PRODUCE whose baseSequence does not match the expected
 * next sequence for that (PID, epoch, topic, partition). This test exercises:
 *
 *   - happy path: sequence advances monotonically
 *   - out-of-order sequence rejection
 *   - KAFKA-12152: partitions without in-flight batches keep stale sequence across epoch bump
 *     (reproduced by toggling BrokerToggles.resetSequenceOnEpochBumpForAllPartitions=false)
 */
class V05_IdempotenceTest {

    @Test
    void initProducerId_assignsIncreasingIds() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            int port = broker.boundPort();

            ProducerConfig a = new ProducerConfig().host("127.0.0.1").port(port).idempotence(true);
            ProducerConfig b = new ProducerConfig().host("127.0.0.1").port(port).idempotence(true);

            try (Producer p1 = new Producer(a); Producer p2 = new Producer(b)) {
                assertTrue(p1.producerId() > 0);
                assertTrue(p2.producerId() > p1.producerId());
                assertEquals(0, p1.producerEpoch());
            }
        }
    }

    @Test
    void monotonicSequence_acceptsInOrder() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            ProducerConfig cfg = new ProducerConfig().host("127.0.0.1").port(broker.boundPort())
                    .idempotence(true);
            try (Producer p = new Producer(cfg)) {
                for (int i = 0; i < 10; i++) {
                    assertEquals(i, p.send(ProducerRecord.of("t", "m" + i)).offset());
                }
            }
        }
    }

    @Test
    void outOfOrderSequence_rejected() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            ProducerConfig cfg = new ProducerConfig().host("127.0.0.1").port(broker.boundPort())
                    .idempotence(true);
            try (Producer p = new Producer(cfg)) {
                p.send(ProducerRecord.of("t", "m0"));
                // forcibly skip a sequence by poking the internal map via reflection — or, simpler,
                // emulate the broker perspective directly.
                var state = broker.api().producerState();
                state.advance(p.producerId(), "t", 0, /*baseSeq*/ 5, /*count*/ 1);
                IOException err = assertThrows(IOException.class, () -> p.send(ProducerRecord.of("t", "m1")));
                assertTrue(err.getMessage().contains("OUT_OF_ORDER_SEQUENCE_NUMBER"));
            }
        }
    }

    @Test
    void kafka12152_sequenceResetGapOnEpochBump_reproducesBug() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            ProducerConfig cfg = new ProducerConfig().host("127.0.0.1").port(broker.boundPort())
                    .idempotence(true);

            // toggle off the fix so only "in-flight" partitions reset on epoch bump
            broker.api().toggles().resetSequenceOnEpochBumpForAllPartitions = false;

            try (Producer p = new Producer(cfg)) {
                // seq advances on two partitions
                p.send(new ProducerRecord("t", 0, null, "A".getBytes()));
                p.send(new ProducerRecord("t", 1, null, "B".getBytes()));

                // force epoch bump on server; only partition 0 declared as having in-flight
                broker.api().producerState().bumpEpoch(p.producerId(),
                        java.util.Set.of("t:0"), /*resetAll=*/ false);

                // the client still carries the old epoch; this is how real producers discover
                // the bump — via a rejected request. Scenario simplifies that by asserting:
                // partition 1 seq was NOT reset, so it remains stale at 0. Probing with a fresh
                // INIT_PRODUCER_ID client that knows the server-side state.
                var state = broker.api().producerState();
                Integer lastSeqP0 = state.lastSeq(p.producerId(), "t", 0);
                Integer lastSeqP1 = state.lastSeq(p.producerId(), "t", 1);
                assertNull(lastSeqP0, "p0 was cleared because it had in-flight");
                assertNotNull(lastSeqP1, "p1 stale seq remains — KAFKA-12152 bug reproduced");
            }
        }
    }

    @Test
    void kafka12152_fixReleasesAllSequencesOnEpochBump() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            ProducerConfig cfg = new ProducerConfig().host("127.0.0.1").port(broker.boundPort())
                    .idempotence(true);
            // default is resetAll=true (the fix is ON)
            try (Producer p = new Producer(cfg)) {
                p.send(new ProducerRecord("t", 0, null, "A".getBytes()));
                p.send(new ProducerRecord("t", 1, null, "B".getBytes()));

                broker.api().producerState().bumpEpoch(p.producerId(), java.util.Set.of("t:0"),
                        /*resetAll=*/ true);

                var state = broker.api().producerState();
                assertNull(state.lastSeq(p.producerId(), "t", 0));
                assertNull(state.lastSeq(p.producerId(), "t", 1), "fix: all seqs cleared");
            }
        }
    }
}
