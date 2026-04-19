package mk.broker.config;

import mk.broker.log.LogConfig;

/**
 * Broker config. Keeps only what the broker itself needs — per-topic concerns (partition count,
 * retention, cleanup policy) live on {@link mk.broker.log.TopicConfig}.
 */
public record KafkaConfig(
        int brokerId,
        String host,
        int port,
        int numIoThreads,
        LogConfig logConfig) {

    public static KafkaConfig defaults() {
        return new KafkaConfig(1, "127.0.0.1", 9092, 64, LogConfig.inMemory());
    }

    public KafkaConfig withNumIoThreads(int n) {
        return new KafkaConfig(brokerId, host, port, n, logConfig);
    }

    public KafkaConfig withPort(int p) {
        return new KafkaConfig(brokerId, host, p, numIoThreads, logConfig);
    }

    public KafkaConfig withLogConfig(LogConfig lc) {
        return new KafkaConfig(brokerId, host, port, numIoThreads, lc);
    }

    public KafkaConfig withBrokerId(int id) {
        return new KafkaConfig(id, host, port, numIoThreads, logConfig);
    }
}
