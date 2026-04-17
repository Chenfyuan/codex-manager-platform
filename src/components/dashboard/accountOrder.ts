export function reorderAccountIds(params: {
  allAccountIds: string[];
  visibleAccountIds: string[];
  draggedId: string;
  targetId: string;
}): string[] {
  const { allAccountIds, visibleAccountIds, draggedId, targetId } = params;

  if (draggedId === targetId) {
    return allAccountIds;
  }

  const visibleIds = [...visibleAccountIds];
  const fromIndex = visibleIds.indexOf(draggedId);
  const toIndex = visibleIds.indexOf(targetId);

  if (fromIndex === -1 || toIndex === -1) {
    return allAccountIds;
  }

  visibleIds.splice(fromIndex, 1);
  visibleIds.splice(toIndex, 0, draggedId);

  const visibleIdSet = new Set(visibleAccountIds);
  let nextVisibleIndex = 0;

  return allAccountIds.map((accountId) => {
    if (!visibleIdSet.has(accountId)) {
      return accountId;
    }

    const nextId = visibleIds[nextVisibleIndex];
    nextVisibleIndex += 1;
    return nextId;
  });
}
