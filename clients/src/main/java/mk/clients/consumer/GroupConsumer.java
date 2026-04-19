package mk.clients.consumer;

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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * v7+ consumer: joins a group, receives an assignment, heartbeats, fetches, and (v9) commits.
 *
 * This is intentionally single-threaded — no background heartbeat thread — so scenarios can model
 * "what happens when the caller is too slow": if you don't call {@link #poll} within
 * {@link ConsumerConfig#maxPollIntervalMs}, the coordinator expires you on the next heartbeat.
 *
 * {@link mk.broker.coordinator.GroupCoordinator#expireDeadMembers} is what a scenario would call
 * to simulate the coordinator's side of the timeout.
 */
public final class GroupConsumer implements AutoCloseable {

    private final ConsumerConfig cfg;
    private final WireClient client;

    private String memberId = "";
    private int generation = -1;
    private boolean isLeader;
    private List<String> assignment = List.of();
    private long lastPollAt = System.currentTimeMillis();

    // cached assignment from previous generation for sticky
    private Map<String, List<String>> previousPlan = null;

    // per (topic,partition) next-offset cursor
    private final Map<String, Long> cursors = new HashMap<>();

    // pending commits when autoCommit is off
    private final Map<String, Long> uncommitted = new HashMap<>();

    public GroupConsumer(ConsumerConfig cfg) throws IOException {
        this.cfg = cfg;
        this.client = new WireClient(cfg.host, cfg.port);
        joinAndSync();
    }

    // ---------------- join/sync ----------------

    private void joinAndSync() throws IOException {
        ObjectNode jg = Wire.JSON.createObjectNode();
        jg.put("api", ApiKeys.JOIN_GROUP);
        jg.put("groupId", cfg.groupId);
        jg.put("memberId", memberId);
        if (cfg.groupInstanceId != null) jg.put("groupInstanceId", cfg.groupInstanceId);
        jg.put("sessionTimeoutMs", cfg.sessionTimeoutMs);
        ArrayNode subs = jg.putArray("subscription");
        for (String t : cfg.subscription) subs.add(t);

        JsonNode resp = client.send(jg);
        this.generation = resp.get("generation").asInt();
        this.memberId = resp.get("memberId").asText();
        this.isLeader = resp.get("isLeader").asBoolean();

        ObjectNode sg = Wire.JSON.createObjectNode();
        sg.put("api", ApiKeys.SYNC_GROUP);
        sg.put("groupId", cfg.groupId);
        sg.put("generation", generation);
        sg.put("memberId", memberId);

        if (isLeader) {
            // derive plan
            Map<String, List<String>> memberSubs = new LinkedHashMap<>();
            List<String> memberIds = new ArrayList<>();
            for (JsonNode m : resp.withArray("members")) {
                String mid = m.get("memberId").asText();
                memberIds.add(mid);
                List<String> s = new ArrayList<>();
                for (JsonNode sn : m.withArray("subscription")) s.add(sn.asText());
                memberSubs.put(mid, s);
            }
            Map<String, Integer> topicPartitions = fetchTopicPartitionCounts(cfg.subscription);
            Map<String, List<String>> plan = assign(topicPartitions, memberIds, memberSubs);
            ObjectNode plans = sg.putObject("assignments");
            for (var e : plan.entrySet()) {
                ArrayNode a = plans.putArray(e.getKey());
                for (String tp : e.getValue()) a.add(tp);
            }
            previousPlan = plan;
        }

        JsonNode sResp = client.send(sg);
        if (!sResp.path("ok").asBoolean()) throw new IOException(sResp.path("error").asText());
        List<String> asg = new ArrayList<>();
        for (JsonNode n : sResp.withArray("assignment")) asg.add(n.asText());
        this.assignment = asg;
    }

    private Map<String, Integer> fetchTopicPartitionCounts(List<String> topics) throws IOException {
        ObjectNode req = Wire.JSON.createObjectNode();
        req.put("api", ApiKeys.METADATA);
        JsonNode resp = client.send(req);
        Map<String, Integer> out = new HashMap<>();
        for (JsonNode t : resp.withArray("topics")) {
            String n = t.get("name").asText();
            if (topics.contains(n)) out.put(n, t.get("partitions").asInt());
        }
        for (String t : topics) out.putIfAbsent(t, 1);
        return out;
    }

    private Map<String, List<String>> assign(Map<String, Integer> partitions,
                                             List<String> members,
                                             Map<String, List<String>> subs) {
        return switch (cfg.assignor) {
            case RANGE               -> Assignors.range(partitions, members, subs);
            case ROUND_ROBIN         -> Assignors.roundRobin(partitions, members, subs);
            case STICKY,
                 COOPERATIVE_STICKY  -> Assignors.sticky(partitions, members, subs, previousPlan);
        };
    }

    // ---------------- poll / fetch ----------------

    public List<ConsumerRecord> poll(long timeoutMs) throws IOException {
        long now = System.currentTimeMillis();
        // v6 behavior: if we blew past maxPollIntervalMs before this call, the broker is expected
        // to have evicted us already. Re-join silently to model the client's discovery of this.
        if (now - lastPollAt > cfg.maxPollIntervalMs) {
            rejoin();
        }
        lastPollAt = now;

        heartbeat();

        List<ConsumerRecord> out = new ArrayList<>();
        for (String tp : assignment) {
            String topic = tp.substring(0, tp.lastIndexOf(':'));
            int part = Integer.parseInt(tp.substring(tp.lastIndexOf(':') + 1));
            String key = topic + ":" + part;
            long offset = cursors.computeIfAbsent(key, k -> fetchCommitted(topic, part));

            ObjectNode req = Wire.JSON.createObjectNode();
            req.put("api", ApiKeys.FETCH);
            req.put("topic", topic);
            req.put("partition", part);
            req.put("offset", offset);
            req.put("maxRecords", (int) cfg.maxPollRecords);

            JsonNode resp = client.send(req);
            for (JsonNode r : resp.withArray("records")) {
                byte[] k = r.hasNonNull("key") ? Base64.getDecoder().decode(r.get("key").asText()) : null;
                byte[] v = Base64.getDecoder().decode(r.get("value").asText());
                ConsumerRecord rec = new ConsumerRecord(topic, part,
                        r.get("offset").asLong(), r.get("timestamp").asLong(), k, v);
                out.add(rec);
                cursors.put(key, rec.offset() + 1);
                uncommitted.put(key, rec.offset() + 1);
            }
            if (out.size() >= cfg.maxPollRecords) break;
        }

        if (cfg.enableAutoCommit && !uncommitted.isEmpty()) commitSync();
        return out;
    }

    private void heartbeat() {
        try {
            ObjectNode hb = Wire.JSON.createObjectNode();
            hb.put("api", ApiKeys.HEARTBEAT);
            hb.put("groupId", cfg.groupId);
            hb.put("generation", generation);
            hb.put("memberId", memberId);
            JsonNode resp = client.send(hb);
            if (!resp.path("ok").asBoolean()) {
                String err = resp.path("error").asText();
                if (err.equals("REBALANCE_IN_PROGRESS") || err.equals("UNKNOWN_MEMBER_ID")) {
                    rejoin();
                }
            }
        } catch (IOException ignored) {}
    }

    private void rejoin() throws IOException {
        memberId = "";
        joinAndSync();
    }

    private long fetchCommitted(String topic, int partition) {
        try {
            ObjectNode req = Wire.JSON.createObjectNode();
            req.put("api", ApiKeys.OFFSET_FETCH);
            req.put("groupId", cfg.groupId);
            ArrayNode arr = req.putArray("partitions");
            ObjectNode o = arr.addObject();
            o.put("topic", topic);
            o.put("partition", partition);
            JsonNode resp = client.send(req);
            long off = resp.withArray("offsets").get(0).get("offset").asLong();
            return off < 0 ? 0L : off;
        } catch (IOException e) {
            return 0L;
        }
    }

    public void commitSync() throws IOException {
        if (uncommitted.isEmpty()) return;
        ObjectNode req = Wire.JSON.createObjectNode();
        req.put("api", ApiKeys.OFFSET_COMMIT);
        req.put("groupId", cfg.groupId);
        ArrayNode arr = req.putArray("offsets");
        for (var e : uncommitted.entrySet()) {
            String k = e.getKey();
            int colon = k.lastIndexOf(':');
            ObjectNode o = arr.addObject();
            o.put("topic", k.substring(0, colon));
            o.put("partition", Integer.parseInt(k.substring(colon + 1)));
            o.put("offset", e.getValue());
        }
        JsonNode resp = client.send(req);
        if (!resp.path("ok").asBoolean()) throw new IOException(resp.path("error").asText());
        uncommitted.clear();
    }

    public List<String> assignment() { return assignment; }
    public String memberId() { return memberId; }
    public int generation() { return generation; }

    @Override
    public void close() throws IOException {
        // Static members (KIP-345): do NOT send LeaveGroup. That way a restart of the same pod
        // rejoins on the same memberId and the coordinator skips the rebalance.
        if (cfg.groupInstanceId == null) {
            try {
                ObjectNode req = Wire.JSON.createObjectNode();
                req.put("api", ApiKeys.LEAVE_GROUP);
                req.put("groupId", cfg.groupId);
                req.put("memberId", memberId);
                client.send(req);
            } catch (IOException ignored) {}
        }
        client.close();
    }
}
