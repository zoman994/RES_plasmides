import {
  useCallback, useEffect, useMemo, useReducer,
} from 'react';

function isPrimer(entry, key) {
  return entry?.key === key || entry?.hit?._occKey === key;
}

function primerDirection(entry) {
  const value = entry?.hit?._strandName ?? entry?.hit?.direction ?? entry?.hit?.strand;
  if (value === 'forward' || value === 1 || value === '+') return 'forward';
  if (value === 'reverse' || value === -1 || value === '-') return 'reverse';
  return null;
}

function emptyDisclosure(scopeKey) {
  return {
    scopeKey,
    selectedPrimers: [],
    activePrimer: null,
    expandedPrimerKey: null,
  };
}

function disclosureReducer(state, action) {
  const current = state.scopeKey === action.scopeKey
    ? state
    : emptyDisclosure(action.scopeKey);
  if (action.type === 'reset-scope') return current;
  if (action.type === 'collapse') return { ...current, expandedPrimerKey: null };
  if (action.type === 'clear') return emptyDisclosure(action.scopeKey);
  if (action.type !== 'click') return current;

  const { key, hit, additive } = action;
  const entry = { key, hit };
  if (!additive) {
    return {
      ...current,
      selectedPrimers: [entry],
      activePrimer: entry,
      expandedPrimerKey: current.expandedPrimerKey === key ? null : key,
    };
  }

  const existingIndex = current.selectedPrimers.findIndex((item) => isPrimer(item, key));
  if (existingIndex >= 0) {
    const selectedPrimers = current.selectedPrimers
      .filter((_, index) => index !== existingIndex);
    return {
      ...current,
      selectedPrimers,
      activePrimer: selectedPrimers[selectedPrimers.length - 1] || null,
      expandedPrimerKey: null,
    };
  }
  const direction = primerDirection(entry);
  const opposite = direction == null
    ? null
    : current.selectedPrimers.find((item) => {
      const selectedDirection = primerDirection(item);
      return selectedDirection != null && selectedDirection !== direction;
    });
  const selectedPrimers = opposite ? [opposite, entry] : [entry];
  return {
    ...current,
    selectedPrimers,
    activePrimer: entry,
    expandedPrimerKey: key,
  };
}

function isPlainEscape(event) {
  return event.key === 'Escape'
    && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}

/** Keep PCR pairing separate from the one transiently expanded occurrence. */
export function usePrimerDisclosure(scopeKey = 'sequence-view') {
  const [storedState, dispatch] = useReducer(
    disclosureReducer,
    scopeKey,
    emptyDisclosure,
  );
  // A new document must lose ownership synchronously, before effects and before
  // E/Delete can observe a hit from the previous document.
  const state = storedState.scopeKey === scopeKey
    ? storedState
    : emptyDisclosure(scopeKey);
  const { selectedPrimers, activePrimer, expandedPrimerKey } = state;

  useEffect(() => {
    if (storedState.scopeKey !== scopeKey) {
      dispatch({ type: 'reset-scope', scopeKey });
    }
  }, [scopeKey, storedState.scopeKey]);

  const onPrimerClick = useCallback((key, hit, intent = {}) => {
    dispatch({
      type: 'click', scopeKey, key, hit, additive: intent.additive === true,
    });
  }, [scopeKey]);

  const collapsePrimer = useCallback(() => {
    dispatch({ type: 'collapse', scopeKey });
  }, [scopeKey]);
  const clearPrimerSelection = useCallback(() => {
    dispatch({ type: 'clear', scopeKey });
  }, [scopeKey]);

  const onDisclosureKeyDown = useCallback((event) => {
    if (!isPlainEscape(event) || expandedPrimerKey == null) return false;
    event.preventDefault();
    event.stopPropagation();
    collapsePrimer();
    return true;
  }, [collapsePrimer, expandedPrimerKey]);

  useEffect(() => {
    if (expandedPrimerKey == null && selectedPrimers.length === 0) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(
        '[data-primer-interactive="true"], [data-primer-disclosure-keepopen="true"]',
      )) return;
      clearPrimerSelection();
    };
    const onKeyDown = (event) => onDisclosureKeyDown(event);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [clearPrimerSelection, expandedPrimerKey, onDisclosureKeyDown, selectedPrimers.length]);

  const selectedPrimerKeys = useMemo(
    () => selectedPrimers.map((entry) => entry.key),
    [selectedPrimers],
  );

  return {
    selectedPrimers,
    selectedPrimerKeys,
    activePrimer,
    expandedPrimerKey,
    onPrimerClick,
    onDisclosureKeyDown,
    collapsePrimer,
    clearPrimerSelection,
  };
}
