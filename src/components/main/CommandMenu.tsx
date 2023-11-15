/* eslint-disable arrow-parens */
/* eslint-disable react/no-array-index-key */
/* eslint-disable react/no-unstable-nested-components */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable react/jsx-no-bind */
import React from 'react';
// eslint-disable-next-line react/no-deprecated
import { render } from 'react-dom';
// eslint-disable-next-line react/no-deprecated
import { Command, CommandSeparator } from 'cmdk';
import type { FC } from '../../lib/teact/teact';
import {
  memo, useCallback, useEffect, useState,
} from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiUser } from '../../api/types';

import { getMainUsername, getUserFirstOrLastName } from '../../global/helpers';
import captureKeyboardListeners from '../../util/captureKeyboardListeners';
import { convertLayout } from '../../util/convertLayout';
import { throttle } from '../../util/schedulers';
import renderText from '../common/helpers/renderText';

import useArchiver from '../../hooks/useArchiver';
import useCommands from '../../hooks/useCommands';
import { useJune } from '../../hooks/useJune';

import './CommandMenu.scss';

const cmdkRoot = document.getElementById('cmdk-root');
const SEARCH_CLOSE_TIMEOUT_MS = 250;

interface CommandMenuProps {
  topUserIds: string[];
  usersById: Record<string, ApiUser>;
}

const customFilter = (value: string, search: string) => {
  const convertedSearch = convertLayout(search);
  if (value.toLowerCase().includes(search.toLowerCase())
      || value.toLowerCase().includes(convertedSearch.toLowerCase())) {
    return 1; // полное соответствие
  }
  return 0; // нет соответствия
};

