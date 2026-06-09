/* Assistant page — chat with docs, transparent system prompt */
/* global React, tokens, fontSans, fontSerif, fontMono, Icon, icons, Rail, TopBar, Pill, Btn */
const { useState, useRef, useEffect } = React;

const SEED_DOCS = [
  { id: 'd1', name: 'Aperture_MSA_v4.pdf', size: '284 KB', pages: 42, tokens: 31420, type: 'MSA' },
  { id: 'd2', name: 'Aperture_DPA_2025-03.pdf', size: '112 KB', pages: 18, tokens: 14280, type: 'DPA' },
  { id: 'd3', name: 'Aperture_Order_Form_Q2.docx', size: '48 KB', pages: 6, tokens: 4920, type: 'Order' },
  { id: 'd4', name: 'Redlines_from_Vendor_2026-04-18.docx', size: '96 KB', pages: 11, tokens: 8740, type: 'Redline' },
  { id: 'd5', name: 'Aperture_SOW_03.pdf', size: '72 KB', pages: 9, tokens: 6180, type: 'SOW' },
  { id: 'd6', name: 'Prior_MSA_Morrison_2023.pdf', size: '310 KB', pages: 48, tokens: 35210, type: 'MSA' },
];

const SEED_MESSAGES = [
  {
    role: 'user',
    content: 'Compare the limitation of liability clause in the vendor redline against our standard MSA. Flag anything that shifts risk to us.',
    ts: '10:42',
  },
  {
    role: 'assistant',
    content: `Three material shifts in the vendor redline (§11, Limitation of Liability) relative to Aperture_MSA_v4 §12:

**1. Cap formula changed.** Our standard caps liability at 2× fees paid in the preceding 12 months. Vendor redline proposes 1× fees paid in the preceding 6 months — roughly a 75% reduction in effective cap for a contract of this size.

**2. New carve-out removed.** Our §12.3 carves breach of confidentiality and data protection obligations *out* of the cap (uncapped exposure on those). The redline collapses this back under the cap. For a contract where we're sending them PII under the DPA, this is the most significant change.

**3. "Willful misconduct" narrowed to "gross negligence."** §12.2(b) in the redline replaces the willful-misconduct carve-out with a gross-negligence standard, which is a higher bar for us to recover.

I'd push back hardest on #2 — uncapped liability for confidentiality/DPA breach is standard in our book and aligns with the data volume contemplated in the Order Form (~2.4M records).`,
    ts: '10:42',
    tokens: { in: 54120, out: 412, cached: 45800 },
    citations: [
      { doc: 'Redlines_from_Vendor_2026-04-18.docx', page: 7, section: '§11' },
      { doc: 'Aperture_MSA_v4.pdf', page: 22, section: '§12' },
      { doc: 'Aperture_DPA_2025-03.pdf', page: 4, section: '§3.1' },
    ],
  },
  {
    role: 'user',
    content: 'Draft a redline counter on point 2 that restores uncapped liability for confidentiality and data protection, matching the language style in our MSA.',
    ts: '10:44',
  },
];

const DEFAULT_SYS_PROMPT = `You are a contract review assistant for an in-house legal team.

# Behavior
- Ground every factual claim in the attached documents. If a document does not address a point, say so explicitly.
- Prefer concrete clause references (section number, page) over summaries.
- When comparing documents, structure the response as a numbered list of material differences.
- Do not hedge with "I am not a lawyer." The user is a lawyer.
- Do not suggest consulting counsel. The user is counsel.

# Output
- Plain prose. Short paragraphs. Bold for the top-line finding of each numbered point.
- Cite as [DocName §X, p.N]. No hallucinated page numbers — only cite what you can locate.

# Attached documents
{{DOCUMENTS}}`;

