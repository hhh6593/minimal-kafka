package mk.clients.producer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import mk.broker.protocol.ApiKeys;
import mk.broker.protocol.Wire;
import mk.clients.common.WireClient;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Producer. Feature timeline:
 *  - v1: sync, one record per PRODUCE request.
 *  - v3: honors {@link ProducerRecord#partition()} or falls through the {@link Partitioner}.
 *  - v4: optional batching via {@link ProducerConfig#lingerMs}/{@code batchSize}; acks; retries.
 *  - v5: idempotence (PID/epoch/per-partition sequence).
 *
 * No background Sender thread — {@link #send} drains when a batch is full or {@link #flush} is called.
 * Keeping this single-threaded avoids concurrency noise in scenario tests.
 */
public final class Producer implements AutoCloseable {

    private final ProducerConfig cfg;
    private final WireClient client;

    // v4 batching state (keyed by partition)
    private final Map<Integer, List<ProducerRecord>> pendingByPartition = new HashMap<>();
    private int pendingBytes = 0;
    private long firstPendingAt = 0;

    // v5 idempotence state
    private long producerId = -1;
    private int producerEpoch = -1;
    private final Map<String, Integer> nextSeqByTopicPart = new HashMap<>();

    public Producer(String host, int port) throws IOException {
        this(new ProducerConfig().host(host).port(port));
    }

    public Producer(ProducerConfig cfg) throws IOException {
        this.cfg = cfg;
        this.client = new WireClient(cfg.host, cfg.port);
        if (cfg.enableIdempotence) initProducerId();
    }

    private void initProducerId() throws IOException {
        ObjectNode req = Wire.JSON.createObjectNode();
        req.put("api", ApiKeys.INIT_PRODUCER_ID);
        JsonNode resp = client.send(req);
        if (!resp.path("ok").asBoolean()) {
            throw new IOException("init PID failed: " + resp.path("error").asText());
        }
        this.producerId = resp.get("producerId").asLong();
        this.producerEpoch = resp.get("producerEpoch").asInt();
    }

    public long producerId() { return producerId; }
    public int producerEpoch() { return producerEpoch; }

    public RecordMetadata send(ProducerRecord record) throws IOException {
        ProducerRecord resolved = resolvePartition(record);

        if (cfg.lingerMs <= 0) {
            return doSendSingle(resolved);
        }

        pendingByPartition.computeIfAbsent(resolved.partition(), k -> new ArrayList<>()).add(resolved);
        int approxBytes = (resolved.key() == null ? 0 : resolved.key().length)
                + (resolved.value() == null ? 0 : resolved.value().length) + 16;
        pendingBytes += approxBytes;
        if (firstPendingAt == 0) firstPendingAt = System.currentTimeMillis();

        if (pendingBytes >= cfg.batchSize
                || System.currentTimeMillis() - firstPendingAt >= cfg.lingerMs) {
            flush();
        }
        return new RecordMetadata(resolved.topic(), resolved.partition(), -1L);
    }

    public void flush() throws IOException {
        if (pendingByPartition.isEmpty()) return;
        IOException last = null;
        for (Map.Entry<Integer, List<ProducerRecord>> e : pendingByPartition.entrySet()) {
            try {
                doSendBatch(e.getKey(), e.getValue());
            } catch (IOException io) {
                last = io;
            }
        }
        pendingByPartition.clear();
        pendingBytes = 0;
        firstPendingAt = 0;
        if (last != null) throw last;
    }

    private RecordMetadata doSendSingle(ProducerRecord rec) throws IOException {
        return doSendBatch(rec.partition(), List.of(rec));
    }

    private RecordMetadata doSendBatch(int partition, List<ProducerRecord> batch) throws IOException {
        if (batch.isEmpty()) return null;
        String topic = batch.get(0).topic();

        int attempts = 0;
        IOException lastError = null;
        while (attempts <= cfg.retries) {
            try {
                return sendOnce(topic, partition, batch);
            } catch (IOException io) {
                lastError = io;
                attempts++;
                if (attempts > cfg.retries) break;
                try { Thread.sleep(cfg.retryBackoffMs); } catch (InterruptedException ignored) {}
            }
        }
        throw lastError != null ? lastError : new IOException("send failed");
    }

    private RecordMetadata sendOnce(String topic, int partition, List<ProducerRecord> batch) throws IOException {
        ObjectNode req = Wire.JSON.createObjectNode();
        req.put("api", ApiKeys.PRODUCE);
        req.put("topic", topic);
        req.put("partition", partition);
        req.put("acks", cfg.acks.wire);

        if (cfg.enableIdempotence) {
            String key = topic + ":" + partition;
            int base = nextSeqByTopicPart.getOrDefault(key, 0);
            req.put("producerId", producerId);
            req.put("producerEpoch", producerEpoch);
            req.put("baseSequence", base);
            nextSeqByTopicPart.put(key, base + batch.size());
        }

        ArrayNode arr = req.putArray("records");
        for (ProducerRecord r : batch) {
            ObjectNode ro = arr.addObject();
            if (r.key() != null) ro.put("key", Base64.getEncoder().encodeToString(r.key()));
            ro.put("value", Base64.getEncoder().encodeToString(r.value()));
        }

        JsonNode resp = client.send(req);
        if (!resp.path("ok").asBoolean()) {
            // roll back idempotent seq if we're going to retry
            if (cfg.enableIdempotence) {
                String key = topic + ":" + partition;
                nextSeqByTopicPart.merge(key, -batch.size(), Integer::sum);
            }
            throw new IOException("broker error: " + resp.path("error").asText());
        }
        return new RecordMetadata(topic, partition, resp.get("baseOffset").asLong());
    }

    private ProducerRecord resolvePartition(ProducerRecord r) {
        if (r.partition() >= 0) return r;
        int p = cfg.partitioner.partition(r.topic(), r.key(), r.value(), Math.max(1, cfg.partitionCount));
        return new ProducerRecord(r.topic(), p, r.key(), r.value());
    }

    @Override
    public void close() throws IOException {
        try { flush(); } catch (IOException ignored) {}
        client.close();
    }
}
