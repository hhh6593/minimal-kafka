package mk.broker.log;

/**
 * Per-topic config introduced in v3 (partition count) and extended in later versions
 * (retention, compaction, min.insync.replicas, cleanup.policy, ...).
 */
public record TopicConfig(
        String name,
        int partitionCount,
        int replicationFactor,
        // v13 retention
        long retentionBytes,
        long retentionMs,
        CleanupPolicy cleanupPolicy,
        // v10 ISR
        int minInSyncReplicas) {

    public enum CleanupPolicy { DELETE, COMPACT }

    public static TopicConfig defaults(String name, int partitions) {
        return new TopicConfig(name, partitions, 1,
                -1L, -1L, CleanupPolicy.DELETE, 1);
    }
}
