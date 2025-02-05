import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, /*  useCallback, */ useEffect, useMemo, useRef, /* useState, */
} from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { GlobalState } from '../../../global/types';
import type { ISettings } from '../../../types';
import { LeftColumnContent, SettingsScreens } from '../../../types';

import {
  APP_NAME,
  DEBUG,
  IS_BETA,
  IS_STORIES_ENABLED,
} from '../../../config';
import {
  selectCanSetPasscode,
  selectCurrentMessageList,
  selectIsCurrentUserPremium,
  selectTabState,
  selectTheme,
} from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';
import captureEscKeyListener from '../../../util/captureEscKeyListener';
import { formatDateToString } from '../../../util/dateFormat';
import { IS_APP, IS_ELECTRON, IS_MAC_OS } from '../../../util/windowEnvironment';

import useAppLayout from '../../../hooks/useAppLayout';
import useCommands from '../../../hooks/useCommands';
import useConnectionStatus from '../../../hooks/useConnectionStatus';
import useElectronDrag from '../../../hooks/useElectronDrag';
import useFlag from '../../../hooks/useFlag';
import { useHotkeys } from '../../../hooks/useHotkeys';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';
import { useFullscreenStatus } from '../../../hooks/window/useFullscreen';
import useLeftHeaderButtonRtlForumTransition from './hooks/useLeftHeaderButtonRtlForumTransition';

import PickerSelectedItem from '../../common/PickerSelectedItem';
import StoryToggler from '../../story/StoryToggler';
import Button from '../../ui/Button';
import DropdownMenu from '../../ui/DropdownMenu';
import SearchInput from '../../ui/SearchInput';
import ShowTransition from '../../ui/ShowTransition';
import UluSearchButton from '../../ui/UluSearchButton';
import ConnectionStatusOverlay from '../ConnectionStatusOverlay';
import LeftSideMenuItems from './LeftSideMenuItems';
/* import WorkspaceDropdown from './SettingsDropdown'; */
import StatusButton from './StatusButton';
import UluHeaderProfile from './UluHeaderProfile';

import styles from './LeftMainHeader.module.scss';

type OwnProps = {
  shouldHideSearch?: boolean;
  content: LeftColumnContent;
  contactsFilter: string;
  isClosingSearch?: boolean;
  onSearchQuery: (query: string) => void;
  onSelectSettings: NoneToVoidFunction;
  onSelectContacts: NoneToVoidFunction;
  onSelectArchived: NoneToVoidFunction;
  onReset: NoneToVoidFunction;
};

type StateProps =
  {
    searchQuery?: string;
    isLoading: boolean;
    globalSearchChatId?: string;
    searchDate?: number;
    theme: ISettings['theme'];
    isMessageListOpen: boolean;
    isCurrentUserPremium?: boolean;
    isConnectionStatusMinimized: ISettings['isConnectionStatusMinimized'];
    areChatsLoaded?: boolean;
    hasPasscode?: boolean;
    canSetPasscode?: boolean;
  }
  & Pick<GlobalState, 'connectionState' | 'isSyncing' | 'isFetchingDifference'>;

const CLEAR_DATE_SEARCH_PARAM = { date: undefined };
const CLEAR_CHAT_SEARCH_PARAM = { id: undefined };

