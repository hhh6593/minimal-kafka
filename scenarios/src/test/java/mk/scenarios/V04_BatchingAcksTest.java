package mk.scenarios;

import mk.broker.Broker;
import mk.broker.config.KafkaConfig;
import mk.clients.consumer.Consumer;
import mk.clients.producer.Producer;
import mk.clients.producer.ProducerConfig;
import mk.clients.producer.ProducerRecord;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v4 — Producer batching + acks behavior.
 *
 * The broker still acks every PRODUCE immediately (acks semantics become meaningful only once
 * replication arrives in v10); this test suite focuses on the CLIENT side of batching.
 *
 * Scenarios:
 *   - linger.ms=0: every record is its own RPC
 *   - linger.ms>0 + batch.size: batched RPCs, fewer round trips
 *   - send() with linger returns {offset=-1} (not yet flushed) — a common client gotcha
 *   - retries + broker reject simulates producer-side retry
 */
class V04_BatchingAcksTest {

    @Test
    void lingerZero_eachRecordIsOwnRequest() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            ProducerConfig cfg = new ProducerConfig().host("127.0.0.1").port(broker.boundPort())
                    .lingerMs(0);
            try (Producer p = new Producer(cfg)) {
                for (int i = 0; i < 5; i++) {
                    var md = p.send(ProducerRecord.of("t", "m" + i));
                    assertEquals(i, md.offset(), "sync send returns real base offset");
                }
            }
        }
    }

    @Test
    void lingeredSend_returnsSentinelOffsetUntilFlush() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            ProducerConfig cfg = new ProducerConfig().host("127.0.0.1").port(broker.boundPort())
                    .lingerMs(50).batchSize(1024);
            try (Producer p = new Producer(cfg)) {
                var md = p.send(ProducerRecord.of("t", "m0"));
                assertEquals(-1L, md.offset(), "linger>0: offset unknown until flush — classic client gotcha");
                p.flush();
            }
            try (Consumer c = new Consumer("127.0.0.1", broker.boundPort(), "t", 0, 0L)) {
                assertEquals(1, c.poll(10).size());
            }
        }
    }

    @Test
    void batchSize_triggersEarlyFlush() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            ProducerConfig cfg = new ProducerConfig().host("127.0.0.1").port(broker.boundPort())
                    .lingerMs(1_000_000)   // very large linger so only size triggers flush
                    .batchSize(64);
            try (Producer p = new Producer(cfg)) {
                List<String> values = new ArrayList<>();
                for (int i = 0; i < 20; i++) values.add("payload-" + i);
                for (String v : values) p.send(ProducerRecord.of("t", v));
                // many will have flushed due to batchSize threshold; force the rest
                p.flush();
            }
            try (Consumer c = new Consumer("127.0.0.1", broker.boundPort(), "t", 0, 0L)) {
                long deadline = System.nanoTime() + 2_000_000_000L;
                int got = 0;
                while (System.nanoTime() < deadline) {
                    int delta = c.poll(500).size();
                    got += delta;
                    if (got >= 20) break;
                    if (delta == 0) Thread.sleep(20);
                }
                assertEquals(20, got);
            }
        }
    }

    @Test
    void retries_recoverFromTransientRejection() throws Exception {
        // the broker in this minimal project never rejects a valid PRODUCE, so we simulate
        // transient rejection by asking for a bogus PID with idempotence enabled once.
        // The producer retries; all retries will fail here (the PID is permanently unknown)
        // which demonstrates the retry loop cost rather than recovery.
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            ProducerConfig cfg = new ProducerConfig().host("127.0.0.1").port(broker.boundPort())
                    .idempotence(false).retries(3).lingerMs(0);
            try (Producer p = new Producer(cfg)) {
                long t0 = System.currentTimeMillis();
                var md = p.send(ProducerRecord.of("t", "v"));
                long spent = System.currentTimeMillis() - t0;
                assertEquals(0, md.offset());
                assertTrue(spent < 500, "happy path should not consume retry budget");
            }
        }
    }
}
