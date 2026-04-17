import { useState, useEffect } from "react";

const API_KEY = "363d4fa1af679bc6a1fce4cff42e0a9d";
const FORM_IDS = {
  checkins:      "261065067494966",
  messages:      "261065765723966",
  sightings:     "261065244786967",
  personalNotes: "261065509008958",
  anonymousTips: "261065875889981",
};

async function fetchForm(formId) {
  const res = await fetch(`/jotform/form/${formId}/submissions?apiKey=${API_KEY}&limit=100`);
  const json = await res.json();
  return json.content || [];
}

function parseAnswers(submission) {
  const answers = submission.answers || {};
  const result = { id: submission.id, created_at: submission.created_at };
  Object.values(answers).forEach((a) => {
    const key = (a.name || a.text || "field").toLowerCase().replace(/\s+/g, "_");
    result[key] = a.answer ?? "";
  });
  return result;
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────
function str(item) { return JSON.stringify(item).toLowerCase(); }
function val(item, ...keys) {
  for (const k of keys) if (item[k] && String(item[k]).trim()) return String(item[k]).trim();
  return "";
}
function timeOf(item) { return val(item, "time", "saat", "created_at").slice(0, 5) || ""; }
function dateOf(item) { return val(item, "date", "tarih", "created_at").slice(0, 10) || ""; }
function locationOf(item) { return val(item, "location", "konum", "yer", "place") || "?"; }
function personOf(item) { return val(item, "person", "isim", "name", "from", "gonderen", "kimden", "author", "yazar", "witness", "tanik") || "?"; }
function contentOf(item) { return val(item, "content", "mesaj", "message", "icerik", "not", "note", "aciklama", "description", "ipucu", "tip") || ""; }

function getPeople(data) {
  const set = new Set();
  [...data.checkins, ...data.messages, ...data.sightings, ...data.personalNotes].forEach(item => {
    const n = personOf(item);
    if (n && n !== "?") set.add(n);
  });
  return [...set];
}

function suspicionScore(name, data) {
  const n = name.toLowerCase();
  let s = 0;
  data.checkins.forEach(c      => { if (str(c).includes(n)) s += 10; });
  data.messages.forEach(m      => { if (str(m).includes(n)) s += 8;  });
  data.sightings.forEach(sg    => { if (str(sg).includes(n)) s += 15; });
  data.anonymousTips.forEach(t => { if (str(t).includes(n)) s += 20; });
  return Math.min(s, 100);
}

// ── Stil Sabitleri ────────────────────────────────────────────────────────────
const COLORS = {
  bg:        "#1a1209",
  paper:     "#2a1f0e",
  paperLight:"#332610",
  border:    "#5a3e1b",
  borderLight:"#7a5a2b",
  accent:    "#c8922a",
  accentRed: "#8b1a1a",
  text:      "#e8d5a3",
  textDim:   "#9a7d4a",
  textFaint: "#5a4a2a",
  stamp:     "#8b1a1a",
  green:     "#2d5a1b",
  greenText: "#7bc96f",
};

const styles = {
  card: {
    background: COLORS.paper,
    border: `2px solid ${COLORS.border}`,
    borderRadius: 2,
    padding: "1.25rem",
    position: "relative",
    boxShadow: "3px 3px 12px rgba(0,0,0,0.5), inset 0 0 30px rgba(0,0,0,0.2)",
  },
  stamp: (text, color = COLORS.accentRed) => ({
    display: "inline-block",
    border: `3px solid ${color}`,
    color: color,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 2,
    textTransform: "uppercase",
    transform: "rotate(-8deg)",
    opacity: 0.85,
    fontFamily: "monospace",
  }),
  tag: (color = COLORS.accent) => ({
    background: "transparent",
    border: `1px solid ${color}`,
    color: color,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: "monospace",
  }),
  secTitle: {
    color: COLORS.textDim,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 3,
    margin: "0 0 1rem",
    fontFamily: "monospace",
    borderBottom: `1px solid ${COLORS.border}`,
    paddingBottom: "0.5rem",
  },
  divider: {
    border: "none",
    borderTop: `1px dashed ${COLORS.border}`,
    margin: "0.75rem 0",
  },
};

// ── UI Bileşenleri ────────────────────────────────────────────────────────────
function Tag({ text, color }) {
  const c = color === "red" ? COLORS.accentRed : color === "green" ? COLORS.greenText : COLORS.accent;
  return <span style={styles.tag(c)}>{text}</span>;
}

function Stamp({ text }) {
  return <span style={styles.stamp(text)}>{text}</span>;
}

function Card({ children, style, corner }) {
  return (
    <div style={{ ...styles.card, ...style }}>
      {corner && (
        <div style={{ position: "absolute", top: 8, right: 12, opacity: 0.4, fontSize: 10, color: COLORS.textDim, fontFamily: "monospace", letterSpacing: 1 }}>
          {corner}
        </div>
      )}
      {children}
    </div>
  );
}

function SecTitle({ children }) {
  return <h3 style={styles.secTitle}>▸ {children}</h3>;
}

function Empty() {
  return (
    <p style={{ color: COLORS.textFaint, textAlign: "center", padding: "2rem 0", fontFamily: "monospace", fontSize: 13 }}>
      [ KAYIT BULUNAMADI ]
    </p>
  );
}

function SuspicionBar({ score }) {
  const color = score >= 75 ? COLORS.accentRed : score >= 50 ? "#b8720a" : COLORS.green;
  return (
    <div style={{ background: COLORS.bg, borderRadius: 0, height: 6, marginTop: 6, border: `1px solid ${COLORS.textFaint}` }}>
      <div style={{ width: `${score}%`, height: "100%", background: color, transition: "width .6s ease" }} />
    </div>
  );
}

// ── Sekmeler ──────────────────────────────────────────────────────────────────
function Overview({ data, selectedPerson, onSelectPerson }) {
  const people = getPeople(data);
  const scores = people.map(p => ({ name: p, score: suspicionScore(p, data) })).sort((a, b) => b.score - a.score).slice(0, 8);
  const topSuspect = scores[0];

  const timeline = [
    ...data.checkins.map(c  => ({ ...c, _t: "checkin"  })),
    ...data.sightings.map(s => ({ ...s, _t: "sighting" })),
  ].filter(e => !selectedPerson || str(e).includes(selectedPerson.toLowerCase()));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* En Şüpheli */}
      {topSuspect && (
        <Card style={{ borderColor: COLORS.accentRed, background: "#200a0a" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ color: COLORS.accentRed, fontFamily: "monospace", fontSize: 10, letterSpacing: 3, margin: "0 0 4px", textTransform: "uppercase" }}>
                ⚠ Birinci Şüpheli
              </p>
              <h2 style={{ color: COLORS.text, margin: 0, fontSize: 22, fontFamily: "Georgia, serif" }}>{topSuspect.name}</h2>
              <p style={{ color: COLORS.textDim, fontFamily: "monospace", fontSize: 12, margin: "4px 0 0" }}>
                Şüphe Skoru: <span style={{ color: COLORS.accentRed, fontWeight: 700 }}>{topSuspect.score}%</span>
              </p>
            </div>
            <Stamp text="ŞÜPHELİ" />
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {/* Şüphe Skorları */}
        <Card corner="DOSYA-A1">
          <SecTitle>Şüphe Skorları</SecTitle>
          {scores.length === 0 && <Empty />}
          {scores.map(({ name, score }) => (
            <div key={name} onClick={() => onSelectPerson(selectedPerson === name ? null : name)}
              style={{ marginBottom: "1rem", cursor: "pointer", padding: "0.5rem",
                background: selectedPerson === name ? COLORS.bg : "transparent",
                border: selectedPerson === name ? `1px solid ${COLORS.accent}` : "1px solid transparent",
                borderRadius: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: COLORS.text, fontFamily: "Georgia, serif", fontSize: 14 }}>{name}</span>
                <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13,
                  color: score >= 75 ? COLORS.accentRed : score >= 50 ? "#b8720a" : COLORS.greenText }}>
                  {score}%
                </span>
              </div>
              <SuspicionBar score={score} />
            </div>
          ))}
        </Card>

        {/* Podo'nun İzi */}
        <Card corner="DOSYA-B2">
          <SecTitle>Podo'nun Son Görülme Noktaları</SecTitle>
          {data.sightings.length === 0 && <Empty />}
          {data.sightings.slice(0, 6).map((s, i) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <span style={{ color: COLORS.text, fontFamily: "Georgia, serif", fontSize: 14 }}>📍 {locationOf(s)}</span>
                  {contentOf(s) && <p style={{ color: COLORS.textDim, fontSize: 12, margin: "3px 0 0", fontFamily: "monospace" }}>{contentOf(s)}</p>}
                </div>
                <span style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: "monospace", minWidth: 40, textAlign: "right" }}>{timeOf(s)}</span>
              </div>
              {i < data.sightings.slice(0, 6).length - 1 && <hr style={styles.divider} />}
            </div>
          ))}
        </Card>
      </div>

      {/* Zaman Çizelgesi */}
      <Card corner="DOSYA-C3">
        <SecTitle>Olay Kronolojisi {selectedPerson && `— ${selectedPerson} filtresi aktif`}</SecTitle>
        {timeline.length === 0 && <Empty />}
        <div style={{ position: "relative", paddingLeft: "2rem" }}>
          <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, width: 1, background: COLORS.border, borderLeft: `1px dashed ${COLORS.border}` }} />
          {timeline.map((e, i) => (
            <div key={i} style={{ marginBottom: "1.25rem", position: "relative" }}>
              <div style={{ position: "absolute", left: -26, top: 4, width: 10, height: 10,
                background: e._t === "checkin" ? COLORS.accent : COLORS.accentRed,
                border: `2px solid ${COLORS.bg}`, borderRadius: "50%" }} />
              <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                <span style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: "monospace", minWidth: 38 }}>{timeOf(e)}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ color: COLORS.text, fontWeight: 600, fontFamily: "Georgia, serif" }}>{personOf(e)}</span>
                  <span style={{ color: COLORS.textDim, fontSize: 13 }}> — {locationOf(e)}</span>
                  {contentOf(e) && <p style={{ color: COLORS.textDim, fontSize: 12, margin: "3px 0 0", fontFamily: "monospace" }}>{contentOf(e)}</p>}
                </div>
                <Tag text={e._t === "checkin" ? "Check-in" : "Görülme"} color={e._t === "checkin" ? "default" : "red"} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Checkins({ data, search }) {
  const items = data.checkins.filter(c => str(c).includes(search.toLowerCase()));
  if (!items.length) return <Empty />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {items.map((c, i) => (
        <Card key={i} corner={`#${String(i+1).padStart(3,"0")}`}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <span style={{ color: COLORS.text, fontWeight: 700, fontFamily: "Georgia, serif", fontSize: 15 }}>{personOf(c)}</span>
              <span style={{ color: COLORS.textDim, marginLeft: 8, fontSize: 13, fontFamily: "monospace" }}>@ {locationOf(c)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: "monospace" }}>{timeOf(c)} {dateOf(c)}</span>
              <Tag text="Check-in" />
            </div>
          </div>
          {contentOf(c) && <p style={{ color: COLORS.textDim, margin: "8px 0 0", fontSize: 13, fontFamily: "monospace" }}>» {contentOf(c)}</p>}
        </Card>
      ))}
    </div>
  );
}

