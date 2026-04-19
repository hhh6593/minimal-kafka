package mk.broker.log;

import java.io.IOException;
import java.util.List;

/**
 * Partition log. v1: in-memory. v2: segmented file. Interface added in v2 so the broker
 * can be configured between the two for pedagogy / scenario reproduction.
 */
public interface Log extends AutoCloseable {

    record LogRecord(long offset, long timestamp, byte[] key, byte[] value) {}

    /** Append a batch atomically. Returns base offset of the first record in the batch. */
    long append(List<Batch.Entry> batch) throws IOException;

    /** Read up to maxRecords starting at fromOffset (inclusive). Empty list if nothing available. */
    List<LogRecord> read(long fromOffset, int maxRecords) throws IOException;

    /** One past the last durable offset (or in-memory logical end for v1). */
    long logEndOffset();

    /** Force outstanding writes to disk. No-op for in-memory. */
    default void flush() throws IOException {}

    /** Simulate an unclean close: skip flush, release resources without syncing. v2 scenario hook. */
    default void uncleanClose() throws IOException { close(); }

    @Override
    default void close() throws IOException {}
}
