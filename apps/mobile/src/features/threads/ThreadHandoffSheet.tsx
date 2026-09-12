import type { ModelSelection } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import * as Cause from "effect/Cause";
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, View } from "react-native";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text, AppTextInput as TextInput } from "../../components/AppText";
import { AndroidSheetHeader } from "../../components/AndroidScreenHeader";
import { cn } from "../../lib/cn";
import { resolveModelSelectionLabel } from "../../lib/threadModelSwitch";
import { orchestrationEnvironment } from "../../state/orchestration";
import { useEnvironmentQuery } from "../../state/query";
import { useThreadHandoffPreview } from "../../state/queries";
import { environmentServerConfigsAtom } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useThreadSelection } from "../../state/use-thread-selection";
import { useThemeColor } from "../../lib/useThemeColor";
import { SheetActionButton } from "./git/gitSheetComponents";

const DEFAULT_NEXT_INSTRUCTION = "Continue from where the conversation left off.";

export type ThreadHandoffRouteSession = {
  readonly ownerId: string;
  readonly fromModelSelection: ModelSelection | null;
  readonly toModelSelection: ModelSelection;
};

type ThreadHandoffRouteContextValue = {
  readonly session: ThreadHandoffRouteSession | null;
  readonly present: (session: ThreadHandoffRouteSession) => void;
  readonly clear: (ownerId: string) => void;
};

const ThreadHandoffRouteContext = createContext<ThreadHandoffRouteContextValue | null>(null);

/** Bridges a picked handoff target from the composer into the root sheet route. */
export function ThreadHandoffRouteProvider(props: { readonly children: ReactNode }) {
  const [session, setSession] = useState<ThreadHandoffRouteSession | null>(null);
  const present = useCallback((nextSession: ThreadHandoffRouteSession) => {
    setSession(nextSession);
  }, []);
  const clear = useCallback((ownerId: string) => {
    setSession((current) => (current?.ownerId === ownerId ? null : current));
  }, []);
  const value = useMemo(() => ({ session, present, clear }), [clear, present, session]);

  return (
    <ThreadHandoffRouteContext.Provider value={value}>
      {props.children}
    </ThreadHandoffRouteContext.Provider>
  );
}

export function useThreadHandoffRoutePresentation() {
  const value = use(ThreadHandoffRouteContext);
  if (!value) {
    throw new Error(
      "useThreadHandoffRoutePresentation must be used inside ThreadHandoffRouteProvider.",
    );
  }
  return value;
}

function basisNote(
  basis: "verbatim" | "generated" | "fallback",
  toLabel: string,
): { readonly text: string; readonly warning: boolean } {
  if (basis === "verbatim") {
    return { text: "Full conversation included.", warning: false };
  }
  if (basis === "generated") {
    return { text: `Summary written by ${toLabel}.`, warning: false };
  }
  return {
    text: "Summary unavailable, only the first line of each older message is included.",
    warning: true,
  };
}

type ThreadHandoffSheetProps = StaticScreenProps<{
  readonly environmentId: string;
  readonly threadId: string;
}>;

