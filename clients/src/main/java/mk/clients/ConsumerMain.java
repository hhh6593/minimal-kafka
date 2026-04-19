package mk.clients;

import mk.clients.consumer.Consumer;
import mk.clients.consumer.ConsumerRecord;

/**
 * v1 consumer CLI. Polls a single (topic, 0) from offset 0 and prints records forever.
 *
 * Usage:
 *   ./gradlew :clients:runConsumer --args="host port topic [startOffset]"
 */
public final class ConsumerMain {

    public static void main(String[] args) throws Exception {
        String host  = arg(args, 0, "127.0.0.1");
        int port     = Integer.parseInt(arg(args, 1, "9092"));
        String topic = arg(args, 2, "demo");
        long start   = Long.parseLong(arg(args, 3, "0"));

        try (Consumer consumer = new Consumer(host, port, topic, 0, start)) {
            System.out.printf("consuming from %s:%d topic=%s partition=0 start=%d%n",
                    host, port, topic, start);
            while (true) {
                var batch = consumer.poll(100);
                if (batch.isEmpty()) {
                    Thread.sleep(200);
                    continue;
                }
                for (ConsumerRecord r : batch) {
                    System.out.printf("  offset=%d key=%s value=%s%n",
                            r.offset(), r.keyAsString(), r.valueAsString());
                }
            }
        }
    }

    private static String arg(String[] a, int i, String def) {
        return (a.length > i) ? a[i] : def;
    }
}
