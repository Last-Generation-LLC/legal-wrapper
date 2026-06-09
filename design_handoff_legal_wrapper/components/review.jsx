/* Review page — tabular grid of docs × prompts */
/* global React, tokens, fontSans, fontSerif, fontMono, Icon, icons, Rail, TopBar, Pill, Btn */
const { useState: useStateR } = React;

const R_DOCS = [
  { id: 'r1', name: 'NDA_Acme_2026-01.pdf', party: 'Acme Corp.', type: 'NDA', date: 'Jan 2026' },
  { id: 'r2', name: 'NDA_Brightwell_2026-02.pdf', party: 'Brightwell Labs', type: 'NDA', date: 'Feb 2026' },
  { id: 'r3', name: 'NDA_Corvus_2026-02.docx', party: 'Corvus Holdings', type: 'NDA', date: 'Feb 2026' },
  { id: 'r4', name: 'NDA_Delphi_2026-03.pdf', party: 'Delphi Systems', type: 'NDA', date: 'Mar 2026' },
  { id: 'r5', name: 'NDA_Eastwind_2026-03.pdf', party: 'Eastwind Partners', type: 'NDA', date: 'Mar 2026' },
  { id: 'r6', name: 'NDA_Fairhaven_2026-04.docx', party: 'Fairhaven Group', type: 'NDA', date: 'Apr 2026' },
  { id: 'r7', name: 'NDA_Galleon_2026-04.pdf', party: 'Galleon & Co.', type: 'NDA', date: 'Apr 2026' },
  { id: 'r8', name: 'NDA_Harlow_2026-04.pdf', party: 'Harlow Ventures', type: 'NDA', date: 'Apr 2026' },
];

const R_COLS = [
  {
    id: 'c1', title: 'Governing law',
    prompt: 'What is the governing law clause? Return state/country only, or "Not specified."',
    width: 160,
  },
  {
    id: 'c2', title: 'Term (years)',
    prompt: 'What is the term of the confidentiality obligation, in years? Return a number or range, or "Perpetual."',
    width: 130,
    numeric: true,
  },
  {
    id: 'c3', title: 'Mutual?',
    prompt: 'Is the NDA mutual or one-way? Return "Mutual" or "One-way (disclosing: X)".',
    width: 150,
  },
  {
    id: 'c4', title: 'Residual clause',
    prompt: 'Is there a residual knowledge clause? Return "Yes" + one-sentence summary, or "No."',
    width: 260,
  },
  {
    id: 'c5', title: 'Non-solicit',
    prompt: 'Does the NDA contain a non-solicit of employees? If yes, for how long?',
    width: 200,
  },
  {
    id: 'c6', title: 'Injunctive relief',
    prompt: 'Does the NDA explicitly provide for injunctive relief without bond?',
    width: 200,
  },
];

// cell: { status: 'idle'|'running'|'done'|'error'|'empty', value, confidence, citation }
const mkCell = (status, value, confidence, citation) => ({ status, value, confidence, citation });

