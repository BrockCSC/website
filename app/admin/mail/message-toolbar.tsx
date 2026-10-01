"use client";

import {
  Archive,
  FolderInput,
  Forward,
  Info,
  SquarePen,
  MailOpen,
  Maximize2,
  Minimize2,
  Reply,
  ReplyAll,
  Star,
  Trash2,
} from "lucide-react";
import {
  ActionSheet,
  type ActionSheetAction,
} from "@/components/ui/action-sheet";
import {
  BottomToolbar,
  type ToolbarItem,
} from "@/components/ui/bottom-toolbar";

/**
 * The phone message screen's bottom bar (spec §3.2 step 6): Archive, Move,
 * Delete (Request deletion in Trash), Reply all or Forward, and Reply as the
 * one primary. Archive, Move and Delete act on the whole conversation. In
 * Drafts: Delete and "Edit draft" (replying to your own draft means nothing).
 */
export function MessageToolbar({
  inTrash,
  inDrafts = false,
  onEditDraft,
  inArchive,
  deletionPending,
  replyAll,
  onArchive,
  onMove,
  onDelete,
  onPurge,
  onReplyAll,
  onForward,
  onReply,
}: {
  inTrash: boolean;
  inDrafts?: boolean;
  onEditDraft?: () => void;
  inArchive: boolean;
  deletionPending: boolean;
  replyAll: boolean;
  onArchive: () => void;
  onMove: () => void;
  onDelete: () => void;
  onPurge: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onReply: () => void;
}) {
  if (inDrafts && onEditDraft) {
    const draftItems: ToolbarItem[] = [
      {
        key: "delete",
        label: "Delete",
        icon: Trash2,
        destructive: true,
        onPress: onDelete,
      },
      {
        key: "edit",
        label: "Edit draft",
        icon: SquarePen,
        primary: true,
        onPress: onEditDraft,
      },
    ];
    return <BottomToolbar label="Message actions" items={draftItems} />;
  }
  const items: ToolbarItem[] = [
    {
      key: "archive",
      label: "Archive",
      icon: Archive,
      onPress: onArchive,
      disabled: inArchive,
    },
    { key: "move", label: "Move", icon: FolderInput, onPress: onMove },
    inTrash
      ? {
          key: "purge",
          label: deletionPending ? "Deletion requested" : "Request deletion",
          icon: Trash2,
          destructive: true,
          disabled: deletionPending,
          onPress: onPurge,
        }
      : {
          key: "delete",
          label: "Delete",
          icon: Trash2,
          destructive: true,
          onPress: onDelete,
        },
    replyAll
      ? {
          key: "reply-all",
          label: "Reply all",
          icon: ReplyAll,
          onPress: onReplyAll,
        }
      : { key: "forward", label: "Forward", icon: Forward, onPress: onForward },
    {
      key: "reply",
      label: "Reply",
      icon: Reply,
      primary: true,
      onPress: onReply,
    },
  ];
  return <BottomToolbar label="Message actions" items={items} />;
}

/**
 * Phone selection mode's bottom bar (spec §3.2 step 9). Move, Archive and
 * Delete act on whole conversations.
 */
export function SelectionToolbar({
  anyUnread,
  allFlagged,
  inTrash,
  inArchive,
  onRead,
  onStar,
  onMove,
  onArchive,
  onDelete,
  onPurge,
}: {
  anyUnread: boolean;
  allFlagged: boolean;
  inTrash: boolean;
  inArchive: boolean;
  onRead: (seen: boolean) => void;
  onStar: (flagged: boolean) => void;
  onMove: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onPurge: () => void;
}) {
  const items: ToolbarItem[] = [
    {
      key: "read",
      label: anyUnread ? "Read" : "Unread",
      icon: MailOpen,
      onPress: () => onRead(anyUnread),
    },
    {
      key: "star",
      label: allFlagged ? "Unstar" : "Star",
      icon: Star,
      pressed: allFlagged,
      onPress: () => onStar(!allFlagged),
    },
    { key: "move", label: "Move", icon: FolderInput, onPress: onMove },
    {
      key: "archive",
      label: "Archive",
      icon: Archive,
      onPress: onArchive,
      disabled: inArchive,
    },
    inTrash
      ? {
          key: "purge",
          label: "Request deletion",
          icon: Trash2,
          destructive: true,
          onPress: onPurge,
        }
      : {
          key: "delete",
          label: "Delete",
          icon: Trash2,
          destructive: true,
          onPress: onDelete,
        },
  ];
  return <BottomToolbar label="Selection actions" items={items} />;
}

/**
 * The message screen's ⋯ sheet (phone): Mark unread, Move to…, Forward (when
 * the toolbar's fourth slot is Reply all), Original size / Fit to screen
 * (only when the body was scaled), and Details.
 */
export function MessageMoreSheet({
  open,
  onClose,
  viewing,
  replyAll,
  canFit,
  originalSize,
  detailsOpen,
  onUnread,
  onMove,
  onForward,
  onToggleFit,
  onToggleDetails,
}: {
  open: boolean;
  onClose: () => void;
  viewing: boolean;
  replyAll: boolean;
  canFit: boolean;
  originalSize: boolean;
  detailsOpen: boolean;
  onUnread: () => void;
  onMove: () => void;
  onForward: () => void;
  onToggleFit: () => void;
  onToggleDetails: () => void;
}) {
  const actions: ActionSheetAction[] = [
    ...(viewing
      ? []
      : [
          {
            key: "unread",
            label: "Mark unread",
            icon: MailOpen,
            onSelect: onUnread,
          },
          {
            key: "move",
            label: "Move to…",
            icon: FolderInput,
            onSelect: onMove,
          },
          ...(replyAll
            ? [
                {
                  key: "forward",
                  label: "Forward",
                  icon: Forward,
                  onSelect: onForward,
                },
              ]
            : []),
        ]),
    ...(canFit
      ? [
          {
            key: "fit",
            label: originalSize ? "Fit to screen" : "Original size",
            icon: originalSize ? Minimize2 : Maximize2,
            onSelect: onToggleFit,
          },
        ]
      : []),
    {
      key: "details",
      label: detailsOpen ? "Hide details" : "Details",
      icon: Info,
      onSelect: onToggleDetails,
    },
  ];
  return (
    <ActionSheet
      open={open}
      onClose={onClose}
      title="Message"
      actions={actions}
    />
  );
}
