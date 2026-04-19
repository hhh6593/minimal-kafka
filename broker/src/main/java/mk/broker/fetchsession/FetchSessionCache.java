package mk.broker.fetchsession;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * v15-6 fetch session cache with LRU eviction.
 *
 * Real Kafka uses incremental fetch sessions (KIP-227) to avoid re-sending the full partition list
 * on every fetch. When {@code max.incremental.fetch.session.cache.slots} is exceeded, LRU eviction
 * kicks in; evicted consumers fall back to full-metadata fetches until they re-earn a slot.
 *
 * Here we model evictions per fetcher id; a fetcher whose session was evicted is forced to do a
 * "full" fetch on next call (recorded as a boolean).
 */
public final class FetchSessionCache {

    private final int capacity;
    private final LinkedHashMap<String, Boolean> lru;
    private long evictionCount = 0;

    public FetchSessionCache(int capacity) {
        this.capacity = capacity;
        this.lru = new LinkedHashMap<>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Boolean> eldest) {
                if (size() > FetchSessionCache.this.capacity) {
                    evictionCount++;
                    return true;
                }
                return false;
            }
        };
    }

    /** Returns true if the fetcher's session hit (incremental fetch possible). */
    public synchronized boolean touch(String fetcherId) {
        Boolean existing = lru.get(fetcherId);
        if (existing != null) return true;
        lru.put(fetcherId, true);
        return false;
    }

    public synchronized long evictions() { return evictionCount; }
    public synchronized int size() { return lru.size(); }
}
