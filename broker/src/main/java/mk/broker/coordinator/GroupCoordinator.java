package mk.broker.coordinator;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import mk.broker.protocol.ApiKeys;
import mk.broker.protocol.Wire;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * v7+ minimalist group coordinator. In-proc, single coordinator per broker.
 *
 * Protocol (simplified Kafka consumer group flow):
 *   FIND_COORDINATOR(group) -> coordinator host/port (here: self)
 *   JOIN_GROUP(group, memberId?, subscription, sessionTimeoutMs)
 *     -> new generation + members + selected leader + member's assignment role
 *   SYNC_GROUP(group, generation, memberId, assignments?[only from leader])
 *     -> per-member assignment
 *   HEARTBEAT(group, generation, memberId) -> ok
 *   LEAVE_GROUP(group, memberId) -> ok
 *
 * Rebalance trigger: any JOIN from a fresh memberId, or a LEAVE, bumps the generation and
 * switches state to AWAITING_SYNC. The first SYNC_GROUP carrying non-empty assignments becomes
 * the group leader's plan.
 *
 * Real kafka: {@code kafka.coordinator.group.GroupCoordinator}. This omits static membership
 * (KIP-345), incremental cooperative (KIP-429 partial), and offset topic compaction.
 */
public final class GroupCoordinator {

    enum State { EMPTY, AWAITING_SYNC, STABLE }

    public static final class Member {
        public final String memberId;
        public final String groupInstanceId; // v7 static membership (nullable)
        public final List<String> subscription;
        public final long sessionTimeoutMs;
        public volatile long lastHeartbeat;
        public volatile List<String> assignment = List.of();

        Member(String memberId, String groupInstanceId, List<String> subscription, long sessionTimeoutMs) {
            this.memberId = memberId;
            this.groupInstanceId = groupInstanceId;
            this.subscription = subscription;
            this.sessionTimeoutMs = sessionTimeoutMs;
            this.lastHeartbeat = System.currentTimeMillis();
        }
    }

    public static final class Group {
        public final String id;
        public final Map<String, Member> members = new ConcurrentHashMap<>();
        public volatile State state = State.EMPTY;
        public volatile int generation = 0;
        public volatile String leaderId;

        Group(String id) { this.id = id; }
    }

    private final Map<String, Group> groups = new ConcurrentHashMap<>();

    public Map<String, Group> groups() { return groups; }

    public JsonNode handleFindCoordinator(JsonNode req) {
        ObjectNode resp = Wire.JSON.createObjectNode();
        resp.put("ok", true);
        resp.put("api", ApiKeys.FIND_COORDINATOR);
        resp.put("host", "127.0.0.1");
        resp.put("port", req.path("brokerPort").asInt(-1));
        return resp;
    }

    public synchronized JsonNode handleJoinGroup(JsonNode req) {
        String groupId = req.get("groupId").asText();
        String memberId = req.path("memberId").asText("");
        String staticId = req.path("groupInstanceId").asText(null);
        List<String> subs = new ArrayList<>();
        for (JsonNode s : req.withArray("subscription")) subs.add(s.asText());
        long sessionMs = req.path("sessionTimeoutMs").asLong(30_000);

        Group g = groups.computeIfAbsent(groupId, Group::new);

        // static membership: treat same groupInstanceId as the same logical member
        if (staticId != null) {
            for (Member m : g.members.values()) {
                if (staticId.equals(m.groupInstanceId)) {
                    m.lastHeartbeat = System.currentTimeMillis();
                    return joinResponse(g, m.memberId, /*rebalanced*/ false);
                }
            }
        }

        if (memberId.isEmpty()) memberId = UUID.randomUUID().toString();
        Member m = new Member(memberId, staticId, subs, sessionMs);
        g.members.put(memberId, m);
        g.generation++;
        g.state = State.AWAITING_SYNC;
        g.leaderId = g.members.keySet().stream().sorted().findFirst().orElse(memberId);
        return joinResponse(g, memberId, /*rebalanced*/ true);
    }

