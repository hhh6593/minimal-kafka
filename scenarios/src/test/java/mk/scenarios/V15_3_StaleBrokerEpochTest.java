package mk.scenarios;

import mk.broker.log.LogManager.TopicPartition;
import mk.broker.replication.ReplicaManager;
import mk.broker.replication.ReplicaManager.State;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v15-3 — Stale broker epoch joining ISR → data loss path (KIP-903 / KAFKA-14617).
 *
 * A broker reboots with an empty log (page-cache unflushed data lost) and presents an old
 * broker-epoch to the leader. Without the epoch check, it rejoins the ISR and the HWM collapses
 * to 0, silently losing committed records.
 *
 * With {@link mk.broker.api.BrokerToggles#enforceBrokerEpochOnIsrJoin} ON, the leader rejects
 * the stale-epoch follower.
 */
class V15_3_StaleBrokerEpochTest {

    @Test
    void withoutEpochCheck_staleFollowerJoinsAndHwmRewinds() {
        ReplicaManager rm = new ReplicaManager();
        TopicPartition tp = new TopicPartition("t", 0);
        State s = rm.ensure(tp, 1, List.of(1, 2, 3));
        rm.onAppend(tp, 100);
        rm.advanceFollower(tp, 2, 100);
        rm.advanceFollower(tp, 3, 100);
        assertEquals(100, s.highWatermark);

        // broker 3 unclean restart: its advertised epoch is stale and log is empty
        rm.shrinkIsrDueToLag(tp, 3);
        int staleEpoch = 1;
        s.brokerEpoch.put(3, 5); // leader's known epoch for broker 3
        // pretend 3 rejoins without epoch enforcement
        rm.growIsr(tp, 3, staleEpoch, /*enforceEpochCheck=*/ false);
        rm.advanceFollower(tp, 3, 0);

        assertTrue(s.isr.contains(3));
        assertEquals(0, s.highWatermark, "stale follower pulled HWM back to its empty LEO");
    }

    @Test
    void withEpochCheck_staleFollowerRefused() {
        ReplicaManager rm = new ReplicaManager();
        TopicPartition tp = new TopicPartition("t", 0);
        State s = rm.ensure(tp, 1, List.of(1, 2, 3));
        rm.onAppend(tp, 100);
        rm.advanceFollower(tp, 2, 100);
        rm.advanceFollower(tp, 3, 100);
        rm.shrinkIsrDueToLag(tp, 3);
        s.brokerEpoch.put(3, 5);

        rm.growIsr(tp, 3, /*stale=*/ 1, /*enforceEpochCheck=*/ true);
        assertFalse(s.isr.contains(3), "KIP-903: stale epoch must not rejoin");
        assertEquals(100, s.highWatermark, "HWM unchanged");
    }
}
