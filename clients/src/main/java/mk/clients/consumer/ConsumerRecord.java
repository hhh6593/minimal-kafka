package mk.clients.consumer;

public record ConsumerRecord(
        String topic,
        int partition,
        long offset,
        long timestamp,
        byte[] key,
        byte[] value) {

    public String valueAsString() { return new String(value); }
    public String keyAsString()   { return key == null ? null : new String(key); }
}
