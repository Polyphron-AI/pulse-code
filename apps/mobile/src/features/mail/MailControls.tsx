import { useNavigation } from "@react-navigation/native";
import type { ReactNode } from "react";
import { Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { AppText as Text } from "../../components/AppText";
import { NativeStackScreenOptions } from "../../native/StackHeader";

export function MailScreen({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-sheet">
      <NativeStackScreenOptions options={{ title, headerShown: Platform.OS !== "android" }} />
      {Platform.OS === "android" ? (
        <AndroidScreenHeader title={title} onBack={() => navigation.goBack()} />
      ) : null}
      <KeyboardAvoidingView
        className="flex-1"
        automaticOffset
        behavior="padding"
        enabled={footer !== undefined}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="gap-4 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: footer ? 18 : Math.max(insets.bottom, 18) + 18 }}
        >
          {children}
        </ScrollView>
        {footer ? (
          <View
            className="gap-2 border-t border-input-border bg-sheet px-5 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

export function MailButton({
  children,
  onPress,
  disabled = false,
}: {
  children: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`min-h-11 justify-center rounded-xl border border-input-border px-3 py-2 ${disabled ? "opacity-40" : "bg-subtle"}`}
    >
      <Text className="text-base text-foreground">{children}</Text>
    </Pressable>
  );
}

export function MailField({
  label,
  value,
  onChangeText,
  secure = false,
  multiline = false,
  numeric = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secure?: boolean;
  multiline?: boolean;
  numeric?: boolean;
  disabled?: boolean;
}) {
  return (
    <View className="gap-1">
      <Text className="text-sm text-foreground-muted">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        secureTextEntry={secure}
        multiline={multiline}
        keyboardType={numeric ? "number-pad" : "default"}
        autoCapitalize="none"
        autoCorrect={false}
        textAlignVertical={multiline ? "top" : "center"}
        className={`rounded-xl border border-input-border bg-input px-3 py-3 text-base text-foreground ${multiline ? "min-h-48" : "min-h-11"}`}
      />
    </View>
  );
}

export function MailNotice({ children }: { children: ReactNode }) {
  return (
    <View accessibilityLiveRegion="polite" className="rounded-xl bg-subtle p-3">
      <Text className="text-sm text-foreground-muted">{children}</Text>
    </View>
  );
}