export function ThreadHandoffSheet(_props: ThreadHandoffSheetProps) {
  const navigation = useNavigation();
  const presentation = useThreadHandoffRoutePresentation();
  const session = presentation.session;
  const { selectedThread } = useThreadSelection();
  const serverConfigs = useAtomValue(environmentServerConfigsAtom);
  const [nextInstruction, setNextInstruction] = useState(DEFAULT_NEXT_INSTRUCTION);
  const [isDigestExpanded, setIsDigestExpanded] = useState(false);
  const iconSubtleColor = useThemeColor("--color-icon-subtle");
  const warningColor = useThemeColor("--color-amber-600", "#b45309");

  const providers = useMemo(
    () =>
      selectedThread ? (serverConfigs.get(selectedThread.environmentId)?.providers ?? []) : [],
    [selectedThread, serverConfigs],
  );
  const toLabel = resolveModelSelectionLabel(providers, session?.toModelSelection ?? null);

  const preview = useThreadHandoffPreview(
    selectedThread && session
      ? {
          environmentId: selectedThread.environmentId,
          threadId: selectedThread.id,
          toModelSelection: session.toModelSelection,
        }
      : null,
  );
  const digest = preview.data?.digest ?? null;

  const switchThreadProvider = useAtomCommand(orchestrationEnvironment.switchThreadProvider, {
    reportFailure: false,
  });
  const interruptThreadTurn = useAtomCommand(threadEnvironment.interruptTurn, "thread interrupt");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBusy =
    selectedThread?.session?.status === "running" || selectedThread?.session?.status === "starting";

  const handleClose = useCallback(() => {
    if (session) {
      presentation.clear(session.ownerId);
    }
    navigation.goBack();
  }, [navigation, presentation, session]);

  const handleStop = useCallback(() => {
    if (!selectedThread || !isBusy) {
      return;
    }
    void interruptThreadTurn({
      environmentId: selectedThread.environmentId,
      input: {
        threadId: selectedThread.id,
        ...(selectedThread.session?.activeTurnId
          ? { turnId: selectedThread.session.activeTurnId }
          : {}),
      },
    });
  }, [interruptThreadTurn, isBusy, selectedThread]);

  const handleSubmit = useCallback(async () => {
    if (!selectedThread || !session || isBusy || isSubmitting) {
      return;
    }
    const trimmedInstruction = nextInstruction.trim();
    setIsSubmitting(true);
    const result = await switchThreadProvider({
      environmentId: selectedThread.environmentId,
      input: {
        threadId: selectedThread.id,
        toModelSelection: session.toModelSelection,
        ...(trimmedInstruction ? { nextInstruction: trimmedInstruction } : {}),
        ...(digest ? { digest } : {}),
      },
    });
    setIsSubmitting(false);

    if (result._tag === "Failure") {
      const error: unknown = Cause.squash(result.cause);
      const reason =
        error && typeof error === "object" && "reason" in error
          ? (error as { reason?: unknown }).reason
          : undefined;
      const message =
        reason === "thread-busy"
          ? "Stop the current turn before switching."
          : error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "The thread could not be switched.";
      Alert.alert("Could not switch", message);
      return;
    }

    handleClose();
  }, [
    digest,
    handleClose,
    isBusy,
    isSubmitting,
    nextInstruction,
    selectedThread,
    session,
    switchThreadProvider,
  ]);

  if (!session) {
    return <View className="flex-1 bg-sheet" />;
  }

  const canSubmit = !isBusy && !isSubmitting && !preview.isPending && digest !== null;

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <AndroidSheetHeader title={`Switch to ${toLabel}`} onBack={handleClose} />
      ) : null}
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-4 px-5 pt-2 pb-6"
      >
        {Platform.OS !== "android" ? (
          <Text className="text-foreground text-xl font-t3-bold">Switch to {toLabel}</Text>
        ) : null}
        <Text className="text-foreground-secondary text-sm leading-normal">
          The new model starts a fresh session in this thread, seeded with a digest of everything so
          far.
        </Text>

        {preview.isPending || digest === null ? (
          <View className="items-center gap-2 rounded-[22px] border border-border bg-card px-4 py-8">
            <ActivityIndicator />
            <Text className="text-foreground-muted text-sm">Preparing the handoff...</Text>
            {preview.error ? (
              <Text className="text-danger-foreground text-xs leading-normal">{preview.error}</Text>
            ) : null}
          </View>
        ) : (
          <>
            <View className="flex-row gap-3">
              <View className="flex-1 gap-1 rounded-[18px] border border-border bg-card px-3 py-3">
                <Text className="text-foreground text-lg font-t3-bold">{digest.messageCount}</Text>
                <Text className="text-foreground-muted text-2xs leading-normal">
                  messages included
                </Text>
              </View>
              <View className="flex-1 gap-1 rounded-[18px] border border-border bg-card px-3 py-3">
                <Text className="text-foreground text-lg font-t3-bold">{digest.omittedCount}</Text>
                <Text className="text-foreground-muted text-2xs leading-normal">
                  older messages summarized
                </Text>
              </View>
              <View className="flex-1 gap-1 rounded-[18px] border border-border bg-card px-3 py-3">
                <Text className="text-foreground text-lg font-t3-bold">{digest.files.length}</Text>
                <Text className="text-foreground-muted text-2xs leading-normal">files touched</Text>
              </View>
            </View>

            {(() => {
              const note = basisNote(digest.basis, toLabel);
              return (
                <Text
                  className={cn(
                    "text-xs leading-normal",
                    note.warning ? "font-t3-medium" : "text-foreground-muted",
                  )}
                  style={note.warning ? { color: warningColor } : undefined}
                >
                  {note.text}
                </Text>
              );
            })()}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isDigestExpanded }}
              onPress={() => setIsDigestExpanded((current) => !current)}
              className="flex-row items-center gap-2 py-1"
            >
              <Text className="text-foreground text-sm font-t3-bold">
                What the new model will receive
              </Text>
              <SymbolView
                name={isDigestExpanded ? "chevron.up" : "chevron.down"}
                size={12}
                tintColor={iconSubtleColor}
                type="monochrome"
              />
            </Pressable>
            {isDigestExpanded ? (
              <ScrollView
                className="max-h-64 rounded-[18px] border border-border bg-subtle"
                contentContainerClassName="p-3"
              >
                <Text selectable className="font-mono text-xs leading-normal text-foreground">
                  {digest.text}
                </Text>
              </ScrollView>
            ) : null}
          </>
        )}

        <View className="gap-2">
          <Text className="text-foreground text-sm font-t3-bold">Next instruction</Text>
          <TextInput
            multiline
            value={nextInstruction}
            onChangeText={setNextInstruction}
            textAlignVertical="top"
            className="min-h-[80px] rounded-[20px] px-4 py-3.5"
          />
        </View>

        {isBusy ? (
          <View className="gap-2 rounded-[18px] border border-danger-border bg-danger px-4 py-3">
            <Text className="text-danger-foreground text-sm font-t3-medium">
              Stop the current turn first.
            </Text>
            <SheetActionButton icon="stop.fill" label="Stop" tone="danger" onPress={handleStop} />
          </View>
        ) : null}

        <View className="flex-row gap-3">
          <View className="flex-1">
            <SheetActionButton label="Cancel" onPress={handleClose} />
          </View>
          <View className="flex-1">
            <SheetActionButton
              icon="arrow.triangle.2.circlepath"
              label="Switch and send"
              tone="primary"
              disabled={!canSubmit}
              onPress={() => void handleSubmit()}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
