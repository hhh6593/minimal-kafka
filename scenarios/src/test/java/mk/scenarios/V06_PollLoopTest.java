package mk.scenarios;

import mk.broker.Broker;
import mk.broker.config.KafkaConfig;
import mk.clients.consumer.ConsumerConfig;
import mk.clients.consumer.GroupConsumer;
import mk.clients.producer.Producer;
import mk.clients.producer.ProducerConfig;
import mk.clients.producer.ProducerRecord;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v6 — max.poll.interval.ms / session.timeout.ms enforcement.
 *
 * The coordinator evicts a member whose {@link ConsumerConfig#sessionTimeoutMs} elapsed without
 * a heartbeat. Our single-thread consumer heartbeats on {@link GroupConsumer#poll}, so if the
 * caller stalls between polls longer than session timeout, the server expires them.
 *
 * Then when the caller resumes, the heartbeat fails with UNKNOWN_MEMBER_ID and we rejoin.
 * Real Kafka: this is the rebalance loop pathology when the application's per-batch processing
 * time exceeds {@code max.poll.interval.ms}.
 */
class V06_PollLoopTest {

    @Test
    void slowProcessing_beyondSessionTimeout_triggersReJoin() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            int port = broker.boundPort();

            try (Producer p = new Producer(new ProducerConfig().host("127.0.0.1").port(port).partitions(2))) {
                for (int i = 0; i < 20; i++) p.send(ProducerRecord.of("t", "k" + (i % 5), "v" + i));
            }

            ConsumerConfig cfg = new ConsumerConfig().host("127.0.0.1").port(port)
                    .group("g").subscribe("t")
                    .sessionTimeout(100).heartbeat(30).maxPollInterval(100);

            try (GroupConsumer c = new GroupConsumer(cfg)) {
                int firstGen = c.generation();
                c.poll(100);
                // simulate long processing — longer than sessionTimeoutMs
                Thread.sleep(250);
                // coordinator side: explicitly run the expiry check scenarios would run out-of-band
                broker.api().coordinator().expireDeadMembers(System.currentTimeMillis());
                c.poll(100); // should notice UNKNOWN_MEMBER_ID and rejoin
                assertNotEquals(firstGen, c.generation(), "generation must bump after forced rejoin");
            }
        }
    }

    @Test
    void heartbeatWithinSession_keepsGenerationStable() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            int port = broker.boundPort();

            try (Producer p = new Producer(new ProducerConfig().host("127.0.0.1").port(port))) {
                p.send(ProducerRecord.of("t", "v"));
            }

            ConsumerConfig cfg = new ConsumerConfig().host("127.0.0.1").port(port)
                    .group("g").subscribe("t").sessionTimeout(1000).heartbeat(50);

            try (GroupConsumer c = new GroupConsumer(cfg)) {
                int gen = c.generation();
                for (int i = 0; i < 10; i++) {
                    c.poll(10);
                    Thread.sleep(30);
                }
                broker.api().coordinator().expireDeadMembers(System.currentTimeMillis());
                assertEquals(gen, c.generation(), "timely polls keep us alive");
            }
        }
    }
}
