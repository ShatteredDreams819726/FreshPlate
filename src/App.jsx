import { useState } from 'react';
import IngredientIcon from './IngredientIcon.jsx';
import { batchLabel } from './ingredientPresentation.js';
import { isValidDate, getAvailable, getPriority, formatDate, formatQuantity } from './inventory.js';
import { inspectInventory } from './planner.js';
import TodaysPlan from './TodaysPlan.jsx';
import { inventoryForPlanner, planReserved, planningDate, activePlan } from './workflow.js';
import { useDemo } from './useDemo.js';
import ActivityLog from './ActivityLog.jsx';
import WorkflowProgress from './WorkflowProgress.jsx';
import ResetDemoControl from './ResetDemoControl.jsx';
import DataEntryPanel from './DataEntryPanel.jsx';

function StorageControls({ demo }) {
  return <details className="demo-settings"><summary>Demo settings</summary><p>Data stays in this browser. Reset clears saved plans, inventory changes and activity.</p><div className="workflow-buttons"><button type="button" className="secondary-button" onClick={demo.reload}>Reload Saved Demo</button><ResetDemoControl onReset={demo.reset} /></div></details>;
}

function Leaf({ className = '' }) {
  return <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M25 6C13 4 5 10 8 20c10 5 19-2 17-14Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M6 27 21 12M12 21v-7m0 7h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}

const filters = [
  { key: 'all', label: 'All batches' },
  { key: 'today', label: 'Due today' },
  { key: 'soon', label: 'Due soon' },
  { key: 'later', label: 'Later' },
  { key: 'excluded', label: 'Excluded' },
];

