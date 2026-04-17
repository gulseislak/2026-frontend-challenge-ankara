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

// ── UI Bileşenleri ────────────────────────────────────────────────────────────
function Badge({ text, color = "gray" }) {
  const palette = {
    blue:   { bg: "#1e3a5f", fg: "#93c5fd" },
    orange: { bg: "#4a1f07", fg: "#fdba74" },
    green:  { bg: "#052e16", fg: "#86efac" },
    red:    { bg: "#450a0a", fg: "#fca5a5" },
    purple: { bg: "#2e1065", fg: "#c4b5fd" },
    gray:   { bg: "#1e293b", fg: "#94a3b8" },
  };
  const c = palette[color] || palette.gray;
  return (
    <span style={{ background: c.bg, color: c.fg, padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: "1.25rem", ...style }}>
      {children}
    </div>
  );
}

function SecTitle({ children }) {
  return <h3 style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, margin: "0 0 1rem" }}>{children}</h3>;
}

function Empty() {
  return <p style={{ color: "#475569", textAlign: "center", padding: "2rem 0", margin: 0 }}>Kayıt bulunamadı.</p>;
}

function SuspicionBar({ score }) {
  const color = score >= 75 ? "#ef4444" : score >= 50 ? "#f97316" : "#22c55e";
  return (
    <div style={{ background: "#0f172a", borderRadius: 4, height: 8, marginTop: 6 }}>
      <div style={{ width: `${score}%`, height: "100%", borderRadius: 4, background: color, transition: "width .6s ease" }} />
    </div>
  );
}

// ── Veri Yardımcıları ─────────────────────────────────────────────────────────
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

