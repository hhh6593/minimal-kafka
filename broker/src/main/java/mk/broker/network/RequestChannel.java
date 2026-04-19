package mk.broker.network;

/**
 * Placeholder. v1 uses a simple per-connection handler pool instead of a SocketServer-style
 * request channel. Introduced properly in a later version when we add request throttling and
 * separate network / IO thread tiers.
 *
 * Left here so the package structure mirrors real kafka even though v1 bypasses it.
 */
public final class RequestChannel {
    private RequestChannel() {}
}
