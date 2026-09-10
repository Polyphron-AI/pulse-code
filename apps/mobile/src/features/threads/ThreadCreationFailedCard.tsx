import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";

/**
 * Shown in place of the composer when the server rejected a new task. The
 * prompt and attachments are already back in the project draft, so the only
 * action is reopening it.
 */
export function ThreadCreationFailedCard(props: {
  readonly reason: string;
  readonly onEditTask: () => void;
}) {
  return (
    <View className="gap-2.5 rounded-[20px] border border-neutral-200 bg-neutral-100 dark:border-white/6 dark:bg-neutral-900 p-4">
      <Text className="font-t3-bold text-2xs uppercase tracking-[1.1px] text-rose-700 dark:text-rose-300">
        Could not start task
      </Text>
      <Text className="font-sans text-sm leading-normal text-neutral-600 dark:text-neutral-400">
        {props.reason}
      </Text>
      <Text className="font-sans text-xs leading-normal text-neutral-600 dark:text-neutral-400">
        Your prompt was kept in the project draft.
      </Text>
      <View className="flex-row">
        <Pressable
          accessibilityRole="button"
          className="items-center justify-center rounded-[14px] bg-blue-500 px-3.5 py-3"
          onPress={props.onEditTask}
        >
          <Text className="text-sm font-t3-extrabold text-white">Edit task</Text>
        </Pressable>
      </View>
    </View>
  );
}
