package mk.broker;

import mk.broker.config.KafkaConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** v1 CLI entry point. */
public final class BrokerMain {

    private static final Logger LOG = LoggerFactory.getLogger(BrokerMain.class);

    public static void main(String[] args) throws Exception {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 9092;
        KafkaConfig cfg = KafkaConfig.defaults().withPort(port);

        Broker broker = new Broker(cfg);
        Runtime.getRuntime().addShutdownHook(new Thread(broker::close, "mk-shutdown"));
        broker.start();
        LOG.info("minimal-kafka v1 up on port {}. Ctrl+C to stop.", broker.boundPort());

        Thread.currentThread().join();
    }
}
