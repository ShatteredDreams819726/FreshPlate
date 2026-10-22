import { useEffect, useRef, useState } from 'react';
import { createInitialState, transition } from './workflow.js';
import { loadDemo, saveDemo, STORAGE_KEY } from './persistence.js';

function readBrowser() {
  if (typeof window === 'undefined') return { state: createInitialState(), raw: null, error: '' };
  try { return { ...loadDemo(window.localStorage), error: '' }; }
  catch (error) { return { state: null, raw: null, error: `Browser storage could not be loaded. ${error.message}` }; }
}

export function useDemo() {
  const [saved, setSaved] = useState(readBrowser);
  const savedRef = useRef(saved);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(saved.error);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    function onStorage(event) {
      if ((event.key === STORAGE_KEY || event.key === null) && event.newValue !== savedRef.current.raw) {
        setConflict(true);
        setError('The saved demo changed in another tab. Reload Saved Demo before continuing.');
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function run(action) {
    if (!savedRef.current.state || conflict) return;
    try {
      const actualAction = { ...action, time: new Date().toISOString() };
      if (action.type === 'GENERATE') actualAction.planId = `FP-${crypto.randomUUID()}`;
      const next = transition(savedRef.current.state, actualAction);
      const raw = saveDemo(window.localStorage, next, savedRef.current.raw);
      const update = { state: next, raw, error: '' };
      savedRef.current = update;
      setSaved(update);
      setError('');
      setMessage({ GENERATE: 'Draft generated and saved. No inventory or reservations changed.',
        APPROVE: 'Plan approved and saved. Stock is unchanged; plan reservations are in place. Next: staff can complete preparation or the owner can cancel.',
        COMPLETE: 'Preparation completed and saved. Stock was deducted once and this plan’s reservations were released. Existing-order reservations are unchanged.',
        CANCEL: 'Plan cancelled and saved. Its reservations were released. Stock and existing-order reservations are unchanged.' }[action.type] ?? '');
    } catch (failure) {
      setError(`Operation not applied. ${failure.message}`);
      if (failure.message.startsWith('Another tab changed')) setConflict(true);
      setMessage('');
    }
  }

  function reload() {
    const update = readBrowser();
    savedRef.current = update;
    setSaved(update);
    setError(update.error);
    setMessage(update.error ? '' : 'Saved demo restored.');
    setConflict(false);
  }

  function reset() {
    if (!window.confirm('Reset Demo? This will replace this browser’s saved inventory and clear all plans and activity. This cannot be undone.')) return;
    try {
      const state = createInitialState();
      const raw = saveDemo(window.localStorage, state, null, true);
      const update = { state, raw, error: '' };
      savedRef.current = update;
      setSaved(update);
      setConflict(false);
      setError('');
      setMessage('Demo reset and saved. Initial inventory restored; all plans and activity cleared.');
    } catch (failure) { setError(`Reset not applied. ${failure.message}`); setMessage(''); }
  }

  return { state: saved.state, run, reset, reload, message, error, blocked: conflict || !saved.state };
}
