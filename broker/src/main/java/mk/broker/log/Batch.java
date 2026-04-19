package mk.broker.log;

import java.util.List;

/** v1 batch type used by the produce path. */
public final class Batch {
    private Batch() {}

    public record Entry(byte[] key, byte[] value) {}

    public record Request(String topic, int partition, List<Entry> entries) {}
}
