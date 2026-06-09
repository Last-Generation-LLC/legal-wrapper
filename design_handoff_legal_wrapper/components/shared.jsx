/* Shared chrome: left rail + top bar + tokens */
/* global React */

const tokens = {
  bg: 'oklch(0.16 0.005 60)',
  panel: 'oklch(0.195 0.006 60)',
  panelHi: 'oklch(0.225 0.006 60)',
  border: 'oklch(0.285 0.006 60)',
  borderSoft: 'oklch(0.24 0.006 60)',
  text: 'oklch(0.96 0.002 60)',
  muted: 'oklch(0.68 0.005 60)',
  dim: 'oklch(0.48 0.005 60)',
  amber: 'oklch(0.80 0.13 78)',
  amberDim: 'oklch(0.55 0.09 78)',
  green: 'oklch(0.78 0.12 150)',
  red: 'oklch(0.72 0.15 25)',
  blue: 'oklch(0.72 0.10 240)',
};

const fontSans = '"Inter Tight", "Söhne", -apple-system, system-ui, sans-serif';
const fontSerif = '"Instrument Serif", "JT Serif", Georgia, serif';
const fontMono = '"JetBrains Mono", "SF Mono", ui-monospace, monospace';

function Icon({ d, size = 14, stroke = 1.6, fill = 'none' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

const icons = {
  chat: 'M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  plus: 'M12 5v14M5 12h14',
  play: 'M5 3l14 9-14 9V3z',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  chevDown: 'M6 9l6 6 6-6',
  chevRight: 'M9 6l6 6-6 6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  refresh: 'M23 4v6h-6M1 20v-6h6M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15',
  copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  sparkle: 'M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z',
  folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  search: 'M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0z',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  stop: 'M6 6h12v12H6z',
  lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4',
};

function Rail({ active }) {
  const items = [
    { id: 'assistant', label: 'Assistant', icon: icons.chat },
    { id: 'review', label: 'Review', icon: icons.grid },
    { id: 'docs', label: 'Documents', icon: icons.folder },
  ];
  return (
    <div style={{
      width: 56, borderRight: `1px solid ${tokens.border}`, background: tokens.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'stretch', padding: '14px 0',
      gap: 2, flexShrink: 0,
    }}>
      <div style={{
        height: 28, margin: '0 10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${tokens.border}`, borderRadius: 4,
        fontFamily: fontMono, fontSize: 10, letterSpacing: '0.1em', color: tokens.amber, fontWeight: 500,
      }}>LL</div>
      {items.map(it => (
        <div key={it.id} style={{
          margin: '0 8px', height: 40, borderRadius: 4,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
          color: active === it.id ? tokens.text : tokens.dim,
          background: active === it.id ? tokens.panelHi : 'transparent',
          cursor: 'pointer',
        }}>
          <Icon d={it.icon} size={15} />
          <div style={{ fontSize: 8.5, fontFamily: fontMono, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{it.label.slice(0,4)}</div>
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div style={{ margin: '0 8px', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.dim }}>
        <Icon d={icons.settings} size={15} />
      </div>
    </div>
  );
}

function TopBar({ crumbs, right }) {
  return (
    <div style={{
      height: 44, borderBottom: `1px solid ${tokens.border}`, background: tokens.bg,
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: tokens.dim, fontSize: 11 }}>/</span>}
            <span style={{
              fontFamily: fontMono, fontSize: 11.5, letterSpacing: '0.01em',
              color: i === crumbs.length - 1 ? tokens.text : tokens.muted,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      {right}
    </div>
  );
}

function Pill({ children, tone = 'default', mono = true }) {
  const tones = {
    default: { bg: tokens.panelHi, fg: tokens.muted, bd: tokens.border },
    active: { bg: 'oklch(0.28 0.05 78 / 0.15)', fg: tokens.amber, bd: 'oklch(0.5 0.08 78 / 0.4)' },
    ctx: { bg: 'oklch(0.22 0.02 240)', fg: tokens.blue, bd: 'oklch(0.4 0.08 240 / 0.5)' },
    ok: { bg: 'oklch(0.24 0.04 150)', fg: tokens.green, bd: 'oklch(0.4 0.08 150 / 0.5)' },
    warn: { bg: 'oklch(0.24 0.04 50)', fg: tokens.amber, bd: 'oklch(0.4 0.08 50 / 0.5)' },
  };
  const t = tones[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '2px 8px', borderRadius: 3,
      background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
      fontFamily: mono ? fontMono : fontSans, fontSize: 10.5, letterSpacing: '0.02em',
      lineHeight: '16px', fontWeight: 500,
    }}>{children}</span>
  );
}

function Btn({ children, primary, ghost, onClick, disabled, icon, size = 'md' }) {
  const h = size === 'sm' ? 24 : 30;
  const bg = primary ? tokens.text : ghost ? 'transparent' : tokens.panelHi;
  const fg = primary ? tokens.bg : tokens.text;
  const bd = primary ? tokens.text : ghost ? 'transparent' : tokens.border;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      height: h, padding: size === 'sm' ? '0 8px' : '0 12px',
      background: bg, color: fg, border: `1px solid ${bd}`, borderRadius: 3,
      fontFamily: fontSans, fontSize: size === 'sm' ? 11.5 : 12.5, fontWeight: 500,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
      letterSpacing: '-0.005em',
    }}>
      {icon && <Icon d={icon} size={13} />}
      {children}
    </button>
  );
}

Object.assign(window, { tokens, fontSans, fontSerif, fontMono, Icon, icons, Rail, TopBar, Pill, Btn });