const CommandMenu: FC<CommandMenuProps> = ({ topUserIds, usersById }) => {
  const { track } = useJune();
  const { showNotification } = getActions();
  const [isOpen, setOpen] = useState(false);
  /* const [isArchiverEnabled, setIsArchiverEnabled] = useState(
    !!JSON.parse(String(localStorage.getItem('ulu_is_autoarchiver_enabled'))),
  ); */
  const { archiveMessages } = useArchiver({ isManual: true });
  const [inputValue, setInputValue] = useState('');
  const [menuItems, setMenuItems] = useState<Array<{ label: string; value: string }>>([]);
  const { runCommand } = useCommands();
  const [pages, setPages] = useState(['home']);
  const activePage = pages[pages.length - 1];

  interface SuggestedContactsProps {
    topUserIds: string[];
    usersById: Record<string, ApiUser>;
  }

  const close = useCallback(() => {
    setOpen(false);
    setPages(['home']);
  }, []);

  const SuggestedContacts: FC<SuggestedContactsProps> = ({ topUserIds }) => {
    const { loadTopUsers, openChat, addRecentlyFoundChatId } = getActions();
    const runThrottled = throttle(() => loadTopUsers(), 60000, true);

    useEffect(() => {
      runThrottled();
    // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
    }, [loadTopUsers]);

    const renderName = (userId: string) => {
      const NBSP = '\u00A0';
      const user = usersById[userId];
      const name = Boolean(user) && (getUserFirstOrLastName(user) || NBSP);
      const handle = Boolean(user) && (getMainUsername(user) || NBSP);
      const renderedName = renderText(name);
      const displayedName = React.isValidElement(renderedName) ? renderedName : name;
      return (
        <span>
          <span className="user-name">{displayedName}</span>
          <span className="user-handle">
            {((handle === NBSP) ? '' : '@')}
            {handle}
          </span>
        </span>
      );
    };

    const handleClick = useCallback((id: string) => {
      openChat({ id, shouldReplaceHistory: true });
      setTimeout(() => addRecentlyFoundChatId({ id }), SEARCH_CLOSE_TIMEOUT_MS);
      close();
    }, [openChat, addRecentlyFoundChatId]);

    return (
      <Command.Group heading="Suggested contacts">
        {topUserIds.map((userId) => {
          return (
            <Command.Item key={userId} onSelect={() => handleClick(userId)}>
              <span>{renderName(userId)}</span>
            </Command.Item>
          );
        })}
      </Command.Group>
    );
  };

  // Toggle the menu when ⌘K is pressed
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyK') {
        setOpen(!isOpen);
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [isOpen]);

  const handleInputChange = (newValue: string) => {
    setInputValue(newValue);
  };

  useEffect(() => {
    if (inputValue.length === 51) {
      // Создаем пункт меню для сохранения ключа
      const newLabel = `Save/update OpenAI key: ${inputValue}`;
      const newItem = { label: newLabel, value: 'save_api_key' };

      if (!menuItems.some(item => item.label === newLabel)) {
        setMenuItems(prevItems => [...prevItems, newItem]);
      }
    } else {
      setMenuItems([]); // Очищаем пункты меню, если ключ невалиден
    }
  }, [inputValue, menuItems]);

  const handleBack = useCallback(() => {
    if (pages.length > 1) {
      const newPages = pages.slice(0, -1);
      setPages(newPages);
    }
  }, [pages]);

  useEffect(() => (
    isOpen ? captureKeyboardListeners({ onEsc: close }) : undefined
  ), [isOpen, close]);

  const saveAPIKey = useCallback(() => {
    localStorage.setItem('openai_api_key', inputValue);
    showNotification({ message: 'The OpenAI API key has been saved.' });
    setOpen(false);
  }, [inputValue]);

  const handleSelectNewChannel = useCallback(() => {
    runCommand('NEW_CHANNEL');
    close();
  }, [runCommand, close]);

  const handleSelectNewGroup = useCallback(() => {
    runCommand('NEW_GROUP');
    close();
  }, [runCommand, close]);

  const handleCreateFolder = useCallback(() => {
    runCommand('NEW_FOLDER');
    close();
  }, [runCommand, close]);

  /* const commandToggleArchiver = useCallback(() => {
    const updIsArchiverEnabled = !isArchiverEnabled;
    showNotification({ message: updIsArchiverEnabled ? 'Archiver enabled!' : 'Archiver disabled!' });
    localStorage.setItem('ulu_is_autoarchiver_enabled', JSON.stringify(updIsArchiverEnabled));
    setIsArchiverEnabled(updIsArchiverEnabled);
    close();
  }, [close, isArchiverEnabled]); */

  const commandArchiveAll = useCallback(() => {
    showNotification({ message: 'All older than 24 hours will be archived!' });
    archiveMessages();
    close();
    if (track) {
      track('commandArchiveAll');
    }
  }, [close, archiveMessages, track]);

  interface HomePageProps {
    setPages: (pages: string[]) => void;
    commandArchiveAll: () => void;
    topUserIds: string[];
    usersById: Record<string, ApiUser>;
  }

  interface CreateNewPageProps {
    handleSelectNewGroup: () => void;
    handleSelectNewChannel: () => void;
    handleCreateFolder: () => void;
  }

  const HomePage: React.FC<HomePageProps> = ({
    setPages, commandArchiveAll, topUserIds, usersById,
  }) => {
    return (
      <>
        {topUserIds && usersById && <SuggestedContacts topUserIds={topUserIds} usersById={usersById} />}
        <Command.Group heading="Create new...">
          <Command.Item onSelect={() => setPages(['home', 'createNew'])}>
            <i className="icon icon-add" /><span>Create new...</span>
          </Command.Item>
        </Command.Group>
        <CommandSeparator />
        <Command.Group heading="Settings">
          <Command.Item onSelect={commandArchiveAll}>
            <i className="icon icon-archive" /><span>Mark read chats as &quot;Done&quot; (May take ~1-3 min)</span>
          </Command.Item>
          {menuItems.map((item, index) => (
            <Command.Item key={index} onSelect={item.value === 'save_api_key' ? saveAPIKey : undefined}>
              {item.label}
            </Command.Item>
          ))}
        </Command.Group>
      </>
    );
  };

  const CreateNewPage: React.FC<CreateNewPageProps> = (
    { handleSelectNewGroup, handleSelectNewChannel, handleCreateFolder },
  ) => {
    return (
      <>
        <Command.Item onSelect={handleSelectNewGroup}>
          <i className="icon icon-group" /><span>Create new group</span>
        </Command.Item>
        <Command.Item onSelect={handleSelectNewChannel}>
          <i className="icon icon-channel" /><span>Create new channel</span>
        </Command.Item>
        <Command.Item onSelect={handleCreateFolder}>
          <i className="icon icon-folder" /><span>Create new folder</span>
        </Command.Item>
      </>
    );
  };

  const CommandMenuInner = (
    <Command.Dialog
      label="Command Menu"
      open={isOpen}
      onOpenChange={setOpen}
      loop
      shouldFilter
      filter={customFilter}
    >
      <Command.Input
        placeholder="Search for command..."
        autoFocus
        onValueChange={handleInputChange}
        value={inputValue}
        onKeyDown={(e) => {
          if (e.key === 'Backspace') {
            handleBack();
          }
        }}
      />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>
        {activePage === 'home' && (
          <HomePage
            setPages={setPages}
            commandArchiveAll={commandArchiveAll}
            topUserIds={topUserIds}
            usersById={usersById}
          />
        )}
        {activePage === 'createNew' && (
          <CreateNewPage
            handleSelectNewGroup={handleSelectNewGroup}
            handleSelectNewChannel={handleSelectNewChannel}
            handleCreateFolder={handleCreateFolder}
          />
        )}
      </Command.List>
    </Command.Dialog>
  );

  render(CommandMenuInner, cmdkRoot);
  return <div />;
};

export default memo(withGlobal(
  (global): { topUserIds?: string[]; usersById: Record<string, ApiUser> } => {
    const { userIds: topUserIds } = global.topPeers;
    const usersById = global.users.byId;

    return { topUserIds, usersById };
  },
)(CommandMenu));
