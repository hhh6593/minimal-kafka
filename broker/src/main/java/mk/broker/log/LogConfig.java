package mk.broker.log;

/**
 * Broker-level log config. v2: segment size + flush policy. v13: retention enforcement.
 * Defaults preserve earlier-version behavior where sensible (e.g., "in memory" by default
 * until a scenario opts into segmented logs).
 */
public record LogConfig(
        Storage storage,
        java.nio.file.Path dataDir,
        int segmentBytes,
        int flushEveryNMessages,
        boolean flushOnClose) {

    public enum Storage { IN_MEMORY, SEGMENTED }

    public static LogConfig inMemory() {
        return new LogConfig(Storage.IN_MEMORY, null, 0, Integer.MAX_VALUE, true);
    }

    public static LogConfig segmented(java.nio.file.Path dir, int segBytes) {
        return new LogConfig(Storage.SEGMENTED, dir, segBytes, Integer.MAX_VALUE, true);
    }

    public LogConfig withFlushEvery(int n) {
        return new LogConfig(storage, dataDir, segmentBytes, n, flushOnClose);
    }

    public LogConfig withFlushOnClose(boolean on) {
        return new LogConfig(storage, dataDir, segmentBytes, flushEveryNMessages, on);
    }
}
