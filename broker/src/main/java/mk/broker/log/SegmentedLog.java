package mk.broker.log;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;

/**
 * v2 per-partition log: append-only file segments with a simple sparse offset index.
 *
 * On-disk layout per partition directory:
 *   0000000000.log   record stream, base offset encoded in filename
 *   0000000000.idx   sparse index { relativeOffset (int) | fileOffset (int) } entries
 *   0000000512.log   next segment (rolled when current exceeds segmentBytes)
 *   ...
 *
 * Record format on wire (little-endian via DataOutputStream defaults = big-endian):
 *   long  offset
 *   long  timestamp
 *   int   keyLen   ( -1 means null key)
 *   byte[] key
 *   int   valueLen
 *   byte[] value
 *
 * This is not Kafka's record format — it's the educational analogue.
 * Real kafka: {@code kafka.log.LogSegment}, {@code kafka.log.OffsetIndex}, {@code UnifiedLog}.
 */
public final class SegmentedLog implements Log {

    private static final int INDEX_INTERVAL_BYTES = 4096;

    private final ReentrantLock lock = new ReentrantLock();
    private final Path dir;
    private final int segmentBytes;
    private final int flushEveryNMessages;
    private final boolean flushOnClose;

    private final List<Segment> segments = new ArrayList<>();
    private long logEnd; // one past the last appended offset
    private int pendingSinceFlush = 0;

    public SegmentedLog(Path dir, int segmentBytes, int flushEveryNMessages, boolean flushOnClose)
            throws IOException {
        this.dir = dir;
        this.segmentBytes = segmentBytes;
        this.flushEveryNMessages = Math.max(1, flushEveryNMessages);
        this.flushOnClose = flushOnClose;
        Files.createDirectories(dir);
        loadExistingSegments();
    }

    private void loadExistingSegments() throws IOException {
        if (!Files.exists(dir)) return;
        List<Path> logs;
        try (var s = Files.list(dir)) {
            logs = s.filter(p -> p.getFileName().toString().endsWith(".log"))
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .toList();
        }
        for (Path log : logs) {
            String name = log.getFileName().toString();
            long base = Long.parseLong(name.substring(0, name.length() - 4));
            Path idx = dir.resolve(String.format("%010d.idx", base));
            Segment seg = Segment.open(log, idx, base);
            segments.add(seg);
        }
        if (segments.isEmpty()) {
            segments.add(Segment.create(dir, 0L));
            logEnd = 0L;
        } else {
            Segment last = segments.get(segments.size() - 1);
            logEnd = last.scanLogEnd();
        }
    }

    @Override
    public long append(List<Batch.Entry> batch) throws IOException {
        lock.lock();
        try {
            long base = logEnd;
            long now = System.currentTimeMillis();
            Segment active = activeSegment();
            for (Batch.Entry e : batch) {
                byte[] buf = encode(logEnd, now, e.key(), e.value());
                if (active.size() + buf.length > segmentBytes && active.size() > 0) {
                    Segment rolled = Segment.create(dir, logEnd);
                    segments.add(rolled);
                    active = rolled;
                }
                active.append(logEnd, buf);
                logEnd++;
                pendingSinceFlush++;
            }
            if (pendingSinceFlush >= flushEveryNMessages) {
                active.flush();
                pendingSinceFlush = 0;
            }
            return base;
        } finally {
            lock.unlock();
        }
    }

    @Override
    public List<LogRecord> read(long fromOffset, int maxRecords) throws IOException {
        lock.lock();
        try {
            List<LogRecord> out = new ArrayList<>();
            if (fromOffset >= logEnd) return out;

            int segIdx = findSegment(fromOffset);
            long cursor = fromOffset;
            while (out.size() < maxRecords && segIdx < segments.size()) {
                Segment seg = segments.get(segIdx);
                int pos = seg.positionFor(cursor);
                byte[] bytes = seg.readFrom(pos);
                DataInputStream in = new DataInputStream(new java.io.ByteArrayInputStream(bytes));
                while (in.available() > 0 && out.size() < maxRecords) {
                    LogRecord rec = decode(in);
                    if (rec.offset() >= cursor) out.add(rec);
                    if (out.size() == maxRecords) return out;
                    cursor = rec.offset() + 1;
                }
                segIdx++;
            }
            return out;
        } finally {
            lock.unlock();
        }
    }

    @Override
    public long logEndOffset() {
        lock.lock();
        try { return logEnd; } finally { lock.unlock(); }
    }

    @Override
    public void flush() throws IOException {
        lock.lock();
        try {
            activeSegment().flush();
            pendingSinceFlush = 0;
        } finally {
            lock.unlock();
        }
    }

    @Override
    public void close() throws IOException {
        lock.lock();
        try {
            if (flushOnClose) {
                for (Segment s : segments) s.flush();
            }
            for (Segment s : segments) s.close();
        } finally {
            lock.unlock();
        }
    }

    @Override
    public void uncleanClose() throws IOException {
        lock.lock();
        try {
            // deliberately skip flush to simulate crash / SIGKILL with data only in page cache
            for (Segment s : segments) s.close();
        } finally {
            lock.unlock();
        }
    }