export default function App() {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('inventory');
  const demo = useDemo();
  if (!demo.state) return <div className="app"><main><h1>FreshPlate</h1><div role="alert" className="plan-notice error-notice">{demo.error}<p>Retry loading your saved demo, or use Demo settings to reset it.</p></div><button className="generate-button" onClick={demo.reload}>Reload Saved Demo</button><StorageControls demo={demo} /></main></div>;
  const inventory = inventoryForPlanner(demo.state);
  const date = planningDate(demo.state);
  const checkedInventory = inspectInventory(inventory, date, demo.state.ingredients);
  const todayCount = inventory.filter(item => getPriority(item.deadline, date).key === 'today').length;
  const soonCount = inventory.filter(item => getPriority(item.deadline, date).key === 'soon').length;
  const shownInventory = checkedInventory.filter(item =>
    (filter === 'all' || (filter === 'excluded' ? !item.eligible : getPriority(item.deadline, date).key === filter)) &&
    `${item.ingredient} ${batchLabel(item, demo.state.inventory)}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#main" aria-label="FreshPlate home"><span className="brand-mark"><Leaf /></span>FreshPlate<span className="brand-dot">.</span></a>
        <div className="workspace-label">A practical plan for your kitchen</div>
        <span className="demo-badge">{demo.state.mode === 'demo' ? 'SIMULATED DATA' : 'LOCAL BUSINESS DATA'}</span>
      </header>

      <main id="main">
        <section className="intro" aria-labelledby="page-title">
          <div><p className="eyebrow">FOR SMALL CHINESE RESTAURANTS</p><h1 id="page-title">A clearer plan for today's kitchen.</h1><p className="intro-copy">Turn soon-to-expire ingredients into actionable prep plans.</p></div>
          <aside className="date-card"><div><p className="eyebrow">{demo.state.mode === 'demo' ? 'FIXED DEMO DATE' : 'BUSINESS · TODAY'}</p><strong>{formatDate(date)}</strong><p>Saved in this browser</p><label>Planning mode<select value={demo.state.mode} disabled={demo.blocked || Boolean(activePlan(demo.state))} onChange={event => demo.run({ type: 'SET_MODE', mode: event.target.value })}><option value="demo" disabled={demo.state.imports.some(item => item.kind === 'stock')}>Demo · fixed date</option><option value="business">Business · today</option></select></label></div></aside>
        </section>
        {demo.error && <div role="alert" className="plan-notice error-notice">{demo.error}<p>Next: {demo.error.toLowerCase().includes('storage') || demo.error.includes('tab') ? 'reload saved data and retry.' : "review Inventory, then generate a fresh plan in Today's Plan."}</p><button className="secondary-button" onClick={demo.reload}>Reload Saved Demo</button></div>}
        {demo.message && <p role="status" className="plan-notice fresh-notice">{demo.message}</p>}
        <nav className="section-nav" aria-label="Main sections">{[['inventory', 'Inventory'], ['plan', "Today's Plan"], ['activity', 'Activity Log']].map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} aria-controls={`panel-${key}`} onClick={() => setView(key)}>{label}</button>)}</nav>
        <WorkflowProgress state={demo.state} />
        <div id="panel-inventory" className="workspace-panel" hidden={view !== 'inventory'}>
        <section className="stats" aria-label="Inventory overview">
          <article className="stat"><span className="stat-icon neutral" aria-hidden="true">▦</span><div><p>Ingredient batches</p><strong>{inventory.length.toString().padStart(2, '0')}</strong><span>{new Set(inventory.map(batch => batch.ingredientId)).size} ingredients</span></div></article>
          <article className="stat"><span className="stat-icon orange" aria-hidden="true">◷</span><div><p>Due today</p><strong>{todayCount.toString().padStart(2, '0')}</strong><span>Highest date priority</span></div></article>
          <article className="stat"><span className="stat-icon olive" aria-hidden="true">↗</span><div><p>Due in 1–2 days</p><strong>{soonCount.toString().padStart(2, '0')}</strong><span>Keep these on your radar</span></div></article>
        </section>
        <div className="inventory-next"><p><strong>Start with what expires soon.</strong><span>Review available stock, then set your extra prep limits.</span></p><button type="button" className="generate-button" onClick={() => setView('plan')}>Open Today's Plan →</button></div>
        <section className="inventory-panel" aria-labelledby="inventory-title">
          <div className="panel-heading"><div><p className="eyebrow">KNOW WHAT YOU HAVE</p><h2 id="inventory-title">Inventory</h2><p>Available = Stock − Order reservations − Plan reservations</p></div><span className="read-only">Live demo inventory</span></div>
          <div className="toolbar"><div className="filters" role="group" aria-label="Filter by date priority">{filters.map(item => <button key={item.key} type="button" aria-pressed={filter === item.key} className={filter === item.key ? 'active' : ''} onClick={() => setFilter(item.key)}>{item.label}{item.key === 'all' && <span>{inventory.length}</span>}</button>)}</div><label className="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input type="search" aria-label="Search ingredient or batch" placeholder="Search ingredient or batch…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
          <div className="table-scroll" role="region" aria-label="Ingredient batch inventory, scroll horizontally on small screens" tabIndex="0">
            <table><caption className="sr-only">Ingredient batches. Date priority uses {formatDate(date)} and does not indicate food safety.</caption><thead><tr><th scope="col">Ingredient</th><th scope="col">Batch</th><th scope="col" className="numeric">In stock</th><th scope="col" className="numeric">Order reserved</th><th scope="col" className="numeric">Plan reserved</th><th scope="col" className="numeric">Total reserved</th><th scope="col" className="numeric available-heading">Available</th><th scope="col">Use-by date</th><th scope="col">Date priority</th></tr></thead><tbody>{shownInventory.map(item => {
              const priority = getPriority(item.deadline, date);
              return <tr key={`${item.batch}-${item.index}`}><th scope="row"><div className="ingredient"><IngredientIcon state={demo.state} ingredientId={item.ingredientId} /><div><span className="ingredient-name">{item.ingredient}</span><span className="ingredient-detail">{item.importId ? 'Imported arrival' : `Demo sample · ${item.detail}`}</span></div></div>{item.issues.length > 0 && <span className="row-issue">Excluded: {item.issues.join(' ')}</span>}</th><td className="batch">{batchLabel(item, demo.state.inventory)}{isValidDate(item.productionDate) && <span className="ingredient-detail">Production date: {item.productionDate}</span>}</td><td className="numeric">{formatQuantity(item.stock, item.unit)}</td><td className="numeric reserved">{formatQuantity(item.orderReserved, item.unit)}</td><td className="numeric reserved">{formatQuantity(planReserved(item), item.unit)}</td><td className="numeric reserved">{formatQuantity(item.reserved, item.unit)}</td><td className="numeric available">{formatQuantity(item.issues.length ? null : getAvailable(item, demo.state.ingredients), item.unit)}</td><td className="deadline"><time dateTime={item.deadline}>{formatDate(item.deadline)}</time><span>{priority.detail}</span></td><td><span className={`priority ${item.issues.length ? 'invalid' : priority.key}`}><span aria-hidden="true" />{item.issues.length ? 'Invalid batch' : priority.label}</span></td></tr>;
            })}{shownInventory.length === 0 && <tr><td colSpan="9" className="empty">No batches match your search. Try another ingredient or filter.</td></tr>}</tbody></table>
          </div>
          <div className="table-footer"><span aria-live="polite">Showing {shownInventory.length} of {inventory.length} batches</span><span>kg = kilograms · pcs = individual pieces</span></div>
        </section>

        <DataEntryPanel demo={demo} onViewPlan={() => setView('plan')} />
        </div>
        <div id="panel-plan" className="workspace-panel" hidden={view !== 'plan'}><TodaysPlan demo={demo} onViewLog={() => setView('activity')} /></div>
        <div id="panel-activity" className="workspace-panel" hidden={view !== 'activity'}><ActivityLog activity={demo.state.activity} inventory={demo.state.inventory} planNumbering={demo.state.planNumbering} onViewPlan={() => setView('plan')} /></div>
        <StorageControls demo={demo} />
        <footer className="page-footer"><span><Leaf /> FreshPlate</span><p>{demo.state.mode === 'demo' ? 'Simulated data' : 'Business mode'} · Browser-local planning</p></footer>
      </main>
    </div>
  );
}
