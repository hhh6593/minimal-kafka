package mk.clients;

import mk.clients.producer.Producer;
import mk.clients.producer.ProducerRecord;
import mk.clients.producer.RecordMetadata;

/**
 * v1 producer CLI. Reads stdin line-by-line, sends each line as a record to (topic, 0).
 *
 * Usage:
 *   ./gradlew :clients:runProducer --args="host port topic"
 *   echo "hello" | ./gradlew --quiet :clients:runProducer --args="127.0.0.1 9092 demo"
 */
public final class ProducerMain {

    public static void main(String[] args) throws Exception {
        String host  = arg(args, 0, "127.0.0.1");
        int port     = Integer.parseInt(arg(args, 1, "9092"));
        String topic = arg(args, 2, "demo");

        try (Producer producer = new Producer(host, port);
             var reader = new java.io.BufferedReader(new java.io.InputStreamReader(System.in))) {
            System.out.printf("producing to %s:%d topic=%s (one record per line, Ctrl+D to stop)%n",
                    host, port, topic);
            String line;
            while ((line = reader.readLine()) != null) {
                RecordMetadata md = producer.send(ProducerRecord.of(topic, line));
                System.out.printf("  -> offset=%d partition=%d%n", md.offset(), md.partition());
            }
        }
    }

    private static String arg(String[] a, int i, String def) {
        return (a.length > i) ? a[i] : def;
    }
}
