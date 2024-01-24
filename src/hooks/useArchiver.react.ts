/*
It archives all read or muted chats.
Inspired by https://github.com/rebryk/supertelega
See original code here: https://github.com/rebryk/supertelega/blob/master/archive.py
*/
import { useCallback } from 'react';
import { getActions, getGlobal } from '../global';

import type { ApiChat } from '../api/types';
import type { GlobalState } from '../global/types';

import { JUNE_TRACK_EVENTS, SERVICE_NOTIFICATIONS_USER_ID } from '../config';
import { selectCurrentChat, selectTabState } from '../global/selectors';
import useInterval from './useInterval.react';
import { useJune } from './useJune.react';

const UPDATE_TIME_SEC = 3;
const MESSAGE_DISPLAY_TIME_SEC = 60;
const BATCH_SIZE = 5;
const SEC_24H = 60 * 60 * 24;

export default function useArchiver({ isManual }: { isManual: boolean }) {
  const {
    openChat, toggleChatArchived, closeForumPanel, showNotification,
  } = getActions();
  const { track } = useJune();

  const chatsToArchive: { [key: string]: Date } = {};

  const shouldArchive = (chat: ApiChat, global: GlobalState) => {
    const pinnedChatIds = global.chats.orderedPinnedIds.active;
    const isPinnedInAllFolder = Boolean(pinnedChatIds?.includes(chat.id));
    const isFreshMessage = chat.lastMessage
      && (chat.lastMessage.editDate || chat.lastMessage.date || 0) > Math.round(Date.now() / 1000) - SEC_24H;
    return chat && !isPinnedInAllFolder && (chat.isMuted || !(
      chat.id === SERVICE_NOTIFICATIONS_USER_ID // impossible to archive
      || chat.hasUnreadMark
      || chat.unreadCount
      || chat.unreadMentionsCount
      || chat.unreadReactionsCount
      || (isManual && isFreshMessage)
    ));
  };

  const add = (chatId: string) => {
    if (chatId && !chatsToArchive[chatId]) {
      chatsToArchive[chatId] = new Date();
    }
  };

  const remove = (chatId: string) => {
    if (chatId && chatsToArchive[chatId]) {
      delete chatsToArchive[chatId];
    }
  };

  const archive = () => {
    if (Object.keys(chatsToArchive).length > BATCH_SIZE) {
      setTimeout(archive, UPDATE_TIME_SEC * 1000);
    }
    for (const id of Object.keys(chatsToArchive).slice(0, BATCH_SIZE)) {
      toggleChatArchived({ id });
      remove(id);
    }
  };

  const autoarchive = () => {
    const now = new Date();
    const idsToArchive = [];
    for (const [chatId, date] of Object.entries(chatsToArchive)) {
      const duration = Number(now) - Number(date);
      if (duration > MESSAGE_DISPLAY_TIME_SEC * 1000) {
        idsToArchive.push(chatId);
      }
    }
    for (const id of idsToArchive.slice(0, BATCH_SIZE)) {
      toggleChatArchived({ id });
      remove(id);
    }
  };

  const processArchiver = () => {
    const global = getGlobal();
    const notArchivedChatsIds = global.chats.listIds.active;
    if (!notArchivedChatsIds) {
      return;
    }
    for (const chatId of notArchivedChatsIds) {
      const chatsById = global.chats.byId;
      const chat = chatsById[chatId];
      if (chat && chat.id) {
        if (shouldArchive(chat, global)) {
          add(chat.id);
        } else {
          remove(chat.id);
        }
      }
    }
    if (isManual) {
      archive();
    } else if (JSON.parse(String(localStorage.getItem('ulu_is_autoarchiver_enabled')))) {
      autoarchive();
    }
  };

  useInterval(() => {
    if (!isManual) {
      processArchiver();
    }
  }, UPDATE_TIME_SEC * 1000);

  const archiveChat = useCallback(({ id, value }: { id?: string; value?: boolean }) => {
    const global = getGlobal();
    const currentChatId = selectCurrentChat(global)?.id;
    const forumPanelChatId = selectTabState(global).forumPanelChatId;

    const togglingChatId = id || currentChatId || forumPanelChatId;
    if (togglingChatId) {
      const isArchived = (global.chats.listIds.archived || []).includes(togglingChatId);
      if (value !== undefined && (isArchived === value)) {
        return;
      }
      toggleChatArchived({ id: togglingChatId });
      openChat({ id: undefined });
      if (togglingChatId === forumPanelChatId) {
        closeForumPanel();
      }
      showNotification({
        message: `The chat marked as ${isArchived ? '"Not done"' : '"Done"'}`,
      });
      track(isArchived ? JUNE_TRACK_EVENTS.UNARCHIVE_CHAT : JUNE_TRACK_EVENTS.ARCHIVE_CHAT);
    }
  }, [openChat, closeForumPanel, track]);

  return { archiveChats: processArchiver, archiveChat };
}
