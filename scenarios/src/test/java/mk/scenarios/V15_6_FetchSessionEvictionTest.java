package mk.scenarios;

import mk.broker.fetchsession.FetchSessionCache;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v15-6 — Fetch session cache eviction storm (KIP-227, KAFKA-17182, Wikimedia T303324).
 *
 * With 4 cache slots and 5 active fetchers, the eldest fetcher loses its slot on every cycle.
 * Consumers that lose a slot fall back to full-metadata fetches — measured by {@link #touch}
 * returning false.
 */
class V15_6_FetchSessionEvictionTest {

    @Test
    void oversubscribedCache_evictsLruFetcher() {
        FetchSessionCache cache = new FetchSessionCache(4);
        for (int i = 0; i < 4; i++) cache.touch("fetcher-" + i); // all miss first time
        assertEquals(0, cache.evictions());

        // 5th fetcher evicts LRU (fetcher-0)
        assertFalse(cache.touch("fetcher-4"));
        assertEquals(1, cache.evictions());

        // fetcher-0 comes back — miss again
        assertFalse(cache.touch("fetcher-0"));
        assertTrue(cache.evictions() >= 2, "thrashing continues");
    }

    @Test
    void largeCache_keepsAllFetchers() {
        FetchSessionCache cache = new FetchSessionCache(1024);
        for (int i = 0; i < 100; i++) cache.touch("fetcher-" + i);
        for (int i = 0; i < 100; i++) assertTrue(cache.touch("fetcher-" + i), "hit on second touch");
        assertEquals(0, cache.evictions());
    }
}
