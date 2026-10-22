import { useRef } from 'react';

export default function ResetDemoControl({ onReset }) {
  const dialog = useRef(null);
  return <>
    <button type="button" className="secondary-button" onClick={() => dialog.current.showModal()}>Reset Demo</button>
    <dialog ref={dialog} className="reset-dialog" aria-labelledby="reset-title" aria-describedby="reset-description">
      <form method="dialog">
        <h2 id="reset-title">Reset this demo?</h2>
        <p id="reset-description">Restore the initial inventory and clear all saved plans and activity in this browser. This cannot be undone.</p>
        <div className="workflow-buttons">
          <button type="submit" className="secondary-button" autoFocus>Cancel</button>
          <button type="button" className="generate-button" onClick={() => { onReset(); dialog.current.close(); }}>Reset Demo</button>
        </div>
      </form>
    </dialog>
  </>;
}
