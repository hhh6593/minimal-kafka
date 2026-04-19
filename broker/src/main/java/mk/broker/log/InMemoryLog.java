package mk.broker.log;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;

/**
 * v1 per-partition log. In-memory, append-only, monotonic offset starting at 0.
 *
 * v2 replaces this with segment files on disk + offset index.
 * Real kafka: {@code kafka.log.UnifiedLog}.
 */
public final class InMemoryLog implements Log {

    private final ReentrantLock lock = new ReentrantLock();
    private final List<LogRecord> records = new ArrayList<>();

    /** @return base offset of the first appended record in this batch */
    @Override
    public long append(List<Batch.Entry> batch) {
        lock.lock();
        try {
            long base = records.size();
            long now = System.currentTimeMillis();
            for (Batch.Entry e : batch) {
                records.add(new LogRecord(records.size(), now, e.key(), e.value()));
            }
            return base;
        } finally {
            lock.unlock();
        }
    }

    /** Return up to {@code maxRecords} records starting at {@code fromOffset}. */
    @Override
    public List<LogRecord> read(long fromOffset, int maxRecords) {
        lock.lock();
        try {
            if (fromOffset >= records.size()) return Collections.emptyList();
            int from = (int) Math.max(0, fromOffset);
            int to = Math.min(records.size(), from + maxRecords);
            return new ArrayList<>(records.subList(from, to));
        } finally {
            lock.unlock();
        }
    }

    @Override
    public long logEndOffset() {
        lock.lock();
        try { return records.size(); } finally { lock.unlock(); }
    }
}
