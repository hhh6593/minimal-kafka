package mk.clients.producer;

public record RecordMetadata(String topic, int partition, long offset) {}