function AssistantPage() {
  const [selectedDocs, setSelectedDocs] = useState(['d1', 'd4', 'd2']);
  const [showSysPrompt, setShowSysPrompt] = useState(false);
  const [sysPrompt, setSysPrompt] = useState(DEFAULT_SYS_PROMPT);
  const [input, setInput] = useState('');
  const [model] = useState('claude-opus-4-5');

  const selected = SEED_DOCS.filter(d => selectedDocs.includes(d.id));
  const totalTokens = selected.reduce((s, d) => s + d.tokens, 0);
  const ctxPct = Math.min(100, (totalTokens / 180000) * 100);

  const toggleDoc = id => setSelectedDocs(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <div style={{
      display: 'flex', height: '100%', background: tokens.bg, color: tokens.text,
      fontFamily: fontSans, fontSize: 13,
    }}>
      <Rail active="assistant" />

      {/* Documents sidebar */}
      <div style={{
        width: 280, borderRight: `1px solid ${tokens.border}`, background: tokens.bg,
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${tokens.borderSoft}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Workspace</div>
            <Btn size="sm" ghost icon={icons.upload}>Upload</Btn>
          </div>
          <div style={{ fontFamily: fontSerif, fontSize: 18, letterSpacing: '-0.01em', marginBottom: 2 }}>Aperture · MSA Renewal</div>
          <div style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.dim }}>6 documents · 100,750 tokens</div>
        </div>

        <div style={{ padding: '10px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            In Context · {selected.length}
          </div>
          <div style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.dim }}>
            {(totalTokens / 1000).toFixed(1)}k / 180k
          </div>
        </div>

        {/* context meter */}
        <div style={{ padding: '0 14px 10px' }}>
          <div style={{ height: 3, background: tokens.panelHi, borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
            <div style={{ height: '100%', width: `${ctxPct}%`, background: tokens.amber }} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 14px' }}>
          {SEED_DOCS.map(d => {
            const on = selectedDocs.includes(d.id);
            return (
              <div key={d.id} onClick={() => toggleDoc(d.id)} style={{
                display: 'flex', gap: 10, padding: '9px 8px', borderRadius: 3,
                cursor: 'pointer', marginBottom: 1,
                background: on ? tokens.panelHi : 'transparent',
                border: `1px solid ${on ? tokens.borderSoft : 'transparent'}`,
              }}>
                <div style={{
                  width: 14, height: 14, marginTop: 2, borderRadius: 2,
                  border: `1px solid ${on ? tokens.amber : tokens.border}`,
                  background: on ? tokens.amber : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {on && <Icon d={icons.check} size={9} stroke={3} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: on ? tokens.text : tokens.muted, lineHeight: 1.3, wordBreak: 'break-all', marginBottom: 2 }}>
                    {d.name}
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontFamily: fontMono, fontSize: 10, color: tokens.dim }}>
                    <span>{d.type}</span>
                    <span>·</span>
                    <span>{d.pages}p</span>
                    <span>·</span>
                    <span>{(d.tokens / 1000).toFixed(1)}k tok</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '10px 14px', borderTop: `1px solid ${tokens.borderSoft}`, fontFamily: fontMono, fontSize: 10.5, color: tokens.dim, display: 'flex', justifyContent: 'space-between' }}>
          <span>session · msa-renewal-04</span>
          <span>saved 10:44</span>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar
          crumbs={['~/workspaces', 'Aperture · MSA Renewal', 'Assistant']}
          right={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Pill tone="active">● OPUS 4.5</Pill>
              <Btn size="sm" ghost icon={icons.eye} onClick={() => setShowSysPrompt(s => !s)}>
                {showSysPrompt ? 'Hide' : 'Show'} prompt
              </Btn>
              <div style={{ width: 1, height: 18, background: tokens.border, margin: '0 4px' }} />
              <Btn size="sm" ghost icon={icons.plus}>New session</Btn>
            </div>
          }
        />

        {/* Context strip */}
        <div style={{
          padding: '10px 20px', borderBottom: `1px solid ${tokens.borderSoft}`,
          background: tokens.bg, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.dim, letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: 4 }}>
            Context
          </span>
          {selected.map(d => (
            <Pill key={d.id} tone="ctx">
              <Icon d={icons.doc} size={10} />
              {d.name}
            </Pill>
          ))}
          <div style={{ flex: 1 }} />
          <Pill>cache hit · 84%</Pill>
          <Pill>est. $0.04 / msg</Pill>
        </div>

        {/* System prompt panel */}
        {showSysPrompt && (
          <div style={{
            padding: '12px 20px 14px', borderBottom: `1px solid ${tokens.borderSoft}`,
            background: tokens.panel,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.amber, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  System prompt · editable
                </span>
                <Pill>{sysPrompt.length} chars · ~{Math.round(sysPrompt.length / 4)} tok</Pill>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn size="sm" ghost icon={icons.refresh}>Reset</Btn>
                <Btn size="sm" ghost icon={icons.copy}>Copy</Btn>
              </div>
            </div>
            <textarea
              value={sysPrompt}
              onChange={e => setSysPrompt(e.target.value)}
              style={{
                width: '100%', minHeight: 160, resize: 'vertical',
                background: tokens.bg, color: tokens.text,
                border: `1px solid ${tokens.border}`, borderRadius: 3,
                padding: 12, fontFamily: fontMono, fontSize: 11.5, lineHeight: 1.55,
                outline: 'none',
              }}
            />
            <div style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.dim, marginTop: 6 }}>
              {'{{DOCUMENTS}}'} is replaced with full text of selected docs on each call · nothing is hidden from you
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 0' }}>
          <div style={{ maxWidth: 780, margin: '0 auto', padding: '0 32px' }}>
            {SEED_MESSAGES.map((m, i) => <Message key={i} m={m} />)}
            {/* streaming indicator */}
            <div style={{ marginTop: 8, display: 'flex', gap: 14 }}>
              <RoleTag role="assistant" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: tokens.muted, fontSize: 12.5, paddingTop: 2 }}>
                <span className="ll-pulse" style={{
                  width: 7, height: 7, borderRadius: '50%', background: tokens.amber,
                  display: 'inline-block',
                }} />
                <span style={{ fontFamily: fontMono, fontSize: 11 }}>drafting redline counter · 847 tok generated</span>
              </div>
            </div>
          </div>
        </div>

        {/* Composer */}
        <div style={{ padding: '12px 32px 20px', borderTop: `1px solid ${tokens.borderSoft}` }}>
          <div style={{ maxWidth: 780, margin: '0 auto' }}>
            <div style={{
              border: `1px solid ${tokens.border}`, borderRadius: 4,
              background: tokens.panel, padding: '12px 14px',
            }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask about the selected documents…"
                style={{
                  width: '100%', minHeight: 52, maxHeight: 180, resize: 'none',
                  background: 'transparent', color: tokens.text, border: 'none', outline: 'none',
                  fontFamily: fontSans, fontSize: 13.5, lineHeight: 1.5,
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Btn size="sm" ghost icon={icons.doc}>Attach</Btn>
                  <div style={{ width: 1, height: 14, background: tokens.border }} />
                  <span style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.dim }}>
                    ⌘↵ to send · {selected.length} docs attached
                  </span>
                </div>
                <Btn primary icon={icons.send} size="sm">Send</Btn>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .ll-pulse { animation: llp 1.4s ease-in-out infinite; }
        @keyframes llp { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}

function RoleTag({ role }) {
  const isUser = role === 'user';
  return (
    <div style={{
      width: 28, flexShrink: 0, paddingTop: 2,
      fontFamily: fontMono, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase',
      color: isUser ? tokens.dim : tokens.amber, fontWeight: 500,
    }}>
      {isUser ? 'You' : 'LL'}
    </div>
  );
}

function Message({ m }) {
  const isUser = m.role === 'user';
  return (
    <div style={{ marginBottom: 28, display: 'flex', gap: 14 }}>
      <RoleTag role={m.role} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
          <span style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.dim }}>{m.ts}</span>
          {m.tokens && (
            <span style={{ fontFamily: fontMono, fontSize: 10.5, color: tokens.dim }}>
              in {m.tokens.in.toLocaleString()} · out {m.tokens.out} · cached {m.tokens.cached.toLocaleString()}
            </span>
          )}
        </div>
        <div style={{
          fontSize: isUser ? 13.5 : 13.5, lineHeight: 1.6,
          color: isUser ? tokens.muted : tokens.text,
          fontStyle: isUser ? 'normal' : 'normal',
          whiteSpace: 'pre-wrap',
        }}>
          {renderRich(m.content)}
        </div>
        {m.citations && (
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {m.citations.map((c, i) => (
              <span key={i} style={{
                fontFamily: fontMono, fontSize: 10.5, color: tokens.muted,
                border: `1px solid ${tokens.border}`, background: tokens.panel,
                padding: '3px 8px', borderRadius: 3,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <Icon d={icons.doc} size={10} />
                {c.doc.replace(/\.(pdf|docx)$/,'')} {c.section} · p.{c.page}
              </span>
            ))}
          </div>
        )}
        {!isUser && (
          <div style={{ marginTop: 10, display: 'flex', gap: 4 }}>
            <Btn size="sm" ghost icon={icons.copy}>Copy</Btn>
            <Btn size="sm" ghost icon={icons.refresh}>Regenerate</Btn>
            <Btn size="sm" ghost icon={icons.edit}>Edit prompt</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

function renderRich(text) {
  // bold via **...**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i} style={{ color: tokens.text, fontWeight: 600 }}>{p.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

window.AssistantPage = AssistantPage;
