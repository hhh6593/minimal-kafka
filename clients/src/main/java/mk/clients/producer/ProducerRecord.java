package mk.clients.producer;

/**
 * v3+ record. Partition is optional ({@code -1} = ask partitioner).
 */
public record ProducerRecord(String topic, int partition, byte[] key, byte[] value) {

    public static ProducerRecord of(String topic, String value) {
        return new ProducerRecord(topic, -1, null, value.getBytes());
    }

    public static ProducerRecord of(String topic, String key, String value) {
        return new ProducerRecord(topic, -1, key.getBytes(), value.getBytes());
    }

    public static ProducerRecord toPartition(String topic, int partition, String value) {
        return new ProducerRecord(topic, partition, null, value.getBytes());
    }
}