    private Segment activeSegment() {
        return segments.get(segments.size() - 1);
    }

    private int findSegment(long offset) {
        for (int i = segments.size() - 1; i >= 0; i--) {
            if (segments.get(i).baseOffset() <= offset) return i;
        }
        return 0;
    }

    // ---------------- encoding ----------------

    private static byte[] encode(long offset, long ts, byte[] key, byte[] value) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream(32 + (value == null ? 0 : value.length));
        DataOutputStream out = new DataOutputStream(baos);
        out.writeLong(offset);
        out.writeLong(ts);
        if (key == null) out.writeInt(-1);
        else { out.writeInt(key.length); out.write(key); }
        int vl = value == null ? 0 : value.length;
        out.writeInt(vl);
        if (vl > 0) out.write(value);
        return baos.toByteArray();
    }

    private static LogRecord decode(DataInputStream in) throws IOException {
        long offset = in.readLong();
        long ts = in.readLong();
        int kl = in.readInt();
        byte[] key = null;
        if (kl >= 0) {
            key = new byte[kl];
            in.readFully(key);
        }
        int vl = in.readInt();
        byte[] val = new byte[vl];
        if (vl > 0) in.readFully(val);
        return new LogRecord(offset, ts, key, val);
    }

    // ---------------- segment ----------------

    static final class Segment {
        private final long baseOffset;
        private final Path logPath;
        private final Path idxPath;
        private final FileChannel logCh;
        private int size;
        private int lastIndexedBytes = 0;

        // sparse index in memory; flushed to disk on close
        private final List<int[]> index = new ArrayList<>(); // {relOffset, fileOffset}

        private Segment(long baseOffset, Path logPath, Path idxPath, FileChannel logCh, int size) {
            this.baseOffset = baseOffset;
            this.logPath = logPath;
            this.idxPath = idxPath;
            this.logCh = logCh;
            this.size = size;
        }

        static Segment create(Path dir, long baseOffset) throws IOException {
            Path log = dir.resolve(String.format("%010d.log", baseOffset));
            Path idx = dir.resolve(String.format("%010d.idx", baseOffset));
            Files.deleteIfExists(log);
            Files.deleteIfExists(idx);
            FileChannel ch = FileChannel.open(log, StandardOpenOption.CREATE, StandardOpenOption.READ,
                    StandardOpenOption.WRITE);
            return new Segment(baseOffset, log, idx, ch, 0);
        }

        static Segment open(Path log, Path idx, long baseOffset) throws IOException {
            FileChannel ch = FileChannel.open(log, StandardOpenOption.READ, StandardOpenOption.WRITE);
            int sz = (int) ch.size();
            ch.position(sz);
            Segment s = new Segment(baseOffset, log, idx, ch, sz);
            if (Files.exists(idx)) {
                byte[] raw = Files.readAllBytes(idx);
                ByteBuffer bb = ByteBuffer.wrap(raw);
                while (bb.remaining() >= 8) {
                    s.index.add(new int[]{bb.getInt(), bb.getInt()});
                }
            }
            return s;
        }

        void append(long offset, byte[] bytes) throws IOException {
            int before = size;
            logCh.write(ByteBuffer.wrap(bytes));
            size += bytes.length;
            if (before - lastIndexedBytes >= INDEX_INTERVAL_BYTES || index.isEmpty()) {
                index.add(new int[]{(int) (offset - baseOffset), before});
                lastIndexedBytes = before;
            }
        }

        int positionFor(long offset) {
            int pos = 0;
            int relOff = (int) (offset - baseOffset);
            for (int[] e : index) {
                if (e[0] <= relOff) pos = e[1];
                else break;
            }
            return pos;
        }

        byte[] readFrom(int position) throws IOException {
            int remaining = size - position;
            if (remaining <= 0) return new byte[0];
            ByteBuffer buf = ByteBuffer.allocate(remaining);
            logCh.read(buf, position);
            buf.flip();
            byte[] bytes = new byte[buf.remaining()];
            buf.get(bytes);
            return bytes;
        }

        long scanLogEnd() throws IOException {
            if (size == 0) return baseOffset;
            byte[] all = readFrom(0);
            DataInputStream in = new DataInputStream(new java.io.ByteArrayInputStream(all));
            long lastOffset = baseOffset - 1;
            while (in.available() > 0) {
                long off = in.readLong();
                in.readLong(); // ts
                int kl = in.readInt();
                if (kl > 0) in.skipBytes(kl);
                int vl = in.readInt();
                if (vl > 0) in.skipBytes(vl);
                lastOffset = off;
            }
            return lastOffset + 1;
        }

        void flush() throws IOException {
            logCh.force(false);
            // persist sparse index on each flush
            ByteBuffer bb = ByteBuffer.allocate(index.size() * 8);
            for (int[] e : index) { bb.putInt(e[0]); bb.putInt(e[1]); }
            bb.flip();
            Files.write(idxPath, Arrays.copyOf(bb.array(), bb.limit()));
        }

        void close() throws IOException {
            logCh.close();
        }

        int size() { return size; }
        long baseOffset() { return baseOffset; }
    }
}