    private JsonNode joinResponse(Group g, String memberId, boolean rebalanced) {
        ObjectNode resp = Wire.JSON.createObjectNode();
        resp.put("ok", true);
        resp.put("api", ApiKeys.JOIN_GROUP);
        resp.put("groupId", g.id);
        resp.put("generation", g.generation);
        resp.put("memberId", memberId);
        resp.put("leaderId", g.leaderId);
        resp.put("isLeader", memberId.equals(g.leaderId));
        resp.put("rebalanced", rebalanced);
        ArrayNode members = resp.putArray("members");
        List<String> ids = new ArrayList<>(g.members.keySet());
        Collections.sort(ids);
        for (String id : ids) {
            Member m = g.members.get(id);
            ObjectNode mo = members.addObject();
            mo.put("memberId", id);
            ArrayNode s = mo.putArray("subscription");
            for (String sub : m.subscription) s.add(sub);
        }
        return resp;
    }

    public synchronized JsonNode handleSyncGroup(JsonNode req) {
        String groupId = req.get("groupId").asText();
        int generation = req.get("generation").asInt();
        String memberId = req.get("memberId").asText();

        Group g = groups.get(groupId);
        if (g == null || g.generation != generation) {
            return err(ApiKeys.SYNC_GROUP, "ILLEGAL_GENERATION");
        }
        // leader posts the full plan
        JsonNode assignments = req.get("assignments");
        if (assignments != null && assignments.isObject()) {
            assignments.fields().forEachRemaining(ent -> {
                Member m = g.members.get(ent.getKey());
                if (m != null) {
                    List<String> parts = new ArrayList<>();
                    ent.getValue().forEach(n -> parts.add(n.asText()));
                    m.assignment = parts;
                }
            });
            g.state = State.STABLE;
        }
        Member me = g.members.get(memberId);
        if (me == null) return err(ApiKeys.SYNC_GROUP, "UNKNOWN_MEMBER_ID");
        me.lastHeartbeat = System.currentTimeMillis();

        ObjectNode resp = Wire.JSON.createObjectNode();
        resp.put("ok", true);
        resp.put("api", ApiKeys.SYNC_GROUP);
        resp.put("state", g.state.name());
        ArrayNode arr = resp.putArray("assignment");
        for (String p : me.assignment) arr.add(p);
        return resp;
    }

    public synchronized JsonNode handleHeartbeat(JsonNode req) {
        String groupId = req.get("groupId").asText();
        int generation = req.get("generation").asInt();
        String memberId = req.get("memberId").asText();
        Group g = groups.get(groupId);
        if (g == null) return err(ApiKeys.HEARTBEAT, "UNKNOWN_GROUP");
        if (g.generation != generation) return err(ApiKeys.HEARTBEAT, "REBALANCE_IN_PROGRESS");
        Member m = g.members.get(memberId);
        if (m == null) return err(ApiKeys.HEARTBEAT, "UNKNOWN_MEMBER_ID");
        m.lastHeartbeat = System.currentTimeMillis();
        ObjectNode resp = Wire.JSON.createObjectNode();
        resp.put("ok", true);
        resp.put("api", ApiKeys.HEARTBEAT);
        return resp;
    }

    public synchronized JsonNode handleLeaveGroup(JsonNode req) {
        String groupId = req.get("groupId").asText();
        String memberId = req.get("memberId").asText();
        Group g = groups.get(groupId);
        if (g != null) {
            g.members.remove(memberId);
            g.generation++;
            g.state = g.members.isEmpty() ? State.EMPTY : State.AWAITING_SYNC;
            if (!g.members.isEmpty()) {
                g.leaderId = g.members.keySet().stream().sorted().findFirst().orElse(null);
            }
        }
        ObjectNode resp = Wire.JSON.createObjectNode();
        resp.put("ok", true);
        resp.put("api", ApiKeys.LEAVE_GROUP);
        return resp;
    }

    /** Scenarios poll for liveness; expire sessions out of band. */
    public synchronized int expireDeadMembers(long nowMs) {
        int expired = 0;
        for (Group g : groups.values()) {
            List<String> dead = new ArrayList<>();
            for (Member m : g.members.values()) {
                if (nowMs - m.lastHeartbeat > m.sessionTimeoutMs) dead.add(m.memberId);
            }
            for (String id : dead) g.members.remove(id);
            if (!dead.isEmpty()) {
                g.generation++;
                g.state = g.members.isEmpty() ? State.EMPTY : State.AWAITING_SYNC;
                if (!g.members.isEmpty()) {
                    g.leaderId = g.members.keySet().stream().sorted().findFirst().orElse(null);
                }
                expired += dead.size();
            }
        }
        return expired;
    }

    private JsonNode err(String api, String error) {
        ObjectNode o = Wire.JSON.createObjectNode();
        o.put("ok", false);
        o.put("api", api);
        o.put("error", error);
        return o;
    }
}
