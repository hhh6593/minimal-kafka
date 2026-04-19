package mk.broker.controller;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * v12 — single-broker controller stub. Tracks a monotonically increasing epoch + a metadata
 * snapshot (topic -> partition -> leader). A scenario can simulate "controller failure" by
 * freezing the broadcast to some clients (KAFKA-15489 zombie controller scenario) via
 * {@link mk.broker.api.BrokerToggles#zombieControllerStaleMetadata}.
 */
public final class Controller {

    private final AtomicInteger epoch = new AtomicInteger(0);
    private final Map<String, Map<Integer, Integer>> leaderByPartition = new HashMap<>();

    public int epoch() { return epoch.get(); }

    public synchronized int electLeader(String topic, int partition, int brokerId) {
        leaderByPartition.computeIfAbsent(topic, k -> new HashMap<>()).put(partition, brokerId);
        return epoch.incrementAndGet();
    }

    public synchronized Integer leaderOf(String topic, int partition) {
        Map<Integer, Integer> m = leaderByPartition.get(topic);
        return m == null ? null : m.get(partition);
    }

    public synchronized List<Map.Entry<String, Integer>> partitions() {
        List<Map.Entry<String, Integer>> out = new ArrayList<>();
        for (var e : leaderByPartition.entrySet()) {
            for (var p : e.getValue().entrySet()) {
                out.add(Map.entry(e.getKey(), p.getKey()));
            }
        }
        return out;
    }
}