const GRID = {
  r1: {
    c1: mkCell('done', 'Delaware', 0.98, 'p.6 §14.1'),
    c2: mkCell('done', '3', 0.99, 'p.3 §5'),
    c3: mkCell('done', 'Mutual', 0.96, 'p.1 recitals'),
    c4: mkCell('done', 'Yes — permits use of residual knowledge retained in unaided memory.', 0.91, 'p.4 §7'),
    c5: mkCell('done', 'Yes — 12 months', 0.93, 'p.5 §9'),
    c6: mkCell('done', 'Yes, without bond', 0.97, 'p.5 §10'),
  },
  r2: {
    c1: mkCell('done', 'New York', 0.97, 'p.7 §13'),
    c2: mkCell('done', '5', 0.95, 'p.3 §4'),
    c3: mkCell('done', 'One-way (disclosing: Brightwell)', 0.94, 'p.1 recitals'),
    c4: mkCell('done', 'No', 0.88, ''),
    c5: mkCell('done', 'No', 0.9, ''),
    c6: mkCell('done', 'Yes, without bond', 0.96, 'p.6 §11'),
  },
  r3: {
    c1: mkCell('done', 'California', 0.96, 'p.8 §15.2'),
    c2: mkCell('done', 'Perpetual (trade secrets)', 0.87, 'p.4 §6'),
    c3: mkCell('done', 'Mutual', 0.95, 'p.1'),
    c4: mkCell('error', null, null, null, 'parse error: §7 contains table; pdf-parse returned empty'),
    c5: mkCell('done', 'Yes — 24 months', 0.92, 'p.5 §9'),
    c6: mkCell('done', 'Yes', 0.84, 'p.6 §12'),
  },
  r4: {
    c1: mkCell('done', 'Delaware', 0.98, 'p.5 §13'),
    c2: mkCell('done', '2', 0.99, 'p.2 §4'),
    c3: mkCell('done', 'Mutual', 0.97, 'p.1'),
    c4: mkCell('done', 'No', 0.93, ''),
    c5: mkCell('done', 'No', 0.91, ''),
    c6: mkCell('done', 'Silent — not addressed', 0.76, ''),
  },
  r5: {
    c1: mkCell('done', 'England & Wales', 0.98, 'p.9 §16'),
    c2: mkCell('done', '5', 0.96, 'p.3 §5'),
    c3: mkCell('done', 'Mutual', 0.95, 'p.1'),
    c4: mkCell('done', 'Yes — limited to knowledge retained by authorized personnel.', 0.89, 'p.4 §7'),
    c5: mkCell('running', null, null),
    c6: mkCell('running', null, null),
  },
  r6: {
    c1: mkCell('done', 'Texas', 0.97, 'p.7 §14'),
    c2: mkCell('done', '3', 0.98, 'p.3 §5'),
    c3: mkCell('done', 'One-way (disclosing: Aperture)', 0.95, 'p.1'),
    c4: mkCell('done', 'No', 0.92, ''),
    c5: mkCell('running', null, null),
    c6: mkCell('idle', null, null),
  },
  r7: {
    c1: mkCell('done', 'Delaware', 0.97, 'p.6 §13'),
    c2: mkCell('running', null, null),
    c3: mkCell('running', null, null),
    c4: mkCell('idle', null, null),
    c5: mkCell('idle', null, null),
    c6: mkCell('idle', null, null),
  },
  r8: {
    c1: mkCell('idle', null, null),
    c2: mkCell('idle', null, null),
    c3: mkCell('idle', null, null),
    c4: mkCell('idle', null, null),
    c5: mkCell('idle', null, null),
    c6: mkCell('idle', null, null),
  },
};