const LeftMainHeader: FC<OwnProps & StateProps> = ({
  shouldHideSearch,
  content,
  contactsFilter,
  isClosingSearch,
  searchQuery,
  isLoading,
  isCurrentUserPremium,
  globalSearchChatId,
  searchDate,
  theme,
  connectionState,
  isSyncing,
  isFetchingDifference,
  isMessageListOpen,
  isConnectionStatusMinimized,
  areChatsLoaded,
  hasPasscode,
  canSetPasscode,
  onSearchQuery,
  onSelectSettings,
  onSelectContacts,
  onSelectArchived,
  onReset,
}) => {
  const {
    setGlobalSearchDate,
    openUrl,
    setSettingOption,
    setGlobalSearchChatId,
    lockScreen,
    requestNextSettingsScreen,
  } = getActions();

  const lang = useLang();
  const { isMobile } = useAppLayout();

  const [isBotMenuOpen, markBotMenuOpen, unmarkBotMenuOpen] = useFlag();

  const { useCommand } = useCommands();
  const hasMenu = content === LeftColumnContent.ChatList;
  const selectedSearchDate = useMemo(() => {
    return searchDate
      ? formatDateToString(new Date(searchDate * 1000))
      : undefined;
  }, [searchDate]);

  const { connectionStatus, connectionStatusText, connectionStatusPosition } = useConnectionStatus(
    lang,
    connectionState,
    isSyncing || isFetchingDifference,
    isMessageListOpen,
    isConnectionStatusMinimized,
    !areChatsLoaded,
  );

  const handleLockScreenHotkey = useLastCallback((e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasPasscode) {
      lockScreen();
    } else {
      requestNextSettingsScreen({ screen: SettingsScreens.PasscodeDisabled });
    }
  });

  const handleOpenNotificationScreen = useLastCallback(() => {
    requestNextSettingsScreen({ screen: SettingsScreens.Notifications });
  });

  useCommand('OPEN_NOTIFICATION_SETTINGS', handleOpenNotificationScreen);

  useHotkeys(canSetPasscode ? {
    'Meta+L': handleLockScreenHotkey,
    ...(IS_APP && { 'Meta+L': handleLockScreenHotkey }),
  } : undefined);

  const handleSearchFocus = useLastCallback(() => {
    if (!searchQuery) {
      onSearchQuery('');
    }
  });

  const openNewMeetLink = useLastCallback(() => {
    openUrl({
      url: 'https://meet.new',
      shouldSkipModal: true,
    });
  });

  const openLinkNewLinearTask = useLastCallback(() => {
    openUrl({
      url: 'https://linear.app/new',
      shouldSkipModal: true,
    });
  });

  useCommand('NEW_LINEAR_TASK', openLinkNewLinearTask);
  useCommand('NEW_MEET', openNewMeetLink);
  useCommand('OPEN_SEARCH', handleSearchFocus);
  useCommand('LOCK_SCREEN', handleLockScreenHotkey);

  // Cmd+/ to open search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Проверяем, что нажата клавиша Slash
      if (e.code === 'Slash') {
        // Для Mac: CMD (Meta) + Slash, для остальных: Ctrl + Slash
        const isCmdOrCtrlPressed = (IS_MAC_OS && e.metaKey) || (!IS_MAC_OS && e.ctrlKey);

        // Для открытой средней колонки требуется нажатие Cmd или Ctrl вместе со Slash
        if (isMessageListOpen && isCmdOrCtrlPressed) {
          handleSearchFocus();
          return;
        }

        // Для закрытой средней колонки достаточно простого нажатия Slash
        if (!isMessageListOpen) {
          handleSearchFocus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMessageListOpen, handleSearchFocus]);

  const MainButton: FC<{ onTrigger: () => void }> = useMemo(() => {
    return ({ onTrigger }) => (
      <UluHeaderProfile
        className={styles.header}
        // eslint-disable-next-line react/jsx-no-bind
        onClick={hasMenu ? onTrigger : () => onReset()}
      />
    );
  }, [hasMenu, onReset]);

  const toggleConnectionStatus = useLastCallback(() => {
    setSettingOption({ isConnectionStatusMinimized: !isConnectionStatusMinimized });
  });

  const handleLockScreen = useLastCallback(() => {
    lockScreen();
  });

  const isSearchFocused = (
    Boolean(globalSearchChatId)
    || content === LeftColumnContent.GlobalSearch
    || content === LeftColumnContent.Contacts
  );

  useEffect(() => (isSearchFocused ? captureEscKeyListener(() => onReset()) : undefined), [isSearchFocused, onReset]);

  const searchInputPlaceholder = content === LeftColumnContent.Contacts
    ? lang('SearchFriends')
    : lang('Search');

  const versionString = IS_BETA ? `${APP_VERSION} Beta (${APP_REVISION})` : (DEBUG ? APP_REVISION : APP_VERSION);

  const isFullscreen = useFullscreenStatus();

  // Disable dropdown menu RTL animation for resize
  const {
    shouldDisableDropdownMenuTransitionRef,
    handleDropdownMenuTransitionEnd,
  } = useLeftHeaderButtonRtlForumTransition(shouldHideSearch);

  // eslint-disable-next-line no-null/no-null
  const headerRef = useRef<HTMLDivElement>(null);
  useElectronDrag(headerRef);

  const searchContent = useMemo(() => {
    return (
      <>
        {selectedSearchDate && (
          <PickerSelectedItem
            icon="calendar"
            title={selectedSearchDate}
            canClose
            isMinimized={Boolean(globalSearchChatId)}
            className="search-date"
            onClick={setGlobalSearchDate}
            clickArg={CLEAR_DATE_SEARCH_PARAM}
          />
        )}
        {globalSearchChatId && (
          <PickerSelectedItem
            peerId={globalSearchChatId}
            onClick={setGlobalSearchChatId}
            canClose
            clickArg={CLEAR_CHAT_SEARCH_PARAM}
          />
        )}
      </>
    );
  }, [globalSearchChatId, selectedSearchDate]);

  return (
    <div className="LeftMainHeader">
      <div id="LeftMainHeader" className="left-header" ref={headerRef}>
        {lang.isRtl && <div className="DropdownMenuFiller" />}
        { isSearchFocused ? (
          <>
            <Button
              size="smaller"
              round
              color="translucent"
              onClick={onReset}
            >
              <i className="icon icon-arrow-left" />
            </Button>
            <SearchInput
              inputId="telegram-search-input"
              parentContainerClassName="LeftSearch"
              className={buildClassName(
                (globalSearchChatId || searchDate) ? 'with-picker-item' : undefined,
                shouldHideSearch && 'SearchInput--hidden',
              )}
              value={isClosingSearch ? undefined : (contactsFilter || searchQuery)}
              focused={isSearchFocused}
              isLoading={isLoading || connectionStatusPosition === 'minimized'}
              spinnerColor={connectionStatusPosition === 'minimized' ? 'yellow' : undefined}
              spinnerBackgroundColor={
                connectionStatusPosition === 'minimized' && theme === 'light' ? 'light' : undefined
              }
              placeholder={searchInputPlaceholder}
              autoComplete="off"
              canClose={Boolean(globalSearchChatId || searchDate)}
              onChange={onSearchQuery}
              onReset={onReset}
              onSpinnerClick={connectionStatusPosition === 'minimized' ? toggleConnectionStatus : undefined}
            >
              {searchContent}
              {IS_STORIES_ENABLED && (
                <StoryToggler canShow={!isSearchFocused && !selectedSearchDate && !globalSearchChatId} />
              )}
            </SearchInput>
            {isCurrentUserPremium && <StatusButton />}
          </>
        ) : (
          <div className={styles.profileWrapper}>
            <DropdownMenu
              trigger={MainButton}
              footer={`${APP_NAME} ${versionString}`}
              className={buildClassName(
                'main-menu',
                lang.isRtl && 'rtl',
                shouldHideSearch && lang.isRtl && 'right-aligned',
                shouldDisableDropdownMenuTransitionRef.current && lang.isRtl && 'disable-transition',
              )}
              forceOpen={isBotMenuOpen}
              positionX={shouldHideSearch && lang.isRtl ? 'right' : 'left'}
              transformOriginY={IS_ELECTRON && IS_MAC_OS && !isFullscreen ? 0 : undefined}
              onTransitionEnd={lang.isRtl ? handleDropdownMenuTransitionEnd : undefined}
            >
              <LeftSideMenuItems
                onSelectArchived={onSelectArchived}
                onSelectContacts={onSelectContacts}
                onSelectSettings={onSelectSettings}
                onBotMenuOpened={markBotMenuOpen}
                onBotMenuClosed={unmarkBotMenuOpen}
              />
            </DropdownMenu>
            {/*
             Показываем WorkspaceDropdown, если isWorkspaceDropdownOpen равно true
            {isWorkspaceDropdownOpen && (
              <WorkspaceDropdown
                isOpen={isWorkspaceDropdownOpen}
                setIsOpen={setIsWorkspaceDropdownOpen}
                onClose={closeWorkspaceDropdown}
              />
            )}
            */}
            <UluSearchButton onClick={handleSearchFocus} />
          </div>
        ) }
        {hasPasscode && (
          <Button
            round
            ripple={!isMobile}
            size="tiny"
            color="translucent"
            ariaLabel={`${lang('ShortcutsController.Others.LockByPasscode')} '⌘+L')`}
            onClick={handleLockScreen}
            className={buildClassName(!isCurrentUserPremium && 'extra-spacing')}
          >
            <i className="icon icon-lock" />
          </Button>
        )}
        <ShowTransition
          isOpen={connectionStatusPosition === 'overlay'}
          isCustom
          className="connection-state-wrapper"
        >
          <ConnectionStatusOverlay
            connectionStatus={connectionStatus}
            connectionStatusText={connectionStatusText!}
            onClick={toggleConnectionStatus}
          />
        </ShowTransition>
      </div>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): StateProps => {
    const tabState = selectTabState(global);
    const {
      query: searchQuery, fetchingStatus, chatId, date,
    } = tabState.globalSearch;
    const {
      connectionState, isSyncing, isFetchingDifference,
    } = global;
    const { isConnectionStatusMinimized } = global.settings.byKey;

    return {
      searchQuery,
      isLoading: fetchingStatus ? Boolean(fetchingStatus.chats || fetchingStatus.messages) : false,
      globalSearchChatId: chatId,
      searchDate: date,
      theme: selectTheme(global),
      connectionState,
      isSyncing,
      isFetchingDifference,
      isMessageListOpen: Boolean(selectCurrentMessageList(global)),
      isConnectionStatusMinimized,
      isCurrentUserPremium: selectIsCurrentUserPremium(global),
      areChatsLoaded: Boolean(global.chats.listIds.active),
      hasPasscode: Boolean(global.passcode.hasPasscode),
      canSetPasscode: selectCanSetPasscode(global),
    };
  },
)(LeftMainHeader));
