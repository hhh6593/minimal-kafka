package mk.scenarios;

import mk.broker.Broker;
import mk.broker.config.KafkaConfig;
import mk.broker.log.LogManager.TopicPartition;
import mk.broker.replication.ReplicaManager;
import mk.broker.replication.ReplicaManager.State;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v10 — Replication, ISR, HWM.
 *
 * This is an in-proc simulation — we don't run a second broker, but we walk the same state
 * machine ({@link ReplicaManager}) that a real partition leader maintains. Scenarios exercise:
 *
 *   - HWM advances to min(LEO) across ISR
 *   - slow follower falls out of ISR
 *   - {@code acks=all} with {@code min.insync.replicas=2} is rejected when only one in-sync remains
 */
class V10_ReplicationTest {

    @Test
    void hwmAdvancesToMinLeoAcrossIsr() {
        ReplicaManager rm = new ReplicaManager();
        TopicPartition tp = new TopicPartition("t", 0);
        State s = rm.ensure(tp, 1, List.of(1, 2, 3));

        rm.onAppend(tp, 10);                // leader LEO=10
        assertEquals(0, s.highWatermark, "followers haven't fetched yet");

        rm.advanceFollower(tp, 2, 7);
        rm.advanceFollower(tp, 3, 8);
        assertEquals(7, s.highWatermark, "HWM = min LEO among ISR");

        rm.advanceFollower(tp, 2, 10);
        rm.advanceFollower(tp, 3, 10);
        assertEquals(10, s.highWatermark);
    }

    @Test
    void shrinkIsrWhenFollowerLags() {
        ReplicaManager rm = new ReplicaManager();
        TopicPartition tp = new TopicPartition("t", 0);
        State s = rm.ensure(tp, 1, List.of(1, 2, 3));

        rm.onAppend(tp, 100);
        rm.advanceFollower(tp, 2, 100);
        rm.advanceFollower(tp, 3, 40);

        assertEquals(40, s.highWatermark);

        // operator logic decides broker 3 is too far behind and shrinks the ISR
        rm.shrinkIsrDueToLag(tp, 3);
        assertEquals(100, s.highWatermark, "removing slow follower unblocks HWM advance");
        assertFalse(s.isr.contains(3));
    }

    @Test
    void acksAllRequiresEnoughInSyncReplicas() {
        ReplicaManager rm = new ReplicaManager();
        TopicPartition tp = new TopicPartition("t", 0);
        State s = rm.ensure(tp, 1, List.of(1, 2, 3));

        assertTrue(rm.canAppendWithAcksAll(tp, 2));
        rm.shrinkIsrDueToLag(tp, 2);
        rm.shrinkIsrDueToLag(tp, 3);
        assertFalse(rm.canAppendWithAcksAll(tp, 2),
                "acks=all with min.insync.replicas=2 must fail when ISR={leader}");
    }
}