function ReviewPage() {
  const [activeCell, setActiveCell] = useStateR({ row: 'r1', col: 'c4' });
  const [editingCol, setEditingCol] = useStateR(null);

  const totalCells = R_DOCS.length * R_COLS.length;
  const done = Object.values(GRID).flatMap(r => Object.values(r)).filter(c => c.status === 'done').length;
  const running = Object.values(GRID).flatMap(r => Object.values(r)).filter(c => c.status === 'running').length;
  const errors = Object.values(GRID).flatMap(r => Object.values(r)).filter(c => c.status === 'error').length;

  const leftColW = 240;

  const active = GRID[activeCell.row]?.[activeCell.col];
  const activeDoc = R_DOCS.find(d => d.id === activeCell.row);
  const activeCol = R_COLS.find(c => c.id === activeCell.col);

  return (
    <div style={{
      display: 'flex', height: '100%', background: tokens.bg, color: tokens.text,
      fontFamily: fontSans, fontSize: 13,
    }}>
      <Rail active="review" />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar
          crumbs={['~/workspaces', 'Q2 Incoming NDAs', 'Review']}
          right={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Pill tone="active">● SONNET 4.5</Pill>
              <Pill>cache · 91%</Pill>
              <div style={{ width: 1, height: 18, background: tokens.border, margin: '0 4px' }} />
              <Btn size="sm" ghost icon={icons.download}>CSV</Btn>
              <Btn size="sm" primary icon={icons.play}>Run all</Btn>
            </div>
          }
        />

        {/* Status bar */}
        <div style={{
          padding: '10px 20px', borderBottom: `1px solid ${tokens.borderSoft}`,
          display: 'flex', alignItems: 'center', gap: 16,
          background: tokens.bg,
        }}>
          <div>
            <div style={{ fontFamily: fontSerif, fontSize: 17, letterSpacing: '-0.01em' }}>Q2 Incoming NDAs</div>
            <div style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.dim, marginTop: 1 }}>
              {R_DOCS.length} rows × {R_COLS.length} columns · {totalCells} cells
            </div>
          </div>
          <div style={{ flex: 1 }} />

          {/* progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontFamily: fontMono, fontSize: 11, color: tokens.muted }}>
              {done}/{totalCells} complete
            </div>
            <div style={{ width: 160, height: 3, background: tokens.panelHi, borderRadius: 2, overflow: 'hidden', display: 'flex' }}>
              <div style={{ background: tokens.green, width: `${(done / totalCells) * 100}%` }} />
              <div style={{ background: tokens.amber, width: `${(running / totalCells) * 100}%` }} />
              {errors > 0 && <div style={{ background: tokens.red, width: `${(errors / totalCells) * 100}%` }} />}
            </div>
            <Pill tone="ok"><span style={{ width: 6, height: 6, borderRadius: '50%', background: tokens.green, display: 'inline-block' }} /> {done} done</Pill>
            {running > 0 && <Pill tone="warn"><span className="ll-pulse-r" style={{ width: 6, height: 6, borderRadius: '50%', background: tokens.amber, display: 'inline-block' }} /> {running} running</Pill>}
            {errors > 0 && <Pill><span style={{ width: 6, height: 6, borderRadius: '50%', background: tokens.red, display: 'inline-block' }} /> {errors} error</Pill>}
          </div>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflow: 'auto', background: tokens.bg }}>
          <div style={{ minWidth: leftColW + R_COLS.reduce((s, c) => s + c.width, 0) }}>

            {/* Column headers */}
            <div style={{
              display: 'flex', position: 'sticky', top: 0, zIndex: 3,
              background: tokens.bg, borderBottom: `1px solid ${tokens.border}`,
            }}>
              <div style={{
                width: leftColW, flexShrink: 0, padding: '10px 14px',
                borderRight: `1px solid ${tokens.border}`,
                position: 'sticky', left: 0, background: tokens.bg, zIndex: 4,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Icon d={icons.lock} size={11} />
                <span style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Document
                </span>
              </div>
              {R_COLS.map(col => (
                <div key={col.id} style={{
                  width: col.width, flexShrink: 0, padding: '10px 12px',
                  borderRight: `1px solid ${tokens.borderSoft}`,
                  background: activeCell.col === col.id ? tokens.panel : tokens.bg,
                  cursor: 'pointer',
                }} onClick={() => setEditingCol(editingCol === col.id ? null : col.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, color: tokens.text, fontWeight: 500, letterSpacing: '-0.005em' }}>
                      {col.title}
                    </span>
                    <Icon d={icons.chevDown} size={10} />
                  </div>
                  <div style={{
                    fontFamily: fontMono, fontSize: 10, color: tokens.dim, lineHeight: 1.35,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {col.prompt}
                  </div>
                </div>
              ))}
              <div style={{ flex: 1, padding: '10px 12px', display: 'flex', alignItems: 'center' }}>
                <Btn size="sm" ghost icon={icons.plus}>Add column</Btn>
              </div>
            </div>

            {/* Rows */}
            {R_DOCS.map((doc, rowIdx) => (
              <div key={doc.id} style={{
                display: 'flex', borderBottom: `1px solid ${tokens.borderSoft}`,
                background: activeCell.row === doc.id ? 'oklch(0.21 0.006 60)' : 'transparent',
              }}>
                <div style={{
                  width: leftColW, flexShrink: 0, padding: '12px 14px',
                  borderRight: `1px solid ${tokens.border}`,
                  position: 'sticky', left: 0,
                  background: activeCell.row === doc.id ? 'oklch(0.21 0.006 60)' : tokens.bg,
                  zIndex: 2,
                }}>
                  <div style={{ fontSize: 12.5, color: tokens.text, wordBreak: 'break-all', marginBottom: 3, lineHeight: 1.35 }}>
                    {doc.name}
                  </div>
                  <div style={{ display: 'flex', gap: 6, fontFamily: fontMono, fontSize: 10, color: tokens.dim }}>
                    <span>{doc.party}</span>
                    <span>·</span>
                    <span>{doc.date}</span>
                  </div>
                </div>
                {R_COLS.map(col => {
                  const cell = GRID[doc.id][col.id];
                  const isActive = activeCell.row === doc.id && activeCell.col === col.id;
                  return (
                    <Cell
                      key={col.id}
                      cell={cell}
                      col={col}
                      active={isActive}
                      onClick={() => setActiveCell({ row: doc.id, col: col.id })}
                    />
                  );
                })}
                <div style={{ flex: 1, borderBottom: 'none' }} />
              </div>
            ))}

            {/* Add row */}
            <div style={{ display: 'flex', padding: '10px 14px' }}>
              <Btn size="sm" ghost icon={icons.plus}>Add documents</Btn>
            </div>
          </div>
        </div>

        {/* Inspector (bottom drawer) */}
        {active && active.status === 'done' && (
          <div style={{
            borderTop: `1px solid ${tokens.border}`, background: tokens.panel,
            padding: '14px 20px', display: 'flex', gap: 20, minHeight: 150,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.dim, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Cell
                </span>
                <span style={{ fontFamily: fontMono, fontSize: 11.5, color: tokens.text }}>
                  {activeDoc?.name} · {activeCol?.title}
                </span>
                {active.confidence && (
                  <Pill tone={active.confidence > 0.9 ? 'ok' : 'warn'}>
                    conf · {(active.confidence * 100).toFixed(0)}%
                  </Pill>
                )}
                {active.citation && <Pill tone="ctx">{active.citation}</Pill>}
              </div>
              <div style={{ fontSize: 13.5, color: tokens.text, lineHeight: 1.55, maxWidth: 720 }}>
                {active.value || <span style={{ color: tokens.dim }}>empty</span>}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 4 }}>
                <Btn size="sm" ghost icon={icons.refresh}>Regenerate</Btn>
                <Btn size="sm" ghost icon={icons.edit}>Edit prompt</Btn>
                <Btn size="sm" ghost icon={icons.eye}>View source</Btn>
              </div>
            </div>
            <div style={{ width: 240, borderLeft: `1px solid ${tokens.borderSoft}`, paddingLeft: 20 }}>
              <div style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.dim, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                Prompt for column
              </div>
              <div style={{ fontFamily: fontMono, fontSize: 11, color: tokens.muted, lineHeight: 1.55 }}>
                {activeCol?.prompt}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .ll-pulse-r { animation: llpr 1.4s ease-in-out infinite; }
        @keyframes llpr { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}

function Cell({ cell, col, active, onClick }) {
  const base = {
    width: col.width, flexShrink: 0, padding: '12px 12px',
    borderRight: `1px solid ${tokens.borderSoft}`,
    cursor: 'pointer', position: 'relative',
    background: active ? 'oklch(0.25 0.02 78 / 0.35)' : 'transparent',
    outline: active ? `1px solid ${tokens.amber}` : 'none',
    outlineOffset: -1,
  };
  if (cell.status === 'idle') {
    return <div onClick={onClick} style={base}>
      <div style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.dim }}>—</div>
    </div>;
  }
  if (cell.status === 'running') {
    return <div onClick={onClick} style={base}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="ll-pulse-r" style={{ width: 7, height: 7, borderRadius: '50%', background: tokens.amber, display: 'inline-block' }} />
        <span style={{ fontFamily: fontMono, fontSize: 11, color: tokens.amber }}>running</span>
      </div>
      <div style={{ marginTop: 6, height: 2, background: tokens.borderSoft, borderRadius: 1, overflow: 'hidden' }}>
        <div className="ll-shimmer" style={{ height: '100%', width: '40%', background: tokens.amber }} />
      </div>
      <style>{`
        .ll-shimmer { animation: lls 1.6s ease-in-out infinite; }
        @keyframes lls {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
      `}</style>
    </div>;
  }
  if (cell.status === 'error') {
    return <div onClick={onClick} style={base}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: tokens.red, display: 'inline-block' }} />
        <span style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.red }}>error</span>
      </div>
      <div style={{ fontSize: 11.5, color: tokens.muted, marginTop: 4, lineHeight: 1.4 }}>
        {cell.citation}
      </div>
    </div>;
  }
  // done
  const conf = cell.confidence;
  const confColor = conf > 0.92 ? tokens.green : conf > 0.85 ? tokens.amber : tokens.red;
  return <div onClick={onClick} style={base}>
    <div style={{
      fontSize: 12.5, color: tokens.text, lineHeight: 1.45,
      display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      fontFamily: col.numeric ? fontMono : fontSans,
    }}>
      {cell.value}
    </div>
    {cell.citation && (
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: confColor, display: 'inline-block', flexShrink: 0 }} />
        <span style={{ fontFamily: fontMono, fontSize: 9.5, color: tokens.dim, letterSpacing: '0.02em' }}>
          {cell.citation}
        </span>
      </div>
    )}
  </div>;
}

window.ReviewPage = ReviewPage;
