package mk.broker.replication;

import mk.broker.log.LogManager.TopicPartition;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * v10+ replication state simulator. Not a real multi-broker replication protocol — this tracks
 * per-partition leader/ISR/follower LEO/HWM so scenarios can reason about:
 *
 *  - acks=all + min.insync.replicas=k rejection when |ISR| < k
 *  - ISR shrink due to slow follower
 *  - HWM advance only to min(LEO) across ISR
 *  - unclean leader election (v11) — picks an out-of-ISR broker as leader when ISR empty
 *  - stale broker epoch ISR join (v15-3 / KIP-903) when
 *    {@link mk.broker.api.BrokerToggles#enforceBrokerEpochOnIsrJoin}
 */
public final class ReplicaManager {

    public static final class State {
        public volatile int leader = -1;
        public final Set<Integer> replicas = new LinkedHashSet<>();
        public final Set<Integer> isr = new LinkedHashSet<>();
        public final Map<Integer, Long> followerLeo = new ConcurrentHashMap<>();
        public final Map<Integer, Integer> brokerEpoch = new ConcurrentHashMap<>();
        public volatile long highWatermark = 0;
        public volatile long leo = 0;

        public synchronized void recomputeHwm() {
            long min = leo;
            for (int f : isr) {
                min = Math.min(min, followerLeo.getOrDefault(f, 0L));
            }
            this.highWatermark = min;
        }
    }

    private final Map<TopicPartition, State> states = new ConcurrentHashMap<>();

    public State ensure(TopicPartition tp, int leader, List<Integer> replicas) {
        return states.computeIfAbsent(tp, k -> {
            State s = new State();
            s.leader = leader;
            s.replicas.addAll(replicas);
            s.isr.addAll(replicas);
            for (int b : replicas) s.followerLeo.put(b, 0L);
            return s;
        });
    }

    public State state(TopicPartition tp) { return states.get(tp); }

    public synchronized void onAppend(TopicPartition tp, long newLeo) {
        State s = states.get(tp);
        if (s == null) return;
        s.leo = newLeo;
        s.followerLeo.put(s.leader, newLeo);
        s.recomputeHwm();
    }

    public synchronized boolean canAppendWithAcksAll(TopicPartition tp, int minInSync) {
        State s = states.get(tp);
        return s != null && s.isr.size() >= minInSync;
    }

    public synchronized void shrinkIsrDueToLag(TopicPartition tp, int brokerId) {
        State s = states.get(tp);
        if (s == null) return;
        s.isr.remove(brokerId);
        s.recomputeHwm();
    }

    public synchronized void growIsr(TopicPartition tp, int brokerId, int brokerEpoch,
                                     boolean enforceEpochCheck) {
        State s = states.get(tp);
        if (s == null) return;
        if (enforceEpochCheck) {
            Integer known = s.brokerEpoch.get(brokerId);
            if (known != null && brokerEpoch < known) {
                // KIP-903: refuse stale-epoch follower
                return;
            }
        }
        s.brokerEpoch.put(brokerId, brokerEpoch);
        s.isr.add(brokerId);
        s.recomputeHwm();
    }

    public synchronized void advanceFollower(TopicPartition tp, int brokerId, long leo) {
        State s = states.get(tp);
        if (s == null) return;
        s.followerLeo.put(brokerId, leo);
        s.recomputeHwm();
    }

    public synchronized boolean electUncleanLeader(TopicPartition tp, boolean uncleanEnabled) {
        State s = states.get(tp);
        if (s == null) return false;
        if (!s.isr.isEmpty()) return true; // clean election possible
        if (!uncleanEnabled) return false; // partition goes offline
        // pick the stalest remaining replica — the educational worst case that makes "unclean"
        // meaningful: electing a behind replica rewinds committed state.
        int pick = -1;
        long pickLeo = Long.MAX_VALUE;
        for (int r : s.replicas) {
            long leo = s.followerLeo.getOrDefault(r, 0L);
            if (leo < pickLeo) { pick = r; pickLeo = leo; }
        }
        if (pick < 0) return false;
        s.leader = pick;
        s.isr.add(pick);
        s.leo = pickLeo;
        s.highWatermark = pickLeo;
        return true;
    }

    public List<TopicPartition> partitions() {
        return new ArrayList<>(states.keySet());
    }

    public static <T> Set<T> emptyIfNull(Set<T> s) { return s == null ? Collections.emptySet() : s; }
}
