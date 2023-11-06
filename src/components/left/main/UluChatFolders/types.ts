import type { RefObject } from 'react';
import type { TreeItem } from 'react-complex-tree';

import type { MenuItemContextAction } from '../../../ui/ListItem';

export type TreeItemChat<T extends any> = TreeItem<T> & {
  unreadCount: number | undefined;
  contextActions: MenuItemContextAction[] | undefined;
  ref?: RefObject<HTMLDivElement>;
};
