package mk.broker.api;

/**
 * Runtime toggles used by the scenarios package to inject failures / odd behaviors
 * without rewriting the broker. Every field is a knob that a vN.md document describes.
 *
 * Intentionally a plain mutable struct — scenarios manipulate it directly.
 */
public final class BrokerToggles {
    // v15-2 KRaft zombie controller: if true the "controller" keeps serving stale metadata
    public volatile boolean zombieControllerStaleMetadata = false;
    public volatile int     staleMetadataLeaderBrokerId  = -1;

    // v15-3 stale broker epoch ISR join enforcement (KIP-903)
    public volatile boolean enforceBrokerEpochOnIsrJoin = false;

    // v15-4 idempotent producer seq reset bug (KAFKA-12152)
    //   false (default) reproduces the bug: sequence NOT reset on epoch bump for
    //   partitions without in-flight batches.
    public volatile boolean resetSequenceOnEpochBumpForAllPartitions = true;

    // v15-5 tiered storage cold read latency injection
    public volatile long coldReadDelayMs = 0;
    public volatile long coldReadBoundaryOffset = 0; // offsets < boundary are "cold"

    // v15-6 fetch session cache slots
    public volatile int fetchSessionCacheSlots = 1024;

    // v11 unclean.leader.election.enable
    public volatile boolean uncleanLeaderElectionEnable = true;

    // v14 rate limit / quota (bytes per sec, -1 = unlimited)
    public volatile long producerQuotaBytesPerSec = -1L;

    // v14 fetch.max.bytes head-of-line demonstration cap
    public volatile int fetchMaxBytes = Integer.MAX_VALUE;

    // v13 compaction dirty ratio threshold
    public volatile double compactionMinDirtyRatio = 0.5;
}
