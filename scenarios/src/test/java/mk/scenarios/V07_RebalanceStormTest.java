package mk.scenarios;

import mk.broker.Broker;
import mk.broker.config.KafkaConfig;
import mk.clients.consumer.ConsumerConfig;
import mk.clients.consumer.GroupConsumer;
import mk.clients.producer.Producer;
import mk.clients.producer.ProducerConfig;
import mk.clients.producer.ProducerRecord;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * v7 — Rebalance storm on k8s rolling restart.
 *
 * Model: 10 consumer "pods" join a group. One by one each pod is terminated and replaced.
 * Without static membership every termination + new join bumps the generation twice (once per
 * leave, once per join). We count generation bumps.
 *
 * Then we rerun with {@link ConsumerConfig#groupInstanceId} set (KIP-345 static membership):
 * a "pod" rejoining with the same static id is treated as the same logical member, so no
 * rebalance occurs. The generation bump count drops dramatically.
 */
class V07_RebalanceStormTest {

    @Test
    void rollingRestartWithoutStaticMembership_rebalancesEveryTime() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            int port = broker.boundPort();

            try (Producer p = new Producer(new ProducerConfig().host("127.0.0.1").port(port).partitions(10))) {
                for (int i = 0; i < 100; i++) p.send(ProducerRecord.of("t", "k" + i, "v"));
            }

            List<GroupConsumer> pods = new ArrayList<>();
            for (int i = 0; i < 10; i++) {
                pods.add(new GroupConsumer(new ConsumerConfig().host("127.0.0.1").port(port)
                        .group("g").subscribe("t")));
            }

            int genAtStart = pods.get(pods.size() - 1).generation();

            // rolling restart
            for (int i = 0; i < pods.size(); i++) {
                pods.get(i).close();
                pods.set(i, new GroupConsumer(new ConsumerConfig().host("127.0.0.1").port(port)
                        .group("g").subscribe("t")));
            }

            int genAfter = pods.get(pods.size() - 1).generation();
            for (GroupConsumer c : pods) c.close();

            int bumps = genAfter - genAtStart;
            assertTrue(bumps >= 20, "rolling restart should bump generation at least 2× per pod, got " + bumps);
        }
    }

    @Test
    void rollingRestartWithStaticMembership_avoidsRebalance() throws Exception {
        try (Broker broker = new Broker(KafkaConfig.defaults().withPort(0))) {
            broker.start();
            int port = broker.boundPort();

            try (Producer p = new Producer(new ProducerConfig().host("127.0.0.1").port(port).partitions(10))) {
                for (int i = 0; i < 100; i++) p.send(ProducerRecord.of("t", "k" + i, "v"));
            }

            int n = 10;
            List<GroupConsumer> pods = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                pods.add(new GroupConsumer(new ConsumerConfig().host("127.0.0.1").port(port)
                        .group("g").staticId("pod-" + i).subscribe("t")));
            }

            int genAtStart = pods.get(n - 1).generation();

            for (int i = 0; i < n; i++) {
                pods.get(i).close();
                pods.set(i, new GroupConsumer(new ConsumerConfig().host("127.0.0.1").port(port)
                        .group("g").staticId("pod-" + i).subscribe("t")));
            }

            int genAfter = pods.get(n - 1).generation();
            for (GroupConsumer c : pods) c.close();

            int bumps = genAfter - genAtStart;
            assertTrue(bumps <= 4, "static membership should suppress rebalances, got " + bumps);
        }
    }
}
