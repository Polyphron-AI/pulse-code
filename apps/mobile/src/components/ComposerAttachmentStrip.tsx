import { SymbolView } from "../components/AppSymbol";
import { videoMimeType } from "@t3tools/shared/video";
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";

import { AppText as Text } from "./AppText";
import {
  isFileBackedComposerAttachment,
  type DraftComposerAttachment,
  type DraftComposerFileAttachment,
  type DraftComposerImageAttachment,
} from "../lib/composerImages";
import { resolveOwnedComposerAttachmentFileUri } from "../lib/composerAttachmentFiles";
import { VideoAttachmentTile } from "./VideoAttachmentTile";
import type { MediaActionsSource } from "../lib/mediaActions";
import { PresentationSource } from "./NativePresentation";
import type { FilePreviewSource } from "./FilePreviewModal";
import { isPdfFile } from "../lib/filePreview";

export interface ComposerAttachmentStripProps {
  /** Attachments to display. */
  readonly attachments: ReadonlyArray<DraftComposerAttachment>;
  /** Called when the user removes an attachment. */
  readonly onRemove: (imageId: string) => void;
  /** Called when the user taps an image or PDF to preview it. */
  readonly onPressPreview?: (source: FilePreviewSource) => void;
  readonly onPressVideo?: (
    attachment: DraftComposerFileAttachment,
    sourceIdentifier: string,
  ) => void;
  /** Image thumbnail size in points.  Defaults to 72. */
  readonly imageSize?: number;
  /** Border radius of each image thumbnail.  Defaults to 16. */
  readonly imageBorderRadius?: number;
  /** Whether the remove button should sit in its own gutter instead of overlapping the image. */
  readonly removeButtonPlacement?: "overlay" | "gutter";
}

interface ComposerAttachmentThumbnailProps {
  readonly attachment: DraftComposerAttachment;
  readonly size: number;
  readonly borderRadius: number;
  readonly compact?: boolean;
  readonly onPressPreview?: (source: FilePreviewSource) => void;
  readonly onPressVideo?: (
    attachment: DraftComposerFileAttachment,
    sourceIdentifier: string,
  ) => void;
}

/**
 * Thumbnail URI for a draft image. File-backed previews rebase into the
 * current iOS data container (its UUID changes across installs); the raw
 * persisted URI renders meanwhile, which is correct everywhere but after a
 * container move.
 */
