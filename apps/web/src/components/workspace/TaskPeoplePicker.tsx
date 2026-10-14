import { useRef, useState } from "react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { PulseTaskMember } from "@t3tools/contracts";
import { useCommunicationsRequest } from "./useCommunicationsRequest";
import { Button } from "../ui/button";

export const taskMemberKey = (member: PulseTaskMember) =>
  JSON.stringify([member.provider, member.accountId, member.conversationId, member.memberId]);

export function TaskPeoplePicker({
  project,
  assignee,
  followers,
  disabled,
  onChange,
}: {
  project: EnvironmentProject | undefined;
  assignee: PulseTaskMember | null;
  followers: readonly PulseTaskMember[];
  disabled: boolean;
  onChange: (assignee: PulseTaskMember | null, followers: readonly PulseTaskMember[]) => void;
}) {
  const { run, available, busy, error } = useCommunicationsRequest();
  const channels =
    project?.office?.conversations.filter(
      (channel) => channel.provider === "slack" || channel.provider === "discord",
    ) ?? [];
  const [selected, setSelected] = useState("");
  const [members, setMembers] = useState<PulseTaskMember[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [note, setNote] = useState("");
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);
  const channelKey = (channel: (typeof channels)[number]) =>
    JSON.stringify([channel.provider, channel.accountId, channel.conversationId]);
  const channel = channels.find((channel) => channelKey(channel) === selected);
  async function load(more = false) {
    if (!channel || busy) return;
    const current = ++generation.current;
    const result = await run({
      operation: "members.list",
      accountId: channel.accountId,
      conversationId: channel.conversationId,
      channelOnly: true,
      ...(more && cursor ? { cursor } : {}),
    });
    if (generation.current !== current || !result) return;
    if (result.membership?.scope !== "channel") {
      setNote(
        "This service could not verify channel membership. No people from this result can be assigned.",
      );
      setMembers([]);
      setCursor(undefined);
      return;
    }
    const people: PulseTaskMember[] = result.membership.members
      .filter((member) => !member.isBot)
      .map((member) => ({
        provider: channel.provider as "slack" | "discord",
        accountId: channel.accountId,
        conversationId: channel.conversationId,
        memberId: member.id,
        displayName: member.displayName.trim().slice(0, 240) || member.id.slice(0, 240),
      }));
    setMembers((previous) => [
      ...new Map(
        [...(more ? previous : []), ...people].map((member) => [taskMemberKey(member), member]),
      ).values(),
    ]);
    setCursor(result.membership.nextCursor);
    setNote(result.membership.note);
    setLoaded(true);
  }
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-xs font-medium">People</legend>
      {!project ? (
        <p className="text-xs text-muted-foreground">
          Choose a project to assign members from its linked channels.
        </p>
      ) : (
        <>
          {!available ? (
            <p className="text-xs text-muted-foreground">
              Open Pulse desktop to choose members from this project's connected Slack or Discord
              channels.
            </p>
          ) : channels.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Link a Slack or Discord channel in project settings to assign people.
            </p>
          ) : (
            <>
              <label className="block text-xs">
                Linked channel
                <select
                  aria-label="Task member channel"
                  className="mt-1 block h-8 w-full rounded-md border border-input bg-background px-2"
                  value={selected}
                  disabled={disabled || busy}
                  onChange={(event) => {
                    generation.current++;
                    setSelected(event.target.value);
                    setMembers([]);
                    setCursor(undefined);
                    setLoaded(false);
                    setNote("");
                  }}
                >
                  <option value="">Choose a channel</option>
                  {channels.map((channel) => (
                    <option key={channelKey(channel)} value={channelKey(channel)}>
                      {channel.title} · {channel.provider}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || busy || !channel}
                onClick={() => void load()}
              >
                {busy ? "Loading members…" : "Load channel members"}
              </Button>
              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
              {note && <p className="text-xs text-muted-foreground">{note}</p>}
              {loaded && members.length === 0 && (
                <p className="text-xs text-muted-foreground">No eligible members in this page.</p>
              )}
              {channel && members.length > 0 && (
                <>
                  <label className="block text-xs">
                    Assignee
                    <select
                      aria-label="Task assignee"
                      className="mt-1 block h-8 w-full rounded-md border border-input bg-background px-2"
                      value={assignee ? taskMemberKey(assignee) : ""}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange(
                          members.find((member) => taskMemberKey(member) === event.target.value) ??
                            null,
                          followers,
                        )
                      }
                    >
                      <option value="">Unassigned</option>
                      {assignee &&
                        !members.some(
                          (member) => taskMemberKey(member) === taskMemberKey(assignee),
                        ) && (
                          <option value={taskMemberKey(assignee)}>
                            {assignee.displayName} (saved)
                          </option>
                        )}
                      {members.map((member) => (
                        <option key={taskMemberKey(member)} value={taskMemberKey(member)}>
                          {member.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset>
                    <legend className="mb-2 text-xs">Followers</legend>
                    <div className="max-h-36 space-y-2 overflow-y-auto">
                      {members.map((member) => {
                        const checked = followers.some(
                          (follower) => taskMemberKey(follower) === taskMemberKey(member),
                        );
                        return (
                          <label
                            key={taskMemberKey(member)}
                            className="flex items-center gap-2 text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled || (!checked && followers.length >= 20)}
                              onChange={(event) =>
                                onChange(
                                  assignee,
                                  event.target.checked
                                    ? [...followers, member]
                                    : followers.filter(
                                        (follower) =>
                                          taskMemberKey(follower) !== taskMemberKey(member),
                                      ),
                                )
                              }
                            />
                            {member.displayName}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                </>
              )}
              {channel && cursor && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled || busy}
                  onClick={() => void load(true)}
                >
                  Load more members
                </Button>
              )}
            </>
          )}
          <p className="text-xs text-muted-foreground">
            People are selected from a channel membership snapshot. Assigning a task does not grant
            access or notify the provider.
          </p>
        </>
      )}
      {assignee && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0 truncate">Assigned to {assignee.displayName}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onChange(null, followers)}
          >
            Unassign
          </Button>
        </div>
      )}
      {followers.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Following ({followers.length}/20)</p>
          {followers.map((member) => (
            <div
              key={taskMemberKey(member)}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="min-w-0 truncate">{member.displayName}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() =>
                  onChange(
                    assignee,
                    followers.filter(
                      (follower) => taskMemberKey(follower) !== taskMemberKey(member),
                    ),
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}
