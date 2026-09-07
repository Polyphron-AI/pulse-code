import { InfrastructureError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpBody, HttpClient, type HttpClientResponse } from "effect/unstable/http";

export const upstreamError = () =>
  new InfrastructureError({
    code: "upstream",
    message:
      "Grafana MCP query failed. Check the endpoint, credentials, enabled tools, and query in Grafana.",
  });
const Envelope = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Number,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Unknown),
});
const Initialized = Schema.Struct({
  protocolVersion: Schema.Literals(["2025-03-26", "2025-06-18", "2025-11-25"]),
  capabilities: Schema.Struct({ tools: Schema.Struct({}) }),
});
const ToolResult = Schema.Struct({
  isError: Schema.optional(Schema.Boolean),
  content: Schema.Array(
    Schema.Struct({ type: Schema.String, text: Schema.optional(Schema.String) }),
  ),
  structuredContent: Schema.optional(Schema.Unknown),
});
const decodeJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));
const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const decodeEnvelope = Schema.decodeUnknownOption(Envelope);
const decodeInitialized = Schema.decodeUnknownEffect(Initialized);
const decodeToolResult = Schema.decodeUnknownEffect(ToolResult);

// Streamable HTTP permits JSON or SSE responses. Bound bytes before parsing either.
const readResponse = Effect.fn("GrafanaMcp.readResponse")(function* (
  response: HttpClientResponse.HttpClientResponse,
  id: number,
) {
  if (response.status !== 200) return yield* upstreamError();
  let bytes = 0;
  const decoder = new TextDecoder();
  const text = yield* response.stream.pipe(
    Stream.mapEffect((chunk) => {
      bytes += chunk.byteLength;
      return bytes > 1_048_576
        ? Effect.fail(upstreamError())
        : Effect.succeed(decoder.decode(chunk, { stream: true }));
    }),
    Stream.runFold(
      () => "",
      (text, chunk) => text + chunk,
    ),
    Effect.map((text) => text + decoder.decode()),
  );
  return yield* Effect.gen(function* () {
    const payloads = response.headers["content-type"]?.includes("text/event-stream")
      ? text
          .replace(/\r\n/g, "\n")
          .split("\n\n")
          .map((event) =>
            event
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n"),
          )
          .filter(Boolean)
      : [text];
    for (const payload of payloads) {
      const decoded = yield* decodeJson(payload);
      const envelope = decodeEnvelope(decoded);
      if (envelope._tag === "Some" && envelope.value.id === id) {
        if (envelope.value.error !== undefined || envelope.value.result === undefined)
          return yield* upstreamError();
        return envelope.value.result;
      }
    }
    return yield* upstreamError();
  });
});

export const callGrafana = Effect.fn("GrafanaMcp.call")(function* (
  endpoint: string,
  token: string,
  call: { readonly name: string; readonly arguments: object },
) {
  const client = yield* HttpClient.HttpClient;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      let session: string | undefined;
      let protocol = "2025-06-18";
      const headers = () => ({
        authorization: `Bearer ${token}`,
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": protocol,
        ...(session ? { "mcp-session-id": session } : {}),
      });
      const post = (body: object) =>
        client.post(endpoint, { headers: headers(), body: HttpBody.jsonUnsafe(body) });
      yield* Effect.addFinalizer(() =>
        session
          ? client
              .del(endpoint, { headers: headers() })
              .pipe(Effect.timeout("2 seconds"), Effect.ignore)
          : Effect.void,
      );
      const response = yield* post({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: protocol,
          capabilities: {},
          clientInfo: { name: "pulse-infrastructure", version: "1.0.0" },
        },
      });
      session = response.headers["mcp-session-id"];
      const initialization = yield* readResponse(response, 1).pipe(
        Effect.flatMap(decodeInitialized),
      );
      protocol = initialization.protocolVersion;
      const notification = yield* post({ jsonrpc: "2.0", method: "notifications/initialized" });
      if (notification.status < 200 || notification.status >= 300) return yield* upstreamError();
      const result = yield* post({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: call,
      }).pipe(
        Effect.flatMap((response) => readResponse(response, 2)),
        Effect.flatMap(decodeToolResult),
      );
      if (result.isError) return yield* upstreamError();
      const texts = result.content
        .filter((item) => item.type === "text" && item.text !== undefined)
        .map((item) => item.text!);
      if (texts.length === 0 && result.structuredContent === undefined)
        return yield* upstreamError();
      const raw = texts.length > 0 ? texts.join("\n") : yield* encodeJson(result.structuredContent);
      const redacted = raw.split(token).join("[redacted]");
      return { text: redacted.slice(0, 24000), outputTruncated: redacted.length > 24000 };
    }),
  ).pipe(Effect.timeout("20 seconds"), Effect.mapError(upstreamError));
});
