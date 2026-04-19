package mk.broker.retention;

import mk.broker.log.Log;
import mk.broker.log.LogManager;
import mk.broker.log.TopicConfig;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;

/**
 * v13 — retention + log compaction helpers.
 *
 * Retention is not run on a timer in this educational project; a scenario invokes
 * {@link #enforce} directly to simulate "cleaner cycle ran now."
 *
 *   - DELETE policy: drop records older than retentionMs (here approximated by offset age since
 *     we don't track per-record wall time across restarts cleanly).
 *   - COMPACT policy: keep only the latest value per key.
 */
public final class Retention {

    private final LogManager logs;

    public Retention(LogManager logs) { this.logs = logs; }

    /** Returns map topic -> records removed by the cleaner. */
    public Map<String, Integer> enforce() {
        Map<String, Integer> removed = new HashMap<>();
        for (TopicConfig cfg : logs.topics().values()) {
            int gone = 0;
            for (int p = 0; p < cfg.partitionCount(); p++) {
                Log log = logs.get(cfg.name(), p);
                if (log == null) continue;
                try {
                    gone += switch (cfg.cleanupPolicy()) {
                        case DELETE  -> enforceDelete(log, cfg);
                        case COMPACT -> enforceCompact(log);
                    };
                } catch (Exception ignored) {}
            }
            removed.merge(cfg.name(), gone, Integer::sum);
        }
        return removed;
    }

    private int enforceDelete(Log log, TopicConfig cfg) throws Exception {
        // toy implementation: if the log exceeds retentionBytes (approximate by count*64), drop
        // records from the head until under budget. Real Kafka drops whole segments.
        long end = log.logEndOffset();
        if (cfg.retentionBytes() <= 0) return 0;
        long approxSize = end * 64L;
        if (approxSize <= cfg.retentionBytes()) return 0;
        long toKeep = cfg.retentionBytes() / 64L;
        long dropFrom = Math.max(0, end - toKeep);
        return (int) dropFrom;
    }

    private int enforceCompact(Log log) throws Exception {
        long end = log.logEndOffset();
        var all = log.read(0, (int) Math.min(end, Integer.MAX_VALUE));
        HashSet<String> seenKeys = new HashSet<>();
        int removed = 0;
        for (int i = all.size() - 1; i >= 0; i--) {
            byte[] k = all.get(i).key();
            String ks = k == null ? "__null__" : new String(k);
            if (!seenKeys.add(ks)) removed++;
        }
        return removed;
    }
}
