package mk.broker.offset;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import mk.broker.protocol.ApiKeys;
import mk.broker.protocol.Wire;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * v9+ in-memory offset store. Analogue of the {@code __consumer_offsets} compacted topic in real
 * Kafka. Keyed by (groupId, topic, partition).
 */
public final class OffsetStore {

    public record Key(String group, String topic, int partition) {}

    private final Map<Key, Long> offsets = new ConcurrentHashMap<>();

    public JsonNode handleCommit(JsonNode req) {
        String group = req.get("groupId").asText();
        for (JsonNode e : req.withArray("offsets")) {
            offsets.put(new Key(group, e.get("topic").asText(), e.get("partition").asInt()),
                    e.get("offset").asLong());
        }
        ObjectNode resp = Wire.JSON.createObjectNode();
        resp.put("ok", true);
        resp.put("api", ApiKeys.OFFSET_COMMIT);
        return resp;
    }

    public JsonNode handleFetch(JsonNode req) {
        String group = req.get("groupId").asText();
        ObjectNode resp = Wire.JSON.createObjectNode();
        resp.put("ok", true);
        resp.put("api", ApiKeys.OFFSET_FETCH);
        ArrayNode arr = resp.putArray("offsets");
        for (JsonNode e : req.withArray("partitions")) {
            String topic = e.get("topic").asText();
            int part = e.get("partition").asInt();
            Long off = offsets.get(new Key(group, topic, part));
            ObjectNode o = arr.addObject();
            o.put("topic", topic);
            o.put("partition", part);
            o.put("offset", off == null ? -1L : off);
        }
        return resp;
    }

    public Long read(String group, String topic, int partition) {
        return offsets.get(new Key(group, topic, partition));
    }
}
