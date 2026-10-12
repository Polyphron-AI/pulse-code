import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Api } from "teleproto";
import { returnBigInt } from "teleproto/Helpers";
import { installMessageBehaviour } from "teleproto/tl/custom/message";
import { beginTelegram, restoreTelegram } from "./TelegramAdapter.ts";

const mock = vi.hoisted(() => ({
  connect: vi.fn(),
  authorized: vi.fn(),
  destroy: vi.fn(),
  me: vi.fn(),
  sendCode: vi.fn(),
  password: vi.fn(),
  invoke: vi.fn(),
  dialogs: vi.fn(),
  messages: vi.fn(),
  response: vi.fn(),
  options: vi.fn(),
}));
vi.mock("teleproto", async (importOriginal) => {
  const original = await importOriginal<typeof import("teleproto")>();
  return {
    ...original,
    TelegramClient: class {
      session = { save: () => "private-session" };
      constructor(_session: unknown, _apiId: number, _apiHash: string, options: unknown) {
        mock.options(options);
      }
      connect = mock.connect;
      checkAuthorization = mock.authorized;
      destroy = mock.destroy;
      getMe = mock.me;
      sendCode = mock.sendCode;
      signInWithPassword = mock.password;
      invoke = mock.invoke;
      getDialogs = mock.dialogs;
      getMessages = mock.messages;
      _getResponseMessage = mock.response;
    },
  };
});
vi.mock("teleproto/sessions", () => ({
  StringSession: class {
    save() {
      return "private-session";
    }
  },
}));

const secrets = { apiId: 123, apiHash: "private-api-hash", session: "private-session" };
const user = () => new Api.User({ id: returnBigInt(7), firstName: "Actual", lastName: "User" });
function message(id: number, replyToId?: number) {
  const result = new Api.Message({
    id,
    date: id * 1000,
    message: `Real text ${id}`,
    peerId: new Api.PeerUser({ userId: returnBigInt(8) }),
    ...(replyToId ? { replyTo: new Api.MessageReplyHeader({ replyToMsgId: replyToId }) } : {}),
  });
  vi.spyOn(result, "getSender").mockResolvedValue(user());
  return result;
}
function dialog(id = 8) {
  return {
    id: returnBigInt(id),
    inputEntity: new Api.InputPeerUser({ userId: returnBigInt(id), accessHash: returnBigInt(9) }),
    entity: user(),
    title: "Real chat",
    isUser: true,
    isGroup: false,
    date: 100,
    message: message(10),
  };
}
beforeEach(() => {
  installMessageBehaviour();
  vi.resetAllMocks();
  mock.connect.mockResolvedValue(undefined);
  mock.authorized.mockResolvedValue(true);
  mock.destroy.mockResolvedValue(undefined);
  mock.me.mockResolvedValue(user());
  mock.sendCode.mockResolvedValue({ phoneCodeHash: "private-code-hash" });
  mock.invoke.mockResolvedValue({ fullUser: { blocked: false } });
  mock.dialogs.mockResolvedValue([dialog()]);
  mock.messages.mockResolvedValue([message(2, 1), message(1)]);
});