function useComposerImagePreviewUri(attachment: DraftComposerImageAttachment): string {
  const { fileUri, previewUri } = attachment;
  const [rebased, setRebased] = useState<{ fileUri: string; uri: string } | null>(null);
  useEffect(() => {
    if (fileUri === undefined) return;
    let cancelled = false;
    void (async () => {
      const { Paths } = await import("expo-file-system");
      const owned = resolveOwnedComposerAttachmentFileUri(fileUri, Paths.document.uri);
      // Re-render only when the container actually moved.
      if (!cancelled && owned !== null && owned !== previewUri) setRebased({ fileUri, uri: owned });
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUri, previewUri]);
  return fileUri !== undefined && rebased?.fileUri === fileUri ? rebased.uri : previewUri;
}

function ComposerImageAttachment(
  props: ComposerAttachmentThumbnailProps & { readonly attachment: DraftComposerImageAttachment },
) {
  const { attachment } = props;
  const style = { width: props.size, height: props.size, borderRadius: props.borderRadius };
  const previewUri = useComposerImagePreviewUri(attachment);
  const sourceIdentifier = `draft-image:${attachment.id}`;
  return (
    <PresentationSource identifier={sourceIdentifier}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`Open ${attachment.name}`}
        disabled={!props.onPressPreview}
        onPress={() =>
          props.onPressPreview?.(
            // File-backed images open through the retain-lease + container
            // rebase path; legacy drafts still carry their inline bytes.
            isFileBackedComposerAttachment(attachment)
              ? { kind: "image", attachment, name: attachment.name, sourceIdentifier }
              : {
                  kind: "image",
                  uri: attachment.dataUrl ?? attachment.previewUri,
                  name: attachment.name,
                  sourceIdentifier,
                },
          )
        }
      >
        <Image
          source={{ uri: previewUri }}
          style={style}
          className="bg-subtle"
          resizeMode="cover"
        />
      </Pressable>
    </PresentationSource>
  );
}

export function ComposerAttachmentThumbnail(props: ComposerAttachmentThumbnailProps) {
  const { attachment } = props;
  const style = { width: props.size, height: props.size, borderRadius: props.borderRadius };
  if (attachment.type === "image") {
    return <ComposerImageAttachment {...props} attachment={attachment} />;
  }
  const onPressVideo = props.onPressVideo;
  if (onPressVideo && videoMimeType(attachment) !== null) {
    return (
      <ComposerVideoAttachment {...props} attachment={attachment} onPressVideo={onPressVideo} />
    );
  }
  const canPreview = isPdfFile(attachment) && props.onPressPreview !== undefined;
  const sourceIdentifier = `draft-file:${attachment.id}`;
  return (
    <PresentationSource identifier={sourceIdentifier}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${attachment.name}`}
        disabled={!canPreview}
        onPress={() =>
          props.onPressPreview?.({
            kind: "pdf",
            name: attachment.name,
            attachment,
            sourceIdentifier,
          })
        }
        className={
          props.compact
            ? "items-center justify-center bg-subtle"
            : "items-center justify-center gap-1 bg-subtle px-2"
        }
        style={style}
      >
        <SymbolView
          name="doc.text"
          size={props.compact ? 15 : 22}
          tintColor="#a3a3a3"
          type="monochrome"
        />
        {!props.compact ? (
          <Text className="w-full text-center text-2xs text-foreground" numberOfLines={1}>
            {attachment.name}
          </Text>
        ) : null}
      </Pressable>
    </PresentationSource>
  );
}

function ComposerVideoAttachment(props: {
  readonly attachment: DraftComposerFileAttachment;
  readonly size: number;
  readonly borderRadius: number;
  readonly compact?: boolean;
  readonly onPressVideo: (
    attachment: DraftComposerFileAttachment,
    sourceIdentifier: string,
  ) => void;
}) {
  const { attachment } = props;
  const sourceIdentifier = `draft:${attachment.id}`;
  const style = { width: props.size, height: props.size, borderRadius: props.borderRadius };
  const actionsSource = useMemo<MediaActionsSource>(
    () => ({
      name: attachment.name,
      mimeType: videoMimeType(attachment) ?? attachment.mimeType,
      sourceIdentifier,
      attachment,
    }),
    [attachment, sourceIdentifier],
  );

  return (
    <VideoAttachmentTile
      name={attachment.name}
      sourceIdentifier={sourceIdentifier}
      thumbnailSource={attachment}
      compact={props.compact}
      onPress={() => props.onPressVideo(attachment, sourceIdentifier)}
      actionsSource={actionsSource}
      style={style}
    />
  );
}

/**
 * Attachment thumbnails used by the thread composer and the new-task draft screen.
 */
export function ComposerAttachmentStrip(props: ComposerAttachmentStripProps) {
  const size = props.imageSize ?? 72;
  const radius = props.imageBorderRadius ?? 16;
  const removeButtonPlacement = props.removeButtonPlacement ?? "overlay";
  const removeButtonGutter = removeButtonPlacement === "gutter" ? 10 : 0;

  if (props.attachments.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      className="grow-0"
    >
      <View className="flex-row gap-2.5">
        {props.attachments.map((attachment) => (
          <View
            key={attachment.id}
            className="relative"
            style={{
              paddingTop: removeButtonGutter,
              paddingRight: removeButtonGutter,
            }}
          >
            <ComposerAttachmentThumbnail
              attachment={attachment}
              size={size}
              borderRadius={radius}
              onPressPreview={props.onPressPreview}
              onPressVideo={props.onPressVideo}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${attachment.name}`}
              className="absolute h-[22px] w-[22px] items-center justify-center rounded-[11px] bg-black/55"
              style={{
                top: removeButtonPlacement === "gutter" ? 0 : 4,
                right: removeButtonPlacement === "gutter" ? 0 : 4,
              }}
              hitSlop={6}
              onPress={() => props.onRemove(attachment.id)}
            >
              <SymbolView
                name="xmark"
                size={9}
                tintColor="#ffffff"
                type="monochrome"
                weight="bold"
              />
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
