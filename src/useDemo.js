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
      setMessage({ GENERATE: 'Draft ready. Next: review the portions and approve the plan.',
        APPROVE: 'Ingredients reserved. Next: complete preparation when the food is ready.',
        COMPLETE: 'Preparation recorded. Next: view Activity Log for consumed batches.',
        CANCEL: 'Plan cancelled; reservations released. Next: generate a new plan.' }[action.type] ?? '');
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
    setMessage(update.error ? '' : "Saved demo restored. Continue in Today's Plan.");
    setConflict(false);
  }

  function reset() {
    // ResetDemoControl asks for confirmation before invoking this action.
    try {
      const state = createInitialState();
      const raw = saveDemo(window.localStorage, state, null, true);
      const update = { state, raw, error: '' };
      savedRef.current = update;
      setSaved(update);
      setConflict(false);
      setError('');
      setMessage('Demo reset. Start with Inventory, then generate a new plan.');
    } catch (failure) { setError(`Reset not applied. ${failure.message}`); setMessage(''); }
  }

  return { state: saved.state, run, reset, reload, message, error, blocked: conflict || !saved.state };
}
