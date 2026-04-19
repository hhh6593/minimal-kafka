package mk.broker.producer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import mk.broker.protocol.ApiKeys;
import mk.broker.protocol.Wire;

import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * v5+ idempotent producer state.
 *
 * Real kafka tracks PID/epoch/lastSeq per (TopicPartition) inside {@code ProducerStateManager};
 * here we keep the same keying. We also simulate KAFKA-12152 (seq reset gap) via a toggle from
 * {@link mk.broker.api.BrokerToggles#resetSequenceOnEpochBumpForAllPartitions}.
 */
public final class ProducerStateManager {

    public record PidEpoch(long pid, int epoch) {}
    public record PartitionKey(long pid, String topic, int partition) {}

    public record Check(boolean ok, String error) {
        public static Check pass() { return new Check(true, null); }
        public static Check err(String e) { return new Check(false, e); }
    }

    private final AtomicLong pidAllocator = new AtomicLong(1000);
    private final Map<Long, Integer> epochByPid = new ConcurrentHashMap<>();
    private final Map<PartitionKey, Integer> lastSeq = new ConcurrentHashMap<>();

    public JsonNode handleInitProducerId(JsonNode req) {
        long pid = pidAllocator.incrementAndGet();
        int epoch = 0;
        epochByPid.put(pid, epoch);
        ObjectNode resp = Wire.JSON.createObjectNode();
        resp.put("ok", true);
        resp.put("api", ApiKeys.INIT_PRODUCER_ID);
        resp.put("producerId", pid);
        resp.put("producerEpoch", epoch);
        return resp;
    }

    /** Called by ApiHandler to validate a PRODUCE request with PID/epoch/seq. */
    public Check check(long pid, int epoch, String topic, int partition, int baseSeq, int count) {
        Integer current = epochByPid.get(pid);
        if (current == null) return Check.err("UNKNOWN_PRODUCER_ID");
        if (!Objects.equals(current, epoch)) return Check.err("INVALID_PRODUCER_EPOCH");
        Integer expected = lastSeq.get(new PartitionKey(pid, topic, partition));
        int expect = (expected == null) ? 0 : expected + 1;
        if (baseSeq != expect) return Check.err("OUT_OF_ORDER_SEQUENCE_NUMBER expected=" + expect + " got=" + baseSeq);
        return Check.pass();
    }

    public void advance(long pid, String topic, int partition, int baseSeq, int count) {
        lastSeq.put(new PartitionKey(pid, topic, partition), baseSeq + count - 1);
    }

    /**
     * Simulate the KAFKA-12152 behavior. When {@code resetAll} is true (fix), all sequences
     * for the PID are cleared on epoch bump. When false (pre-fix), only partitions listed in
     * {@code withInFlight} are reset; others keep stale seq.
     */
    public void bumpEpoch(long pid, java.util.Set<String> withInFlight, boolean resetAll) {
        int e = epochByPid.getOrDefault(pid, 0) + 1;
        epochByPid.put(pid, e);
        if (resetAll) {
            lastSeq.entrySet().removeIf(en -> en.getKey().pid() == pid);
        } else {
            lastSeq.entrySet().removeIf(en -> en.getKey().pid() == pid
                    && withInFlight.contains(en.getKey().topic() + ":" + en.getKey().partition()));
        }
    }

    public int currentEpoch(long pid) { return epochByPid.getOrDefault(pid, -1); }
    public Integer lastSeq(long pid, String topic, int partition) {
        return lastSeq.get(new PartitionKey(pid, topic, partition));
    }
}
