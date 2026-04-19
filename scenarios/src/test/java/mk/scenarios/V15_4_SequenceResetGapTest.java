package mk.scenarios;

import mk.broker.Broker;
import mk.broker.config.KafkaConfig;
import mk.clients.producer.Producer;
import mk.clients.producer.ProducerConfig;
import mk.clients.producer.ProducerRecord;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v15-4 — Idempotent producer sequence reset gap (KAFKA-12152).
 *
 * When the producer epoch is bumped, partitions with NO in-flight batches used to keep their
 * stale sequence numbers. After recovery the next send with baseSeq=0 would be rejected as
 * OUT_OF_ORDER_SEQUENCE_NUMBER. The fix resets all partition sequences on epoch bump.
 */
class V15_4_SequenceResetGapTest {

    @Test
    void preFix_untouchedPartitionKeepsStaleSequence() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            var cfg = new ProducerConfig().host("127.0.0.1").port(broker.boundPort())
                    .partitions(2).idempotence(true);

            try (Producer p = new Producer(cfg)) {
                p.send(new ProducerRecord("t", 0, null, "A".getBytes()));
                p.send(new ProducerRecord("t", 1, null, "B".getBytes()));

                // pre-fix: bump epoch, reset only the partition that had "in-flight"
                broker.api().producerState().bumpEpoch(p.producerId(),
                        Set.of("t:0"), /*resetAll=*/ false);

                var state = broker.api().producerState();
                assertNull(state.lastSeq(p.producerId(), "t", 0));
                assertNotNull(state.lastSeq(p.producerId(), "t", 1), "partition 1 still stuck at old seq");
            }
        }
    }

    @Test
    void withFix_allPartitionsResetOnEpochBump() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            var cfg = new ProducerConfig().host("127.0.0.1").port(broker.boundPort())
                    .partitions(2).idempotence(true);

            try (Producer p = new Producer(cfg)) {
                p.send(new ProducerRecord("t", 0, null, "A".getBytes()));
                p.send(new ProducerRecord("t", 1, null, "B".getBytes()));

                broker.api().producerState().bumpEpoch(p.producerId(),
                        Set.of("t:0"), /*resetAll=*/ true);

                var state = broker.api().producerState();
                assertNull(state.lastSeq(p.producerId(), "t", 0));
                assertNull(state.lastSeq(p.producerId(), "t", 1));
            }
        }
    }
}
