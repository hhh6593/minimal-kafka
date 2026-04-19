package mk.broker.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import mk.broker.coordinator.GroupCoordinator;
import mk.broker.log.Batch;
import mk.broker.log.Log;
import mk.broker.log.LogManager;
import mk.broker.log.TopicConfig;
import mk.broker.offset.OffsetStore;
import mk.broker.producer.ProducerStateManager;
import mk.broker.protocol.ApiKeys;
import mk.broker.protocol.Wire;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/**
 * Request router. Dispatches to the right subsystem handler.
 *
 * Request shape: every request is a JSON object with field "api" set to an {@link ApiKeys} value.
 * Responses always carry "ok" (boolean) and on failure "error" (string).
 */
public final class ApiHandler {

    private static final Logger LOG = LoggerFactory.getLogger(ApiHandler.class);

    private final LogManager logs;
    private final GroupCoordinator coordinator;
    private final OffsetStore offsets;
    private final ProducerStateManager producers;
    private final BrokerToggles toggles;

    public ApiHandler(LogManager logs) {
        this(logs, new GroupCoordinator(), new OffsetStore(), new ProducerStateManager(), new BrokerToggles());
    }

    public ApiHandler(LogManager logs,
                      GroupCoordinator coordinator,
                      OffsetStore offsets,
                      ProducerStateManager producers,
                      BrokerToggles toggles) {
        this.logs = logs;
        this.coordinator = coordinator;
        this.offsets = offsets;
        this.producers = producers;
        this.toggles = toggles;
    }

    public BrokerToggles toggles() { return toggles; }
    public GroupCoordinator coordinator() { return coordinator; }
    public OffsetStore offsetStore() { return offsets; }
    public ProducerStateManager producerState() { return producers; }

    public JsonNode handle(JsonNode req) {
        String api = req.path("api").asText("");
        try {
            return switch (api) {
                case ApiKeys.PRODUCE          -> handleProduce(req);
                case ApiKeys.FETCH            -> handleFetch(req);
                case ApiKeys.METADATA         -> handleMetadata();
                case ApiKeys.CREATE_TOPIC     -> handleCreateTopic(req);
                case ApiKeys.INIT_PRODUCER_ID -> producers.handleInitProducerId(req);
                case ApiKeys.FIND_COORDINATOR -> coordinator.handleFindCoordinator(req);
                case ApiKeys.JOIN_GROUP       -> coordinator.handleJoinGroup(req);
                case ApiKeys.SYNC_GROUP       -> coordinator.handleSyncGroup(req);
                case ApiKeys.HEARTBEAT        -> coordinator.handleHeartbeat(req);
                case ApiKeys.LEAVE_GROUP      -> coordinator.handleLeaveGroup(req);
                case ApiKeys.OFFSET_COMMIT    -> offsets.handleCommit(req);
                case ApiKeys.OFFSET_FETCH     -> offsets.handleFetch(req);
                default -> error("unknown api: " + api);
            };
        } catch (Exception ex) {
            LOG.error("handler failed for api={}", api, ex);
            return error(ex.getClass().getSimpleName() + ": " + ex.getMessage());
        }
    }

    // ---------------- produce / fetch ----------------

    private JsonNode handleProduce(JsonNode req) throws Exception {
        String topic = req.get("topic").asText();
        int partition = req.get("partition").asInt();
        ArrayNode recs = (ArrayNode) req.get("records");

        // v5 idempotence check
        long pid     = req.path("producerId").asLong(-1L);
        int  epoch   = req.path("producerEpoch").asInt(-1);
        int  baseSeq = req.path("baseSequence").asInt(-1);
        if (pid >= 0) {
            ProducerStateManager.Check ck = producers.check(pid, epoch, topic, partition, baseSeq, recs.size());
            if (!ck.ok()) return error(ck.error());
        }

        List<Batch.Entry> entries = new ArrayList<>(recs.size());
        for (JsonNode r : recs) {
            byte[] key = r.hasNonNull("key") ? Base64.getDecoder().decode(r.get("key").asText()) : null;
            byte[] val = Base64.getDecoder().decode(r.get("value").asText());
            entries.add(new Batch.Entry(key, val));
        }

        Log log = logs.getOrCreate(topic, partition);
        long baseOffset = log.append(entries);
        if (pid >= 0) producers.advance(pid, topic, partition, baseSeq, recs.size());

        ObjectNode resp = Wire.JSON.createObjectNode();
        resp.put("ok", true);
        resp.put("api", ApiKeys.PRODUCE);
        resp.put("topic", topic);
        resp.put("partition", partition);
        resp.put("baseOffset", baseOffset);
        resp.put("logEndOffset", log.logEndOffset());
        return resp;
    }

    private JsonNode handleFetch(JsonNode req) throws Exception {
        String topic = req.get("topic").asText();
        int partition = req.get("partition").asInt();
        long offset = req.get("offset").asLong();
        int max = req.hasNonNull("maxRecords") ? req.get("maxRecords").asInt() : 500;

        // v15-5: tiered-storage-style cold-read latency simulation
        long coldReadDelayMs = toggles.coldReadDelayMs;
        if (coldReadDelayMs > 0 && offset < toggles.coldReadBoundaryOffset) {
            try { Thread.sleep(coldReadDelayMs); } catch (InterruptedException ignored) {}
        }

        Log log = logs.get(topic, partition);
        ObjectNode resp = Wire.JSON.createObjectNode();
        resp.put("ok", true);
        resp.put("api", ApiKeys.FETCH);
        resp.put("topic", topic);
        resp.put("partition", partition);

        ArrayNode arr = resp.putArray("records");
        long hwm = 0;
        if (log != null) {
            hwm = log.logEndOffset();
            for (Log.LogRecord rec : log.read(offset, max)) {
                ObjectNode o = arr.addObject();
                o.put("offset", rec.offset());
                o.put("timestamp", rec.timestamp());
                if (rec.key() != null) o.put("key", Base64.getEncoder().encodeToString(rec.key()));
                o.put("value", Base64.getEncoder().encodeToString(rec.value()));
            }
        }
        resp.put("highWatermark", hwm);
        return resp;
    }

    // ---------------- topic metadata ----------------

    private JsonNode handleCreateTopic(JsonNode req) {
        String name = req.get("name").asText();
        int partitions = req.path("partitions").asInt(1);
        int rf = req.path("replicationFactor").asInt(1);
        TopicConfig cfg = new TopicConfig(name, partitions, rf, -1L, -1L,
                TopicConfig.CleanupPolicy.DELETE, 1);
        logs.createTopic(cfg);
        ObjectNode resp = Wire.JSON.createObjectNode();
        resp.put("ok", true);
        resp.put("api", ApiKeys.CREATE_TOPIC);
        resp.put("name", name);
        resp.put("partitions", partitions);
        return resp;
    }

    private JsonNode handleMetadata() {
        ObjectNode resp = Wire.JSON.createObjectNode();
        resp.put("ok", true);
        resp.put("api", ApiKeys.METADATA);
        ArrayNode arr = resp.putArray("topics");
        for (TopicConfig t : logs.topics().values()) {
            ObjectNode o = arr.addObject();
            o.put("name", t.name());
            o.put("partitions", t.partitionCount());
            o.put("replicationFactor", t.replicationFactor());
        }
        return resp;
    }

    private JsonNode error(String msg) {
        ObjectNode o = Wire.JSON.createObjectNode();
        o.put("ok", false);
        o.put("error", msg);
        return o;
    }
}
