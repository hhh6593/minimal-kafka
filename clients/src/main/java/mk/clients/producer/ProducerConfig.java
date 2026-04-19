package mk.clients.producer;

/**
 * Producer tuning knobs. Names echo real Kafka ProducerConfig keys.
 *
 * Applicable version highlights:
 *  - v3: {@code partitioner}, {@code partitionCount}
 *  - v4: {@code acks}, {@code lingerMs}, {@code batchSize}, {@code retries}
 *  - v5: {@code enableIdempotence}
 */
public final class ProducerConfig {
    public String host = "127.0.0.1";
    public int port = 9092;

    public int partitionCount = 1;
    public Partitioner partitioner = new Partitioner.Default();

    public Acks acks = Acks.ONE;
    public long lingerMs = 0;
    public int batchSize = 16 * 1024;
    public int retries = 0;
    public long retryBackoffMs = 100;

    public boolean enableIdempotence = false;
    public int maxInFlightRequestsPerConnection = 5;

    public enum Acks {
        NONE(0), ONE(1), ALL(-1);
        public final int wire;
        Acks(int w) { this.wire = w; }
    }

    public ProducerConfig host(String h) { this.host = h; return this; }
    public ProducerConfig port(int p) { this.port = p; return this; }
    public ProducerConfig partitions(int n) { this.partitionCount = n; return this; }
    public ProducerConfig partitioner(Partitioner p) { this.partitioner = p; return this; }
    public ProducerConfig acks(Acks a) { this.acks = a; return this; }
    public ProducerConfig lingerMs(long ms) { this.lingerMs = ms; return this; }
    public ProducerConfig batchSize(int b) { this.batchSize = b; return this; }
    public ProducerConfig retries(int r) { this.retries = r; return this; }
    public ProducerConfig idempotence(boolean on) { this.enableIdempotence = on; return this; }
}
