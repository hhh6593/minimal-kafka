package mk.scenarios;

import mk.broker.log.LogManager.TopicPartition;
import mk.broker.replication.ReplicaManager;
import mk.broker.replication.ReplicaManager.State;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v11 — Unclean leader election.
 *
 * When every ISR member is gone but the replica set still has a broker with stale data, the
 * operator's policy determines what happens:
 *   - {@code unclean.leader.election.enable=false}: partition goes offline, availability lost,
 *     durability preserved.
 *   - {@code unclean.leader.election.enable=true}: stale replica becomes leader, HWM rewinds,
 *     data committed above the new leader's LEO is silently lost.
 */
class V11_UncleanLeaderElectionTest {

    @Test
    void uncleanDisabled_keepsPartitionOfflineWhenIsrEmpty() {
        ReplicaManager rm = new ReplicaManager();
        TopicPartition tp = new TopicPartition("t", 0);
        State s = rm.ensure(tp, 1, List.of(1, 2, 3));
        rm.onAppend(tp, 100);
        rm.advanceFollower(tp, 2, 100);
        rm.advanceFollower(tp, 3, 40);

        // all ISR members down
        for (int b : List.of(1, 2, 3)) rm.shrinkIsrDueToLag(tp, b);

        boolean leaderElected = rm.electUncleanLeader(tp, /*uncleanEnabled=*/ false);
        assertFalse(leaderElected, "without unclean policy, partition stays offline");
        assertTrue(s.isr.isEmpty());
    }

    @Test
    void uncleanEnabled_promotesStaleReplicaAndRewindsHighWatermark() {
        ReplicaManager rm = new ReplicaManager();
        TopicPartition tp = new TopicPartition("t", 0);
        State s = rm.ensure(tp, 1, List.of(1, 2, 3));
        rm.onAppend(tp, 100);
        rm.advanceFollower(tp, 2, 100);
        rm.advanceFollower(tp, 3, 40);

        // ISR shrinks: 2 and 1 disappear, only stale 3 remains in the replica set
        rm.shrinkIsrDueToLag(tp, 2);
        rm.shrinkIsrDueToLag(tp, 1);
        rm.shrinkIsrDueToLag(tp, 3);

        long hwmBefore = s.highWatermark;
        boolean elected = rm.electUncleanLeader(tp, /*uncleanEnabled=*/ true);
        assertTrue(elected);
        assertTrue(s.highWatermark < hwmBefore, "HWM must rewind to stale leader's LEO");
        assertTrue(s.isr.size() == 1 && s.isr.contains(3));
    }
}
