package mk.clients.consumer;

/**
 * Consumer tuning knobs. Keys echo real Kafka ConsumerConfig.
 *
 * Version highlights:
 *  - v6: {@link #sessionTimeoutMs}, {@link #maxPollIntervalMs}, {@link #heartbeatIntervalMs}
 *  - v7: {@link #groupId}, {@link #groupInstanceId}
 *  - v8: {@link #assignor}
 *  - v9: {@link #enableAutoCommit}, {@link #autoCommitIntervalMs}
 */
public final class ConsumerConfig {
    public String host = "127.0.0.1";
    public int port = 9092;

    public String groupId;
    public String groupInstanceId; // static membership (KIP-345)
    public java.util.List<String> subscription = java.util.List.of();

    public long sessionTimeoutMs = 30_000;
    public long heartbeatIntervalMs = 3_000;
    public long maxPollIntervalMs = 300_000;
    public long maxPollRecords = 500;

    public Assignor assignor = Assignor.RANGE;

    public boolean enableAutoCommit = true;
    public long autoCommitIntervalMs = 5_000;

    public enum Assignor { RANGE, ROUND_ROBIN, STICKY, COOPERATIVE_STICKY }

    public ConsumerConfig host(String h) { this.host = h; return this; }
    public ConsumerConfig port(int p) { this.port = p; return this; }
    public ConsumerConfig group(String g) { this.groupId = g; return this; }
    public ConsumerConfig staticId(String id) { this.groupInstanceId = id; return this; }
    public ConsumerConfig subscribe(String... topics) { this.subscription = java.util.List.of(topics); return this; }
    public ConsumerConfig sessionTimeout(long ms) { this.sessionTimeoutMs = ms; return this; }
    public ConsumerConfig heartbeat(long ms) { this.heartbeatIntervalMs = ms; return this; }
    public ConsumerConfig maxPollInterval(long ms) { this.maxPollIntervalMs = ms; return this; }
    public ConsumerConfig assignor(Assignor a) { this.assignor = a; return this; }
    public ConsumerConfig autoCommit(boolean on) { this.enableAutoCommit = on; return this; }
}