describe("Telegram personal-account adapter", () => {
  it("does not reopen a password challenge after sign-in cancellation", async () => {
    const login = await beginTelegram({ ...secrets, phone: "+123456789" });
    let rejectCode: (error: unknown) => void = () => {};
    mock.invoke.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectCode = reject;
        }),
    );
    const pending = login.complete({ code: "12345" });
    await login.close();
    rejectCode({ errorMessage: "SESSION_PASSWORD_NEEDED" });
    await expect(pending).rejects.toMatchObject({ code: "authentication" });
  });
  it("shows broadcast channels as read-only without posting rights and preserves flood waits", async () => {
    mock.dialogs.mockResolvedValue([
      {
        ...dialog(),
        entity: new Api.Channel({
          id: returnBigInt(8),
          title: "Announcements",
          broadcast: true,
          photo: new Api.ChatPhotoEmpty(),
          date: 0,
        }),
        isUser: false,
        isGroup: false,
      },
    ]);
    const adapter = await restoreTelegram(secrets);
    expect((await adapter.conversations("account")).conversations[0]).toMatchObject({
      kind: "channel",
      canSend: false,
    });
    await expect(adapter.send("account", "8", "No post", "nonce")).rejects.toMatchObject({
      code: "permission",
    });
    mock.messages.mockRejectedValue({
      errorMessage: "FLOOD_WAIT_30",
      seconds: 30,
      message: "private-session",
    });
    await expect(adapter.messages("account", "8")).rejects.toMatchObject({
      code: "rate_limit",
      retryAfterSeconds: 30,
    });
    await adapter.close();
  });
  it("restores identity, returns real history in source order, and retains credentials only in host storage", async () => {
    const adapter = await restoreTelegram(secrets);
    expect(adapter.account).toMatchObject({
      provider: "telegram",
      identity: "7",
      label: "Actual User",
    });
    expect(JSON.stringify(adapter.account)).not.toContain("private-");
    expect(adapter.credentials()).toEqual(secrets);
    expect((await adapter.conversations("account")).conversations).toMatchObject([
      { id: "8", canSend: true, title: "Real chat" },
    ]);
    expect((await adapter.messages("account", "8", "3")).messages).toMatchObject([
      { id: "1", author: "Actual User" },
      { id: "2", replyToId: "1" },
    ]);
    expect(mock.messages).toHaveBeenCalledWith(expect.anything(), { limit: 50, offsetId: 3 });
    expect(mock.options).toHaveBeenCalledWith(
      expect.objectContaining({ requestRetries: 1, floodSleepThreshold: 0 }),
    );
    await adapter.close();
    expect(mock.destroy).toHaveBeenCalledOnce();
  });
  it("paginates native dialog offsets and history without manufacturing peers", async () => {
    mock.dialogs.mockResolvedValue(Array.from({ length: 50 }, (_, index) => dialog(index + 1)));
    const adapter = await restoreTelegram(secrets);
    const first = await adapter.conversations("account");
    expect(JSON.parse(first.nextCursor!)).toEqual({ date: 100, id: 10, peer: "50" });
    await adapter.conversations("account", first.nextCursor);
    expect(mock.dialogs.mock.calls[1]?.[0]).toMatchObject({
      offsetDate: 100,
      offsetId: 10,
      ignorePinned: true,
    });
    mock.messages.mockResolvedValue(Array.from({ length: 50 }, (_, index) => message(50 - index)));
    expect((await adapter.messages("account", "8")).nextCursor).toBe("1");
    await expect(adapter.messages("account", "unknown")).rejects.toMatchObject({
      code: "not_found",
    });
    await adapter.close();
  });
  it("keeps unknown permissions read-only and sends with a stable MTProto nonce and real reply identity", async () => {
    const adapter = await restoreTelegram(secrets);
    mock.invoke.mockRejectedValueOnce(new Error("private-session denied"));
    expect((await adapter.conversations("account")).conversations[0]?.canSend).toBe(false);
    await expect(adapter.send("account", "8", "Hello", "nonce")).rejects.toMatchObject({
      code: "permission",
    });
    mock.invoke.mockResolvedValue({ fullUser: { blocked: false } });
    await adapter.conversations("account");
    mock.response.mockReturnValue(message(3, 1));
    await adapter.send("account", "8", "Hello", "nonce", "1");
    const first = mock.invoke.mock.calls.at(-1)?.[0] as Api.messages.SendMessage;
    await adapter.send("account", "8", "Hello", "nonce", "1");
    const second = mock.invoke.mock.calls.at(-1)?.[0] as Api.messages.SendMessage;
    expect(first.randomId?.toString()).toBe(second.randomId?.toString());
    expect(first.replyTo).toBeInstanceOf(Api.InputReplyToMessage);
    expect(first.message).toBe("Hello");
    await adapter.close();
  });
  it("uses code login and delegates two-step verification to SDK SRP", async () => {
    const login = await beginTelegram({ ...secrets, phone: "+123456789" });
    mock.invoke.mockRejectedValueOnce({ errorMessage: "SESSION_PASSWORD_NEEDED" });
    expect(await login.complete({ code: "12345" })).toEqual({ prompt: "password" });
    mock.password.mockImplementation(
      async (_credentials: unknown, params: { password: () => Promise<string> }) => {
        expect(await params.password()).toBe("private-password");
        return user();
      },
    );
    const result = await login.complete({ password: "private-password" });
    expect("adapter" in result).toBe(true);
    await login.close();
    expect(mock.destroy).not.toHaveBeenCalled();
    if ("adapter" in result) await result.adapter.close();
  });
  it("closes cancelled, failed and expired sessions without disclosing SDK errors", async () => {
    const login = await beginTelegram({ ...secrets, phone: "+123456789" });
    await login.close();
    expect(mock.destroy).toHaveBeenCalledOnce();
    await expect(login.complete({ code: "12345" })).rejects.toMatchObject({
      code: "authentication",
    });
    mock.authorized.mockResolvedValue(false);
    await expect(restoreTelegram(secrets)).rejects.toMatchObject({ code: "authentication" });
    expect(mock.destroy).toHaveBeenCalledTimes(2);
    mock.connect.mockRejectedValue(new Error("private-session private-password"));
    await expect(beginTelegram({ ...secrets, phone: "+123456789" })).rejects.not.toThrow(
      "private-",
    );
    expect(mock.destroy).toHaveBeenCalledTimes(3);
  });
  it("rejects signup and unsupported email login and closes the client", async () => {
    const login = await beginTelegram({ ...secrets, phone: "+123456789" });
    mock.invoke.mockResolvedValue(new Api.auth.AuthorizationSignUpRequired({}));
    await expect(login.complete({ code: "12345" })).rejects.toMatchObject({ code: "unsupported" });
    expect(mock.destroy).toHaveBeenCalledOnce();
    mock.sendCode.mockResolvedValue({ phoneCodeHash: "private-code-hash", emailCodeSent: true });
    await expect(beginTelegram({ ...secrets, phone: "+123456789" })).rejects.toMatchObject({
      code: "unsupported",
    });
    expect(mock.destroy).toHaveBeenCalledTimes(2);
  });
});
