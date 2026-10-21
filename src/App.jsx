import { useState } from 'react';
import { DEMO_DATE, inventory, getAvailable, getPriority, formatDate, formatQuantity } from './inventory.js';

function Leaf({ className = '' }) {
  return <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M25 6C13 4 5 10 8 20c10 5 19-2 17-14Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M6 27 21 12M12 21v-7m0 7h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}

const filters = [
  { key: 'all', label: 'All batches' },
  { key: 'today', label: 'Due today' },
  { key: 'soon', label: 'Due soon' },
  { key: 'later', label: 'Later' },
];

export default function App() {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const todayCount = inventory.filter(item => getPriority(item.deadline).key === 'today').length;
  const soonCount = inventory.filter(item => getPriority(item.deadline).key === 'soon').length;
  const shownInventory = inventory.filter(item =>
    (filter === 'all' || getPriority(item.deadline).key === filter) &&
    `${item.ingredient} ${item.batch}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#main" aria-label="FreshPlate home"><span className="brand-mark"><Leaf /></span>FreshPlate<span className="brand-dot">.</span></a>
        <div className="workspace-label"><span className="small-dot" /> Small kitchen. Less waste.</div>
        <span className="demo-badge">SIMULATED DATA</span>
      </header>

      <main id="main">
        <section className="intro" aria-labelledby="page-title">
          <div><p className="eyebrow">A FRESH PERSPECTIVE ON YOUR KITCHEN</p><h1 id="page-title">Good ingredients.<br /><span>Better possibilities.</span></h1><p className="intro-copy">Helping small Chinese restaurants turn near-expiry ingredients into actionable prep plans.</p></div>
          <aside className="date-card"><span className="date-icon" aria-hidden="true">21</span><div><p className="eyebrow">DEMO DATE · FIXED</p><strong>{formatDate(DEMO_DATE)}</strong><p>All date priorities use this date.</p></div></aside>
        </section>

        <section className="stats" aria-label="Inventory overview">
          <article className="stat"><span className="stat-icon neutral" aria-hidden="true">▦</span><div><p>Ingredient batches</p><strong>{inventory.length.toString().padStart(2, '0')}</strong><span>Eight ingredients, one clear view</span></div></article>
          <article className="stat"><span className="stat-icon orange" aria-hidden="true">◷</span><div><p>Due today</p><strong>{todayCount.toString().padStart(2, '0')}</strong><span>Highest date priority</span></div></article>
          <article className="stat"><span className="stat-icon olive" aria-hidden="true">↗</span><div><p>Due in 1–2 days</p><strong>{soonCount.toString().padStart(2, '0')}</strong><span>Keep these on your radar</span></div></article>
        </section>

        <section className="inventory-panel" aria-labelledby="inventory-title">
          <div className="panel-heading"><div><p className="eyebrow">KNOW WHAT YOU HAVE</p><h2 id="inventory-title">Your ingredient inventory</h2><p>Available = In stock − Reserved for existing orders</p></div><span className="read-only">Inventory overview · Read only</span></div>
          <div className="toolbar"><div className="filters" role="group" aria-label="Filter by date priority">{filters.map(item => <button key={item.key} type="button" aria-pressed={filter === item.key} className={filter === item.key ? 'active' : ''} onClick={() => setFilter(item.key)}>{item.label}{item.key === 'all' && <span>{inventory.length}</span>}</button>)}</div><label className="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input type="search" aria-label="Search ingredient or batch" placeholder="Search ingredient or batch…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
          <div className="table-scroll" role="region" aria-label="Ingredient batch inventory, scroll horizontally on small screens" tabIndex="0">
            <table><caption className="sr-only">Fictional ingredient batches as of {formatDate(DEMO_DATE)}. Date priority does not indicate food safety.</caption><thead><tr><th scope="col">Ingredient</th><th scope="col">Batch</th><th scope="col" className="numeric">In stock</th><th scope="col" className="numeric">Reserved<span className="th-detail">Existing orders</span></th><th scope="col" className="numeric available-heading">Available</th><th scope="col">Use-by date</th><th scope="col">Date priority</th></tr></thead><tbody>{shownInventory.map(item => {
              const priority = getPriority(item.deadline);
              return <tr key={item.batch}><th scope="row"><div className="ingredient"><span className={`ingredient-art ${item.color}`} aria-hidden="true">{item.symbol}</span><div><span className="ingredient-name">{item.ingredient}</span><span className="ingredient-detail">{item.detail}</span></div></div></th><td className="batch">{item.batch}</td><td className="numeric">{formatQuantity(item.stock, item.unit)}</td><td className="numeric reserved">{formatQuantity(item.reserved, item.unit)}</td><td className="numeric available">{formatQuantity(getAvailable(item), item.unit)}</td><td className="deadline"><time dateTime={item.deadline}>{formatDate(item.deadline)}</time><span>{priority.detail}</span></td><td><span className={`priority ${priority.key}`}><span aria-hidden="true" />{priority.label}</span></td></tr>;
            })}{shownInventory.length === 0 && <tr><td colSpan="7" className="empty">No batches match your search. Try another ingredient or filter.</td></tr>}</tbody></table>
          </div>
          <div className="table-footer"><span aria-live="polite">Showing {shownInventory.length} of {inventory.length} batches</span><span>kg = kilograms · pcs = individual eggs</span></div>
        </section>

        <aside className="disclaimer"><span className="info-icon" aria-hidden="true">i</span><div><strong>A demo for better planning.</strong><p>All ingredients, quantities, reservations and use-by dates are fictional. Status shows date priority only, not a food safety assessment.</p></div></aside>
        <footer className="page-footer"><span><Leaf /> FreshPlate</span><p>Less waste starts with a clearer view.</p><span>HACKATHON DEMO · PHASE 01</span></footer>
      </main>
    </div>
  );
}
