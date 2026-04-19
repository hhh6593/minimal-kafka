package mk.broker.log;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages per-topic / per-partition logs.
 *
 * v1 (defaults): in-memory, auto-create topic with 1 partition on first produce.
 * v3+: explicit {@code createTopic(TopicConfig)} with partition count.
 * v2+: {@link LogConfig.Storage#SEGMENTED} routes to {@link SegmentedLog}.
 */
public final class LogManager {

    private static final Logger LOG = LoggerFactory.getLogger(LogManager.class);

    public record TopicPartition(String topic, int partition) {}

    private final LogConfig logConfig;
    private final Map<String, TopicConfig> topics = new ConcurrentHashMap<>();
    private final Map<TopicPartition, Log> logs = new ConcurrentHashMap<>();

    public LogManager() {
        this(LogConfig.inMemory());
    }

    public LogManager(LogConfig logConfig) {
        this.logConfig = logConfig;
        if (logConfig.storage() == LogConfig.Storage.SEGMENTED) {
            loadFromDisk();
        }
    }

    private void loadFromDisk() {
        java.nio.file.Path root = logConfig.dataDir();
        if (root == null || !java.nio.file.Files.isDirectory(root)) return;
        try (var stream = java.nio.file.Files.list(root)) {
            stream.filter(java.nio.file.Files::isDirectory).forEach(dir -> {
                String name = dir.getFileName().toString();
                int dash = name.lastIndexOf('-');
                if (dash <= 0) return;
                try {
                    String topic = name.substring(0, dash);
                    int partition = Integer.parseInt(name.substring(dash + 1));
                    TopicConfig cur = topics.get(topic);
                    int count = (cur == null) ? partition + 1 : Math.max(cur.partitionCount(), partition + 1);
                    topics.put(topic, TopicConfig.defaults(topic, count));
                    logs.computeIfAbsent(new TopicPartition(topic, partition), k -> newLog(k));
                } catch (NumberFormatException ignored) {}
            });
        } catch (IOException e) {
            LOG.warn("failed to scan data dir {}", root, e);
        }
    }

    public TopicConfig createTopic(TopicConfig cfg) {
        TopicConfig prev = topics.putIfAbsent(cfg.name(), cfg);
        return prev == null ? cfg : prev;
    }

    public TopicConfig topicConfig(String name) {
        return topics.get(name);
    }

    public Log getOrCreate(String topic, int partition) {
        TopicConfig cfg = topics.computeIfAbsent(topic, n -> TopicConfig.defaults(n, 1));
        if (partition < 0) throw new IllegalArgumentException("partition < 0");
        if (partition >= cfg.partitionCount()) {
            if (partition > 0) {
                // auto-grow only when the topic was auto-created in v1 mode (single partition)
                TopicConfig grown = TopicConfig.defaults(topic, partition + 1);
                topics.put(topic, grown);
                cfg = grown;
            }
        }
        return logs.computeIfAbsent(new TopicPartition(topic, partition), k -> newLog(k));
    }

    public Log get(String topic, int partition) {
        return logs.get(new TopicPartition(topic, partition));
    }

    private Log newLog(TopicPartition tp) {
        try {
            return switch (logConfig.storage()) {
                case IN_MEMORY -> new InMemoryLog();
                case SEGMENTED -> {
                    Path dir = logConfig.dataDir().resolve(tp.topic() + "-" + tp.partition());
                    yield new SegmentedLog(dir, logConfig.segmentBytes(),
                            logConfig.flushEveryNMessages(), logConfig.flushOnClose());
                }
            };
        } catch (IOException e) {
            throw new RuntimeException("failed to create log for " + tp, e);
        }
    }

    public Map<String, TopicConfig> topics() {
        return Map.copyOf(topics);
    }

    public void close() {
        for (Log l : logs.values()) {
            try { l.close(); } catch (Exception e) { LOG.warn("close failed", e); }
        }
    }

    /** v2 scenario hook: simulate unclean shutdown — skip fsync. */
    public void uncleanClose() {
        for (Log l : logs.values()) {
            try { l.uncleanClose(); } catch (Exception e) { LOG.warn("unclean close failed", e); }
        }
    }

    public LogConfig logConfig() { return logConfig; }
}