// ── Sekmeler ──────────────────────────────────────────────────────────────────
function Overview({ data, selectedPerson, onSelectPerson }) {
  const people = getPeople(data);
  const scores = people.map(p => ({ name: p, score: suspicionScore(p, data) })).sort((a, b) => b.score - a.score).slice(0, 8);

  const timeline = [
    ...data.checkins.map(c  => ({ ...c, _t: "checkin"  })),
    ...data.sightings.map(s => ({ ...s, _t: "sighting" })),
  ].filter(e => !selectedPerson || str(e).includes(selectedPerson.toLowerCase()));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
      {/* Şüphe Skorları */}
      <Card>
        <SecTitle>🎯 Şüphe Skorları</SecTitle>
        {scores.length === 0 && <p style={{ color: "#475569" }}>Yeterli veri yok.</p>}
        {scores.map(({ name, score }) => (
          <div key={name} onClick={() => onSelectPerson(selectedPerson === name ? null : name)}
            style={{ marginBottom: "1rem", cursor: "pointer", padding: "0.5rem", borderRadius: 8,
              background: selectedPerson === name ? "#0f172a" : "transparent",
              border: selectedPerson === name ? "1px solid #3b82f6" : "1px solid transparent" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{name}</span>
              <span style={{ fontWeight: 700, color: score >= 75 ? "#ef4444" : score >= 50 ? "#f97316" : "#22c55e" }}>{score}%</span>
            </div>
            <SuspicionBar score={score} />
          </div>
        ))}
      </Card>

      {/* Podo'nun İzi */}
      <Card>
        <SecTitle>📍 Podo'nun İzi — Son Görülmeler</SecTitle>
        {data.sightings.length === 0 && <Empty />}
        {data.sightings.slice(0, 6).map((s, i) => (
          <div key={i} style={{ marginBottom: "0.75rem", paddingBottom: "0.75rem", borderBottom: "1px solid #334155" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{locationOf(s)}</span>
              <span style={{ color: "#64748b", fontSize: 13 }}>{timeOf(s)}</span>
            </div>
            {contentOf(s) && <p style={{ color: "#94a3b8", fontSize: 13, margin: "4px 0 0" }}>{contentOf(s)}</p>}
          </div>
        ))}
      </Card>

      {/* Zaman Çizelgesi */}
      <Card style={{ gridColumn: "1 / -1" }}>
        <SecTitle>⏱ Zaman Çizelgesi {selectedPerson && `— ${selectedPerson}`}</SecTitle>
        {timeline.length === 0 && <Empty />}
        <div style={{ position: "relative", paddingLeft: "1.5rem" }}>
          <div style={{ position: "absolute", left: 7, top: 0, bottom: 0, width: 2, background: "#334155" }} />
          {timeline.map((e, i) => (
            <div key={i} style={{ marginBottom: "1rem", position: "relative" }}>
              <div style={{ position: "absolute", left: -22, top: 4, width: 12, height: 12, borderRadius: "50%",
                background: e._t === "checkin" ? "#3b82f6" : "#a855f7", border: "2px solid #0f172a" }} />
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                <span style={{ color: "#64748b", fontSize: 12, minWidth: 40 }}>{timeOf(e)}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{personOf(e)}</span>
                  <span style={{ color: "#64748b", fontSize: 13 }}> — {locationOf(e)}</span>
                  {contentOf(e) && <p style={{ color: "#94a3b8", fontSize: 13, margin: "2px 0 0" }}>{contentOf(e)}</p>}
                </div>
                <Badge text={e._t === "checkin" ? "Check-in" : "Görülme"} color={e._t === "checkin" ? "blue" : "orange"} />
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
        <Card key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{personOf(c)}</span>
              <span style={{ color: "#64748b", marginLeft: 8 }}>📍 {locationOf(c)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#64748b", fontSize: 13 }}>{timeOf(c)} {dateOf(c)}</span>
              <Badge text="Check-in" color="blue" />
            </div>
          </div>
          {contentOf(c) && <p style={{ color: "#94a3b8", margin: "8px 0 0", fontSize: 14 }}>🗒 {contentOf(c)}</p>}
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
        <Card key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span style={{ color: "#e2e8f0", fontWeight: 700 }}>📍 {locationOf(s)}</span>
            <span style={{ color: "#64748b", fontSize: 13 }}>{timeOf(s)} {dateOf(s)}</span>
          </div>
          {contentOf(s) && <p style={{ color: "#94a3b8", margin: "8px 0", fontSize: 14 }}>{contentOf(s)}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {personOf(s) !== "?" && <Badge text={`Tanık: ${personOf(s)}`} color="gray" />}
            <Badge text="Görülme" color="orange" />
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
          <Card key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: "#93c5fd", fontWeight: 600 }}>{personOf(m)}</span>
                {to && <><span style={{ color: "#475569" }}> → </span><span style={{ color: "#c4b5fd", fontWeight: 600 }}>{to}</span></>}
              </span>
              <span style={{ color: "#64748b", fontSize: 13 }}>{timeOf(m)}</span>
            </div>
            {contentOf(m) && <p style={{ color: "#e2e8f0", fontSize: 15, margin: 0, fontStyle: "italic" }}>"{contentOf(m)}"</p>}
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
        <Card key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "#93c5fd", fontWeight: 600 }}>{personOf(n)}</span>
            <span style={{ color: "#64748b", fontSize: 13 }}>{dateOf(n)}</span>
          </div>
          {contentOf(n) && <p style={{ color: "#e2e8f0", fontSize: 15, margin: 0 }}>{contentOf(n)}</p>}
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
    if (v.includes("ort") || v.includes("med")) return "orange";
    return "red";
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {data.anonymousTips.map((t, i) => {
        const rel = val(t, "reliability", "guvenilirlik", "guveni");
        return (
          <Card key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
              {rel && <Badge text={`Güvenilirlik: ${rel}`} color={relColor(rel)} />}
              <span style={{ color: "#64748b", fontSize: 13 }}>{timeOf(t)} {dateOf(t)}</span>
            </div>
            {contentOf(t) && <p style={{ color: "#e2e8f0", fontSize: 15, margin: 0 }}>{contentOf(t)}</p>}
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
      <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>Alan isimlerini görmek için her kaynağın ilk kaydına tıklayın.</p>
      {Object.entries(data).map(([key, items]) => (
        <Card key={key}>
          <div style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpen(open === key ? null : key)}>
            <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{key} <span style={{ color: "#64748b", fontWeight: 400 }}>({items.length} kayıt)</span></span>
            <span style={{ color: "#64748b" }}>{open === key ? "▲" : "▼"}</span>
          </div>
          {open === key && items.length > 0 && (
            <pre style={{ color: "#94a3b8", fontSize: 11, marginTop: 12, overflow: "auto", maxHeight: 300, background: "#0f172a", padding: "1rem", borderRadius: 8 }}>
              {JSON.stringify(items[0], null, 2)}
            </pre>
          )}
          {open === key && items.length === 0 && <p style={{ color: "#475569", marginTop: 8 }}>Kayıt yok.</p>}
        </Card>
      ))}
    </div>
  );
}

// ── Ana Uygulama ──────────────────────────────────────────────────────────────
const TABS = ["Özet", "Check-in'ler", "Görülme", "Mesajlar", "Notlar", "İpuçları", "Ham Veri"];

export default function App() {
  const [tab, setTab]               = useState("Özet");
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [data, setData]             = useState(null);

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
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <p style={{ color: "#64748b", fontSize: 18 }}>Veriler yükleniyor...</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <p style={{ color: "#ef4444" }}>Hata: {error}</p>
        <button onClick={() => window.location.reload()}
          style={{ marginTop: 12, padding: "0.5rem 1.5rem", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
          Tekrar Dene
        </button>
      </div>
    </div>
  );

  const total = Object.values(data).reduce((s, a) => s + a.length, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "#e2e8f0", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#1e293b", borderBottom: "1px solid #334155", padding: "1rem 2rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#f1f5f9" }}>🐾 Missing Podo: The Ankara Case</h1>
            <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>Soruşturma Panosu — {total} kayıt</p>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge text={`${data.checkins.length} Check-in`}      color="blue"   />
            <Badge text={`${data.sightings.length} Görülme`}      color="orange" />
            <Badge text={`${data.messages.length} Mesaj`}         color="purple" />
            <Badge text={`${data.anonymousTips.length} İpucu`}    color="gray"   />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#1e293b", borderBottom: "1px solid #334155", overflowX: "auto" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 2rem", display: "flex", alignItems: "center", minWidth: "max-content" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "0.7rem 1rem", background: "none", border: "none",
              borderBottom: tab === t ? "2px solid #3b82f6" : "2px solid transparent",
              color: tab === t ? "#60a5fa" : "#64748b",
              fontWeight: tab === t ? 700 : 400,
              cursor: "pointer", fontSize: 13, whiteSpace: "nowrap",
            }}>{t}</button>
          ))}
          <div style={{ marginLeft: "auto", paddingLeft: "1rem" }}>
            <input placeholder="🔍 Ara..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8,
                padding: "0.35rem 0.75rem", color: "#e2e8f0", fontSize: 13, outline: "none", width: 150 }} />
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