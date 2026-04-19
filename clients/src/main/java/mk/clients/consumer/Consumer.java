package mk.clients.consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import mk.broker.protocol.ApiKeys;
import mk.broker.protocol.Wire;
import mk.clients.common.WireClient;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/**
 * v1 consumer: caller-driven offset tracking, no group, no auto commit, no rebalance.
 * Subscribes to a single (topic, partition) and pulls from a caller-supplied offset.
 * Consumer groups arrive in v7.
 */
public final class Consumer implements AutoCloseable {

    private final WireClient client;
    private final String topic;
    private final int partition;
    private long nextOffset;

    public Consumer(String host, int port, String topic, int partition, long startOffset) throws IOException {
        this.client = new WireClient(host, port);
        this.topic = topic;
        this.partition = partition;
        this.nextOffset = startOffset;
    }

    public List<ConsumerRecord> poll(int maxRecords) throws IOException {
        ObjectNode req = Wire.JSON.createObjectNode();
        req.put("api", ApiKeys.FETCH);
        req.put("topic", topic);
        req.put("partition", partition);
        req.put("offset", nextOffset);
        req.put("maxRecords", maxRecords);

        JsonNode resp = client.send(req);
        if (!resp.path("ok").asBoolean()) {
            throw new IOException("broker error: " + resp.path("error").asText());
        }

        List<ConsumerRecord> out = new ArrayList<>();
        for (JsonNode r : resp.withArray("records")) {
            byte[] key = r.hasNonNull("key") ? Base64.getDecoder().decode(r.get("key").asText()) : null;
            byte[] val = Base64.getDecoder().decode(r.get("value").asText());
            ConsumerRecord rec = new ConsumerRecord(
                    topic, partition, r.get("offset").asLong(), r.get("timestamp").asLong(), key, val);
            out.add(rec);
            nextOffset = rec.offset() + 1;
        }
        return out;
    }

    public long position() { return nextOffset; }
    public void seek(long offset) { this.nextOffset = offset; }

    @Override
    public void close() throws IOException {
        client.close();
    }
}
