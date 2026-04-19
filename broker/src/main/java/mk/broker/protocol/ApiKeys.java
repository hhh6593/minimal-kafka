package mk.broker.protocol;

/**
 * v1 API keys. Real Kafka uses short ints; we use string tags over JSON for readability.
 * Binary protocol arrives in v4.
 */
public final class ApiKeys {
    private ApiKeys() {}

    public static final String PRODUCE = "PRODUCE";
    public static final String FETCH   = "FETCH";
    public static final String METADATA = "METADATA";
    public static final String CREATE_TOPIC = "CREATE_TOPIC";

    // v7+ consumer group coordination
    public static final String FIND_COORDINATOR = "FIND_COORDINATOR";
    public static final String JOIN_GROUP       = "JOIN_GROUP";
    public static final String SYNC_GROUP       = "SYNC_GROUP";
    public static final String HEARTBEAT        = "HEARTBEAT";
    public static final String LEAVE_GROUP      = "LEAVE_GROUP";

    // v9+ offset store
    public static final String OFFSET_COMMIT = "OFFSET_COMMIT";
    public static final String OFFSET_FETCH  = "OFFSET_FETCH";

    // v5+ idempotent producer
    public static final String INIT_PRODUCER_ID = "INIT_PRODUCER_ID";
}
