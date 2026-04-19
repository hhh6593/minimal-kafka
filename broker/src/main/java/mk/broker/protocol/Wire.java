package mk.broker.protocol;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.channels.SocketChannel;

/**
 * Minimal wire framing used by v1-v3: 4-byte big-endian length prefix followed by a JSON payload.
 *
 * Every request/response is an object with at least:
 *   { "api": "PRODUCE" | "FETCH" | "METADATA", ...fields }
 *
 * Rationale: transparent on the wire (tcpdump-friendly), zero schema surface to learn.
 * v4 replaces this with Kafka's real request/response framing.
 */
public final class Wire {

    public static final ObjectMapper JSON = new ObjectMapper();

    private static final int MAX_FRAME_BYTES = 16 * 1024 * 1024;

    private Wire() {}

    // -------- blocking stream helpers (used by clients and tests) --------

    public static void writeFrame(OutputStream out, JsonNode payload) throws IOException {
        byte[] body = JSON.writeValueAsBytes(payload);
        ByteBuffer header = ByteBuffer.allocate(4).putInt(body.length);
        out.write(header.array());
        out.write(body);
        out.flush();
    }

    public static JsonNode readFrame(InputStream in) throws IOException {
        byte[] header = in.readNBytes(4);
        if (header.length != 4) throw new EOFException("short header");
        int len = ByteBuffer.wrap(header).getInt();
        if (len <= 0 || len > MAX_FRAME_BYTES) throw new IOException("bad frame length " + len);
        byte[] body = in.readNBytes(len);
        if (body.length != len) throw new EOFException("short body");
        return JSON.readTree(body);
    }

    // -------- NIO channel helpers (broker side) --------

    /** Read one complete frame from a blocking-configured SocketChannel. */
    public static JsonNode readFrameBlocking(SocketChannel ch) throws IOException {
        ByteBuffer header = ByteBuffer.allocate(4);
        readFully(ch, header);
        header.flip();
        int len = header.getInt();
        if (len <= 0 || len > MAX_FRAME_BYTES) throw new IOException("bad frame length " + len);
        ByteBuffer body = ByteBuffer.allocate(len);
        readFully(ch, body);
        body.flip();
        byte[] bytes = new byte[len];
        body.get(bytes);
        return JSON.readTree(bytes);
    }

    public static void writeFrameBlocking(SocketChannel ch, JsonNode payload) throws IOException {
        byte[] body = JSON.writeValueAsBytes(payload);
        ByteBuffer buf = ByteBuffer.allocate(4 + body.length);
        buf.putInt(body.length).put(body).flip();
        while (buf.hasRemaining()) ch.write(buf);
    }

    private static void readFully(SocketChannel ch, ByteBuffer buf) throws IOException {
        while (buf.hasRemaining()) {
            int n = ch.read(buf);
            if (n < 0) throw new EOFException("channel closed");
        }
    }
}