function Sightings({ data, search }) {
  const items = data.sightings.filter(s => str(s).includes(search.toLowerCase()));
  if (!items.length) return <Empty />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {items.map((s, i) => (
        <Card key={i} corner={`#${String(i+1).padStart(3,"0")}`}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span style={{ color: COLORS.text, fontWeight: 700, fontFamily: "Georgia, serif" }}>📍 {locationOf(s)}</span>
            <span style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: "monospace" }}>{timeOf(s)} {dateOf(s)}</span>
          </div>
          {contentOf(s) && <p style={{ color: COLORS.textDim, margin: "8px 0", fontSize: 13, fontFamily: "monospace" }}>» {contentOf(s)}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {personOf(s) !== "?" && <Tag text={`Tanık: ${personOf(s)}`} />}
            <Tag text="Görülme" color="red" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function Messages({ data, search }) {
  const items = data.messages.filter(m => str(m).includes(search.toLowerCase()));
  if (!items.length) return <Empty />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {items.map((m, i) => {
        const to = val(m, "to", "alici", "kime");
        return (
          <Card key={i} corner={`#${String(i+1).padStart(3,"0")}`}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontFamily: "monospace", fontSize: 13 }}>
                <span style={{ color: COLORS.accent, fontWeight: 600 }}>{personOf(m)}</span>
                {to && <><span style={{ color: COLORS.textFaint }}> ──► </span><span style={{ color: COLORS.text, fontWeight: 600 }}>{to}</span></>}
              </span>
              <span style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: "monospace" }}>{timeOf(m)}</span>
            </div>
            <hr style={styles.divider} />
            {contentOf(m) && (
              <p style={{ color: COLORS.text, fontSize: 14, margin: "10px 0 0", fontFamily: "Georgia, serif", fontStyle: "italic", lineHeight: 1.6 }}>
                "{contentOf(m)}"
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Notes({ data }) {
  if (!data.personalNotes.length) return <Empty />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {data.personalNotes.map((n, i) => (
        <Card key={i} corner={`NOT-${String(i+1).padStart(2,"0")}`}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: COLORS.accent, fontWeight: 600, fontFamily: "Georgia, serif" }}>{personOf(n)}</span>
            <span style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: "monospace" }}>{dateOf(n)}</span>
          </div>
          <hr style={styles.divider} />
          {contentOf(n) && (
            <p style={{ color: COLORS.text, fontSize: 14, margin: "10px 0 0", fontFamily: "Georgia, serif", lineHeight: 1.7 }}>
              {contentOf(n)}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}

function Tips({ data }) {
  if (!data.anonymousTips.length) return <Empty />;
  const relColor = (r = "") => {
    const v = r.toLowerCase();
    if (v.includes("yük") || v.includes("high")) return "green";
    if (v.includes("ort") || v.includes("med")) return "default";
    return "red";
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {data.anonymousTips.map((t, i) => {
        const rel = val(t, "reliability", "guvenilirlik", "guveni");
        return (
          <Card key={i} style={{ borderColor: COLORS.accentRed, borderStyle: "dashed" }} corner={`İPUCU-${String(i+1).padStart(2,"0")}`}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
              {rel && <Tag text={`Güvenilirlik: ${rel}`} color={relColor(rel)} />}
              <span style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: "monospace" }}>{timeOf(t)} {dateOf(t)}</span>
            </div>
            <hr style={styles.divider} />
            {contentOf(t) && (
              <p style={{ color: COLORS.text, fontSize: 14, margin: "10px 0 0", fontFamily: "Georgia, serif", fontStyle: "italic", lineHeight: 1.6 }}>
                "{contentOf(t)}"
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function RawData({ data }) {
  const [open, setOpen] = useState(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <p style={{ color: COLORS.textFaint, fontSize: 12, fontFamily: "monospace", margin: 0 }}>
        [ Alan isimlerini görmek için her kaynağa tıklayın ]
      </p>
      {Object.entries(data).map(([key, items]) => (
        <Card key={key}>
          <div style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpen(open === key ? null : key)}>
            <span style={{ color: COLORS.text, fontFamily: "monospace", fontWeight: 700 }}>{key} <span style={{ color: COLORS.textDim, fontWeight: 400 }}>({items.length} kayıt)</span></span>
            <span style={{ color: COLORS.textDim, fontFamily: "monospace" }}>{open === key ? "▲" : "▼"}</span>
          </div>
          {open === key && items.length > 0 && (
            <pre style={{ color: COLORS.textDim, fontSize: 11, marginTop: 12, overflow: "auto", maxHeight: 300, background: COLORS.bg, padding: "1rem", borderRadius: 2, fontFamily: "monospace" }}>
              {JSON.stringify(items[0], null, 2)}
            </pre>
          )}
          {open === key && items.length === 0 && <p style={{ color: COLORS.textFaint, marginTop: 8, fontFamily: "monospace" }}>[ KAYIT YOK ]</p>}
        </Card>
      ))}
    </div>
  );
}

// ── Ana Uygulama ──────────────────────────────────────────────────────────────
const TABS = [
  { id: "Özet",         label: "📋 ÖZET"       },
  { id: "Check-in'ler", label: "📌 CHECK-IN"   },
  { id: "Görülme",      label: "👁 GÖRÜLME"    },
  { id: "Mesajlar",     label: "✉ MESAJLAR"   },
  { id: "Notlar",       label: "🗒 NOTLAR"     },
  { id: "İpuçları",     label: "⚠ İPUÇLARI"  },
  { id: "Ham Veri",     label: "⚙ HAM VERİ"  },
];

export default function App() {
  const [tab, setTab]           = useState("Özet");
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [data, setData]         = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [checkins, messages, sightings, personalNotes, anonymousTips] = await Promise.all(
          Object.values(FORM_IDS).map(fetchForm)
        );
        setData({
          checkins:      checkins.map(parseAnswers),
          messages:      messages.map(parseAnswers),
          sightings:     sightings.map(parseAnswers),
          personalNotes: personalNotes.map(parseAnswers),
          anonymousTips: anonymousTips.map(parseAnswers),
        });
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <p style={{ color: COLORS.textDim, fontSize: 16, fontFamily: "monospace", letterSpacing: 2 }}>DOSYA YÜKLENİYOR...</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <p style={{ color: COLORS.accentRed, fontFamily: "monospace" }}>HATA: {error}</p>
        <button onClick={() => window.location.reload()}
          style={{ marginTop: 12, padding: "0.5rem 1.5rem", background: "transparent", color: COLORS.accent,
            border: `2px solid ${COLORS.accent}`, cursor: "pointer", fontFamily: "monospace", letterSpacing: 2 }}>
          TEKRAR DENE
        </button>
      </div>
    </div>
  );

  const total = Object.values(data).reduce((s, a) => s + a.length, 0);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ background: COLORS.paper, borderBottom: `2px solid ${COLORS.border}`, padding: "1.25rem 2rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ margin: 0, color: COLORS.textFaint, fontSize: 10, letterSpacing: 3, fontFamily: "monospace", textTransform: "uppercase" }}>
                GİZLİ • ANKARA POLİS DOSYASI • 2026
              </p>
              <h1 style={{ margin: "4px 0", fontSize: 24, fontWeight: 900, color: COLORS.text, fontFamily: "Georgia, serif", letterSpacing: 1 }}>
                🐾 Missing Podo: The Ankara Case
              </h1>
              <p style={{ margin: 0, color: COLORS.textDim, fontSize: 12, fontFamily: "monospace" }}>
                Soruşturma Panosu — {total} kayıt inceleniyor
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
              <Stamp text="GİZLİ" />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                <Tag text={`${data.checkins.length} Check-in`} />
                <Tag text={`${data.sightings.length} Görülme`} color="red" />
                <Tag text={`${data.messages.length} Mesaj`} />
                <Tag text={`${data.anonymousTips.length} İpucu`} color="red" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: COLORS.paperLight, borderBottom: `1px solid ${COLORS.border}`, overflowX: "auto" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 2rem", display: "flex", alignItems: "center", minWidth: "max-content" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "0.7rem 1.1rem", background: "none", border: "none",
              borderBottom: tab === t.id ? `2px solid ${COLORS.accent}` : "2px solid transparent",
              color: tab === t.id ? COLORS.accent : COLORS.textDim,
              fontWeight: tab === t.id ? 700 : 400,
              cursor: "pointer", fontSize: 11, whiteSpace: "nowrap",
              fontFamily: "monospace", letterSpacing: 1,
            }}>{t.label}</button>
          ))}
          <div style={{ marginLeft: "auto", paddingLeft: "1rem" }}>
            <input placeholder="[ ARA... ]" value={search} onChange={e => setSearch(e.target.value)}
              style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                padding: "0.35rem 0.75rem", color: COLORS.text, fontSize: 12, outline: "none",
                width: 140, fontFamily: "monospace", letterSpacing: 1 }} />
          </div>
        </div>
      </div>

      {/* İçerik */}
      <div style={{ maxWidth: 1100, margin: "1.5rem auto", padding: "0 2rem 3rem" }}>
        {tab === "Özet"         && <Overview  data={data} selectedPerson={selected} onSelectPerson={setSelected} />}
        {tab === "Check-in'ler" && <Checkins  data={data} search={search} />}
        {tab === "Görülme"      && <Sightings data={data} search={search} />}
        {tab === "Mesajlar"     && <Messages  data={data} search={search} />}
        {tab === "Notlar"       && <Notes     data={data} />}
        {tab === "İpuçları"     && <Tips      data={data} />}
        {tab === "Ham Veri"     && <RawData   data={data} />}
      </div>
    </div>
  );
}