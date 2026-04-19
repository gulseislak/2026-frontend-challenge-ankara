import { useState, useEffect, useRef, useCallback } from "react";

const API_KEY = "363d4fa1af679bc6a1fce4cff42e0a9d";
const FORM_IDS = {
  checkins:      "261065067494966",
  messages:      "261065765723966",
  sightings:     "261065244786967",
  personalNotes: "261065509008958",
  anonymousTips: "261065875889981",
};

// ── Data Fetching ─────────────────────────────────────────────────────────────
async function fetchForm(formId) {
  const res = await fetch(`/jotform/form/${formId}/submissions?apiKey=${API_KEY}&limit=100`);
  const json = await res.json();
  return json.content || [];
}

// Flatten answer value — handles nested {first, last}, arrays, objects
function flattenAnswer(answer) {
  if (!answer) return "";
  if (typeof answer === "string") return answer.trim();
  if (typeof answer === "number") return String(answer);
  if (Array.isArray(answer)) return answer.filter(Boolean).join(", ");
  if (typeof answer === "object") {
    const parts = [answer.first, answer.middle, answer.last].filter(Boolean);
    if (parts.length) return parts.join(" ").trim();
    if (answer.addr_line1 || answer.city) {
      return [answer.addr_line1, answer.addr_line2, answer.city, answer.state, answer.country].filter(Boolean).join(", ");
    }
    if (answer.datetime) return answer.datetime;
    if (answer.date) return answer.date;
    const vals = Object.values(answer).filter(v => v && typeof v === "string" && v.trim());
    return vals.join(" ").trim();
  }
  return "";
}

function parseAnswers(submission) {
  const answers = submission.answers || {};
  const result = {
    _id: submission.id,
    _created_at: submission.created_at,
    _raw: submission,
  };
  Object.values(answers).forEach((a) => {
    const key = (a.name || "field").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const flatVal = flattenAnswer(a.answer);
    result[key] = flatVal;
    if (a.text) {
      const labelKey = a.text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (labelKey !== key) result[labelKey] = flatVal;
    }
    result[`_field_${a.order}`] = flatVal;
  });
  return result;
}

// ── Smart Field Extractors ────────────────────────────────────────────────────
function str(item) {
  const clean = Object.fromEntries(Object.entries(item).filter(([k]) => !k.startsWith("_raw")));
  return JSON.stringify(clean).toLowerCase();
}

function val(item, ...keys) {
  for (const k of keys) {
    const v = item[k];
    if (v && String(v).trim() && String(v).trim() !== "0") return String(v).trim();
  }
  return "";
}

function personOf(item) {
  return val(item,
    "name","person","person_name","full_name","fullname",
    "witness","witness_name","author","reporter",
    "from","sender","submitted_by",
    "isim","ad","ad_soyad","adsoyad","kisi","kisi_adi",
    "gonderen","kimden","tanik","tanik_adi",
    "_field_1","_field_2","_field_3"
  ) || "—";
}

function locationOf(item) {
  return val(item,
    "location","place","address","venue","spot",
    "konum","yer","adres","mekan","lokasyon",
    "where","seen_at","location_name","city","district",
    "_field_4","_field_5"
  ) || "?";
}

function contentOf(item) {
  return val(item,
    "content","message","note","description","details","tip",
    "mesaj","icerik","not","aciklama","detay","ipucu","bilgi",
    "what_happened","notes","comment","info",
    "_field_6","_field_7"
  ) || "";
}

function timeOf(item) {
  const t = val(item,"time","saat","hour","_created_at");
  if (!t) return "";
  const match = t.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : t.slice(0,5);
}

function dateOf(item) {
  return val(item,"date","tarih","day","_created_at").slice(0,10) || "";
}

function coordsOf(item) {
  const lat = parseFloat(val(item,"latitude","lat","enlem"));
  const lng = parseFloat(val(item,"longitude","lng","lon","boylam"));
  if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  const loc = locationOf(item).toLowerCase();
  const knownPlaces = {
    "kızılay":      { lat:39.9208, lng:32.8541 },
    "kizilay":      { lat:39.9208, lng:32.8541 },
    "çankaya":      { lat:39.9033, lng:32.8597 },
    "cankaya":      { lat:39.9033, lng:32.8597 },
    "ulus":         { lat:39.9414, lng:32.8597 },
    "etlik":        { lat:39.9667, lng:32.8833 },
    "keçiören":     { lat:39.9833, lng:32.8667 },
    "kecioren":     { lat:39.9833, lng:32.8667 },
    "mamak":        { lat:39.9167, lng:32.9167 },
    "sincan":       { lat:39.9667, lng:32.5833 },
    "batıkent":     { lat:39.9667, lng:32.7333 },
    "batikent":     { lat:39.9667, lng:32.7333 },
    "bahçelievler": { lat:39.9125, lng:32.8264 },
    "bahcelievler": { lat:39.9125, lng:32.8264 },
    "dikmen":       { lat:39.8833, lng:32.8667 },
    "tunalı":       { lat:39.9089, lng:32.8597 },
    "tunali":       { lat:39.9089, lng:32.8597 },
    "yenimahalle":  { lat:39.9667, lng:32.7833 },
    "altındağ":     { lat:39.9500, lng:32.8833 },
    "altindag":     { lat:39.9500, lng:32.8833 },
    "ankara":       { lat:39.9334, lng:32.8597 },
  };
  for (const [place, coords] of Object.entries(knownPlaces)) {
    if (loc.includes(place)) return coords;
  }
  return null;
}

function getPeople(data) {
  const set = new Set();
  [...data.checkins, ...data.messages, ...data.sightings, ...data.personalNotes].forEach(item => {
    const n = personOf(item);
    if (n && n !== "—" && n !== "?") set.add(n);
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

// ── Global Styles ─────────────────────────────────────────────────────────────
const globalStyle = `
  @import url('https://fonts.googleapis.com/css2?family=Rye&family=Special+Elite&family=Oswald:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background-color: #1a0f00;
    background-image:
      repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px),
      radial-gradient(ellipse at 20% 50%, rgba(80,40,0,0.3) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 20%, rgba(60,20,0,0.3) 0%, transparent 60%);
  }
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-track { background: #1a0f00; }
  ::-webkit-scrollbar-thumb { background: #7a4a00; }
  .wanted-btn {
    background: linear-gradient(180deg, #d4820a 0%, #8b4500 50%, #6b3200 100%);
    border: 2px solid #f0a020; color: #fff8e0;
    font-family: 'Oswald', sans-serif; font-weight: 600;
    letter-spacing: 2px; text-transform: uppercase;
    cursor: pointer; padding: 6px 14px; font-size: 11px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,220,100,0.3);
    transition: all 0.15s;
    clip-path: polygon(4px 0%, calc(100% - 4px) 0%, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0% calc(100% - 4px), 0% 4px);
  }
  .wanted-btn:hover { background: linear-gradient(180deg, #e89010 0%, #a05500 50%, #7a3800 100%); }
  .wanted-btn.active {
    background: linear-gradient(180deg, #f0a020 0%, #c06800 50%, #8b4500 100%);
    border-color: #ffd060; color: #fff;
    box-shadow: 0 0 12px rgba(240,160,32,0.5);
  }
  .nail {
    width: 14px; height: 14px;
    background: radial-gradient(circle at 35% 35%, #d0c080, #806040 50%, #403020);
    border-radius: 50%; box-shadow: 1px 1px 3px rgba(0,0,0,0.7);
    position: absolute; z-index: 10;
  }
  .paper-card {
    background:
      repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(180,140,60,0.08) 27px, rgba(180,140,60,0.08) 28px),
      linear-gradient(135deg, #f5e8c0 0%, #eddba0 30%, #e8d090 60%, #f0e0b0 100%);
    border: 1px solid rgba(120,80,20,0.4);
    box-shadow: 3px 3px 0 rgba(0,0,0,0.4), 6px 6px 0 rgba(0,0,0,0.2), inset 0 0 40px rgba(100,60,0,0.15);
    position: relative; overflow: visible;
  }
  .wood-panel {
    background:
      repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 6px),
      linear-gradient(180deg, #4a2800 0%, #3a1e00 40%, #2e1600 70%, #3a1e00 100%);
    border-top: 3px solid #6a3a00; border-bottom: 3px solid #1a0800;
  }
  .rivet {
    display: inline-block; width: 10px; height: 10px;
    background: radial-gradient(circle at 35% 35%, #c0a060, #705030 60%, #302010);
    border-radius: 50%; box-shadow: 1px 1px 2px rgba(0,0,0,0.8); margin: 0 4px;
  }
  .warning-stripe {
    background: repeating-linear-gradient(-45deg, #1a0f00, #1a0f00 8px, #d4820a 8px, #d4820a 16px);
    height: 6px; opacity: 0.7;
  }
  .search-input {
    background: rgba(20,10,0,0.8); border: 2px solid #6a3a00; border-bottom-color: #d4820a;
    color: #f5e8c0; font-family: 'Special Elite', cursive;
    font-size: 13px; padding: 6px 12px; outline: none; width: 160px; letter-spacing: 1px;
    clip-path: polygon(3px 0%, calc(100% - 3px) 0%, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0% calc(100% - 3px), 0% 3px);
  }
  .search-input::placeholder { color: #7a5a30; }
  .search-input:focus { border-bottom-color: #f0a020; }
  .list-item-row { transition: background 0.15s, border-color 0.15s; cursor: pointer; }
  .list-item-row:hover { background: rgba(212,130,10,0.08) !important; }
  .list-item-row.highlighted { background: rgba(212,130,10,0.18) !important; border-left: 4px solid #d4820a !important; }
  @keyframes flicker {
    0%,100% { opacity:1; } 92% { opacity:1; } 93% { opacity:0.8; } 94% { opacity:1; }
  }
  @keyframes fadeIn {
    from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); }
  }
  .fade-in { animation: fadeIn 0.4s ease forwards; }
  .leaflet-container { font-family: 'Special Elite', cursive !important; }
  .leaflet-popup-content-wrapper {
    background: #f5e8c0 !important; border: 2px solid #8b4500 !important;
    border-radius: 2px !important; box-shadow: 4px 4px 0 rgba(0,0,0,0.4) !important;
  }
  .leaflet-popup-tip { background: #f5e8c0 !important; }
  .leaflet-popup-content { font-family: 'Special Elite', cursive; color: #2a1400; margin: 10px 14px; }
  .map-tiles { filter: sepia(0.8) contrast(0.85) brightness(0.65) hue-rotate(10deg); }
`;

const C = {
  bg:"#1a0f00", wood:"#3a1e00", paper:"#f0e0b0", ink:"#2a1400",
  inkLight:"#4a2800", inkFaint:"#8a6030",
  gold:"#d4820a", goldLight:"#f0a020", goldBright:"#ffd060",
  red:"#8b1a00", redLight:"#c02a00",
  green:"#1a4a00", greenLight:"#3a8a00", cream:"#f5e8c0",
};

// ── UI Components ─────────────────────────────────────────────────────────────
function Nail({ style }) { return <div className="nail" style={style} />; }

function WantedBanner({ children }) {
  return (
    <div style={{ background:"linear-gradient(180deg,#8b1a00,#6b1000 50%,#8b1a00)",border:"3px solid #c03000",borderLeft:"6px solid #d04000",borderRight:"6px solid #d04000",padding:"4px 20px",textAlign:"center",boxShadow:"0 3px 12px rgba(0,0,0,0.6)" }}>
      <span style={{ fontFamily:"'Rye',serif",color:"#ffd060",fontSize:13,letterSpacing:4,textTransform:"uppercase",textShadow:"0 0 10px rgba(255,160,0,0.5),1px 1px 0 rgba(0,0,0,0.8)" }}>{children}</span>
    </div>
  );
}

function PaperCard({ children, style, nails, corner }) {
  return (
    <div className="paper-card" style={{ padding:"1.25rem",borderRadius:2,...style }}>
      {nails && <><Nail style={{top:-5,left:-5}}/><Nail style={{top:-5,right:-5}}/><Nail style={{bottom:-5,left:-5}}/><Nail style={{bottom:-5,right:-5}}/></>}
      {corner && <div style={{position:"absolute",top:6,right:8,fontFamily:"'Oswald',sans-serif",fontSize:9,color:C.inkFaint,letterSpacing:2,textTransform:"uppercase"}}>{corner}</div>}
      {children}
    </div>
  );
}

function SecTitle({ children, icon }) {
  return (
    <div style={{ marginBottom:"1rem" }}>
      <div style={{ display:"flex",alignItems:"center",gap:8 }}>
        {icon && <span style={{fontSize:16}}>{icon}</span>}
        <h3 style={{ fontFamily:"'Rye',serif",color:C.red,fontSize:14,letterSpacing:2,textTransform:"uppercase" }}>{children}</h3>
      </div>
      <div style={{height:2,background:`repeating-linear-gradient(90deg,${C.gold} 0px,${C.gold} 6px,transparent 6px,transparent 10px)`,marginTop:4}} />
    </div>
  );
}

function Stamp({ text, color=C.red }) {
  return <div style={{display:"inline-block",border:`3px solid ${color}`,color,padding:"4px 10px",fontFamily:"'Oswald',sans-serif",fontSize:12,fontWeight:700,letterSpacing:3,textTransform:"uppercase",transform:"rotate(-8deg)",opacity:0.85,boxShadow:`0 0 0 1px ${color}`,textShadow:`0 0 8px ${color}`}}>{text}</div>;
}

function Badge({ text, variant="default" }) {
  const conf = {
    default:{bg:C.gold,color:C.ink,border:C.goldBright},
    red:{bg:C.red,color:C.cream,border:C.redLight},
    green:{bg:C.green,color:"#90e060",border:C.greenLight},
    dark:{bg:C.inkLight,color:C.cream,border:C.gold},
  }[variant]||{bg:C.gold,color:C.ink,border:C.goldBright};
  return <span style={{background:conf.bg,color:conf.color,border:`1px solid ${conf.border}`,padding:"2px 8px",fontFamily:"'Oswald',sans-serif",fontSize:10,fontWeight:600,letterSpacing:2,textTransform:"uppercase",clipPath:"polygon(4px 0%,calc(100% - 4px) 0%,100% 4px,100% calc(100% - 4px),calc(100% - 4px) 100%,4px 100%,0% calc(100% - 4px),0% 4px)"}}>{text}</span>;
}

function Empty() {
  return (
    <div style={{textAlign:"center",padding:"2.5rem 0"}}>
      <div style={{fontSize:32,marginBottom:8,opacity:0.4}}>📜</div>
      <p style={{fontFamily:"'Special Elite',cursive",color:C.inkFaint,fontSize:13,letterSpacing:2,textTransform:"uppercase"}}>— KAYIT BULUNAMADI —</p>
    </div>
  );
}

function SuspicionBar({ score }) {
  const color = score>=75?C.red:score>=50?C.gold:C.green;
  const label = score>=75?"YÜKSEK":score>=50?"ORTA":"DÜŞÜK";
  return (
    <div>
      <div style={{background:"rgba(0,0,0,0.3)",height:8,border:`1px solid ${C.inkLight}`,marginTop:6}}>
        <div style={{width:`${score}%`,height:"100%",background:`repeating-linear-gradient(90deg,${color} 0px,${color} 8px,rgba(0,0,0,0.2) 8px,rgba(0,0,0,0.2) 10px)`,transition:"width .8s ease",boxShadow:`0 0 6px ${color}`}} />
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
        <span style={{fontFamily:"'Oswald',sans-serif",fontSize:9,color:C.inkFaint,letterSpacing:1}}>ŞÜPHELİLİK</span>
        <span style={{fontFamily:"'Oswald',sans-serif",fontSize:9,color,letterSpacing:1,fontWeight:700}}>{label} — {score}%</span>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,margin:"0.75rem 0"}}>
      <div style={{flex:1,height:1,background:`linear-gradient(90deg,transparent,${C.inkFaint},transparent)`}} />
      <span style={{color:C.gold,fontSize:10}}>✦</span>
      <div style={{flex:1,height:1,background:`linear-gradient(90deg,transparent,${C.inkFaint},transparent)`}} />
    </div>
  );
}

// Shows all detected fields — helps identify correct field names from real data
function FieldDebug({ item }) {
  const fields = Object.entries(item).filter(([k,v]) => !k.startsWith("_") && v && String(v).trim());
  if (!fields.length) return null;
  return (
    <details style={{marginTop:8}}>
      <summary style={{fontFamily:"'Oswald',sans-serif",fontSize:9,color:C.inkFaint,letterSpacing:2,cursor:"pointer",textTransform:"uppercase",userSelect:"none"}}>
        🔍 Ham Alanlar ({fields.length})
      </summary>
      <div style={{marginTop:6,fontSize:11,fontFamily:"monospace",color:C.inkFaint,lineHeight:1.8,background:"rgba(0,0,0,0.06)",padding:"6px 8px"}}>
        {fields.map(([k,v]) => (
          <div key={k}><b style={{color:C.inkLight}}>{k}:</b> {String(v).slice(0,80)}</div>
        ))}
      </div>
    </details>
  );
}

// ── Map Component ─────────────────────────────────────────────────────────────
function InvestigationMap({ sightings, checkins, highlightedId, onSelectItem }) {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const markersRef = useRef({});
  const initDone = useRef(false);

  const mapItems = [
    ...sightings.map(s => ({...s, _type:"sighting"})),
    ...checkins.map(c  => ({...c, _type:"checkin"})),
  ];

  const buildIcon = useCallback((item, isSelected) => {
    if (!window.L) return null;
    const L = window.L;
    const isSighting = item._type === "sighting";
    const color = isSelected ? "#ffd060" : (isSighting ? "#8b1a00" : "#d4820a");
    const size = isSelected ? 32 : 24;
    return L.divIcon({
      className: "",
      html: `<div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid ${isSelected?"#fff":"rgba(0,0,0,0.5)"};box-shadow:${isSelected?"0 0 14px 4px rgba(255,200,0,0.8)":"2px 2px 6px rgba(0,0,0,0.6)"};cursor:pointer;"></div>`,
      iconSize: [size, size],
      iconAnchor: [size/2, size],
      popupAnchor: [0, -(size+4)],
    });
  }, []);

  useEffect(() => {
    if (!mapRef.current || initDone.current) return;
    initDone.current = true;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    script.onload = () => {
      const L = window.L;
      const map = L.map(mapRef.current, { center:[39.9334,32.8597], zoom:12 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:"© OpenStreetMap", className:"map-tiles",
      }).addTo(map);
      leafletMap.current = map;

      mapItems.forEach(item => {
        const coords = coordsOf(item);
        if (!coords) return;
        const icon = buildIcon(item, false);
        const person = personOf(item);
        const loc = locationOf(item);
        const cont = contentOf(item);
        const t = timeOf(item);
        const isSighting = item._type === "sighting";

        const marker = L.marker([coords.lat, coords.lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="min-width:160px">
              <div style="font-family:'Rye',serif;font-size:13px;color:#8b1a00;margin-bottom:4px">${isSighting?"📍 GÖRÜLME":"📌 CHECK-IN"}</div>
              ${person!=="—"?`<div style="font-weight:700;font-size:14px;margin-bottom:2px">${person}</div>`:""}
              <div style="font-size:12px;color:#4a2800">${loc}</div>
              ${t?`<div style="font-size:11px;color:#8a6030;margin-top:2px">⏱ ${t}</div>`:""}
              ${cont?`<div style="font-size:12px;margin-top:6px;padding-top:6px;border-top:1px dashed #c0a060;font-style:italic">${cont}</div>`:""}
            </div>
          `);
        marker.on("click", () => onSelectItem(item._id));
        markersRef.current[item._id] = { marker, item };
      });
    };
    document.head.appendChild(script);
  }, []);

  // Update markers when selection changes
  useEffect(() => {
    if (!window.L) return;
    Object.entries(markersRef.current).forEach(([id, { marker, item }]) => {
      const isSelected = id === highlightedId;
      marker.setIcon(buildIcon(item, isSelected));
      if (isSelected) {
        const coords = coordsOf(item);
        if (coords && leafletMap.current) {
          leafletMap.current.setView([coords.lat, coords.lng], 14, { animate:true });
          marker.openPopup();
        }
      }
    });
  }, [highlightedId, buildIcon]);

  const mappableCount = mapItems.filter(i => coordsOf(i)).length;

  return (
    <div style={{ position:"relative" }}>
      <div style={{position:"absolute",top:0,left:0,right:0,zIndex:10,pointerEvents:"none"}}>
        <WantedBanner>🗺 PODO'NUN İZİ — ANKARA HARİTASI</WantedBanner>
      </div>
      <div ref={mapRef} style={{width:"100%",height:420,border:`2px solid ${C.gold}`}} />
      {/* Legend */}
      <div style={{position:"absolute",bottom:16,right:16,zIndex:500,background:"rgba(26,15,0,0.9)",padding:"8px 12px",border:`1px solid ${C.gold}`,display:"flex",flexDirection:"column",gap:6}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:C.red}} />
          <span style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:C.cream,letterSpacing:1}}>GÖRÜLME</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:C.gold}} />
          <span style={{fontFamily:"'Oswald',sans-serif",fontSize:10,color:C.cream,letterSpacing:1}}>CHECK-IN</span>
        </div>
        <div style={{borderTop:`1px solid ${C.inkLight}`,paddingTop:4,marginTop:2}}>
          <span style={{fontFamily:"'Oswald',sans-serif",fontSize:9,color:C.inkFaint,letterSpacing:1}}>{mappableCount} KONUM</span>
        </div>
      </div>
    </div>
  );
}

// ── Map + List Tab ────────────────────────────────────────────────────────────
function MapAndList({ data, search }) {
  const [highlightedId, setHighlightedId] = useState(null);
  const listRefs = useRef({});

  const allItems = [
    ...data.sightings.map(s => ({...s, _type:"sighting"})),
    ...data.checkins.map(c  => ({...c, _type:"checkin"})),
  ].filter(item => !search || str(item).includes(search.toLowerCase()));

  const handleMapSelect = useCallback((id) => {
    setHighlightedId(id);
    setTimeout(() => {
      const el = listRefs.current[id];
      if (el) el.scrollIntoView({ behavior:"smooth", block:"center" });
    }, 150);
  }, []);

  const handleListSelect = useCallback((id) => {
    setHighlightedId(prev => prev === id ? null : id);
  }, []);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1.5rem"}} className="fade-in">
      <PaperCard nails style={{padding:0,overflow:"hidden"}}>
        <InvestigationMap
          sightings={data.sightings}
          checkins={data.checkins}
          highlightedId={highlightedId}
          onSelectItem={handleMapSelect}
        />
      </PaperCard>

      <div style={{textAlign:"center"}}>
        <span style={{fontFamily:"'Special Elite',cursive",color:C.inkFaint,fontSize:12,letterSpacing:2}}>
          ↕ Haritadaki bir işarete tıklayın — liste otomatik kaydırılır
        </span>
      </div>

      <PaperCard>
        <SecTitle icon="📋">Tüm Konumlar ({allItems.length})</SecTitle>
        {allItems.length === 0 && <Empty />}
        <div style={{display:"flex",flexDirection:"column",gap:"0.5rem",maxHeight:500,overflowY:"auto",paddingRight:4}}>
          {allItems.map((item) => {
            const isHL = highlightedId === item._id;
            const isSighting = item._type === "sighting";
            return (
              <div
                key={item._id}
                ref={el => listRefs.current[item._id] = el}
                className={`list-item-row${isHL?" highlighted":""}`}
                onClick={() => handleListSelect(item._id)}
                style={{
                  padding:"0.75rem 1rem",
                  border:`2px solid ${isHL?C.gold:"rgba(120,80,20,0.15)"}`,
                  borderLeft:`4px solid ${isSighting?C.red:C.gold}`,
                  background:isHL?"rgba(212,130,10,0.12)":"rgba(0,0,0,0.03)",
                  display:"flex",gap:"0.75rem",alignItems:"flex-start",
                }}
              >
                <div style={{fontSize:18,marginTop:2}}>{isSighting?"📍":"📌"}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:4}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      {personOf(item)!=="—" && <span style={{fontFamily:"'Rye',serif",color:C.ink,fontSize:14}}>{personOf(item)}</span>}
                      <span style={{fontFamily:"'Special Elite',cursive",color:C.inkFaint,fontSize:13}}>@ {locationOf(item)}</span>
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      {timeOf(item)&&<span style={{fontFamily:"'Oswald',sans-serif",color:C.inkFaint,fontSize:11,letterSpacing:1}}>{timeOf(item)}</span>}
                      <Badge text={isSighting?"Görülme":"Check-in"} variant={isSighting?"red":"dark"} />
                    </div>
                  </div>
                  {contentOf(item)&&<p style={{fontFamily:"'Special Elite',cursive",color:C.inkLight,fontSize:12,marginTop:4,lineHeight:1.5}}>» {contentOf(item)}</p>}
                  {isHL && <FieldDebug item={item} />}
                </div>
                {isHL && <div style={{width:4,background:C.goldLight,borderRadius:2,alignSelf:"stretch"}} />}
              </div>
            );
          })}
        </div>
      </PaperCard>
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
function Overview({ data, selectedPerson, onSelectPerson }) {
  const people = getPeople(data);
  const scores = people.map(p => ({name:p, score:suspicionScore(p, data)})).sort((a,b) => b.score-a.score).slice(0,8);
  const topSuspect = scores[0];
  const timeline = [
    ...data.checkins.map(c  => ({...c, _t:"checkin"})),
    ...data.sightings.map(s => ({...s, _t:"sighting"})),
  ].filter(e => !selectedPerson || str(e).includes(selectedPerson.toLowerCase()));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"2rem"}} className="fade-in">
      {topSuspect && (
        <div style={{position:"relative"}}>
          <div className="warning-stripe" />
          <PaperCard nails style={{borderColor:C.red,padding:"1.5rem"}}>
            <div style={{textAlign:"center",marginBottom:"1rem"}}><WantedBanner>★ WANTED ★</WantedBanner></div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
              <div style={{flex:1}}>
                <p style={{fontFamily:"'Rye',serif",color:C.red,fontSize:10,letterSpacing:4,textTransform:"uppercase",margin:"0 0 4px"}}>⚠ BİRİNCİ ŞÜPHELİ</p>
                <h2 style={{fontFamily:"'Rye',serif",color:C.ink,fontSize:28,textShadow:"2px 2px 0 rgba(0,0,0,0.15)",marginBottom:8}}>{topSuspect.name}</h2>
                <p style={{fontFamily:"'Special Elite',cursive",color:C.inkFaint,fontSize:13,margin:"4px 0"}}>
                  Şüphe Skoru: <span style={{color:C.red,fontWeight:700,fontSize:16}}>{topSuspect.score}%</span>
                </p>
                <SuspicionBar score={topSuspect.score} />
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
                <div style={{width:90,height:110,background:"linear-gradient(135deg,#d0b880,#b89860)",border:`3px solid ${C.inkLight}`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"3px 3px 8px rgba(0,0,0,0.4)",fontSize:40}}>🐾</div>
                <Stamp text="ŞÜPHELİ" />
              </div>
            </div>
          </PaperCard>
          <div className="warning-stripe" />
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1.5rem"}}>
        <PaperCard corner="DOSYA·A1">
          <SecTitle icon="🎯">Şüphe Skorları</SecTitle>
          {scores.length===0&&<Empty />}
          {scores.map(({name,score}) => (
            <div key={name} onClick={()=>onSelectPerson(selectedPerson===name?null:name)}
              style={{marginBottom:"1rem",padding:"0.6rem 0.75rem",cursor:"pointer",background:selectedPerson===name?"rgba(139,26,0,0.12)":"rgba(0,0,0,0.04)",border:selectedPerson===name?`2px solid ${C.red}`:"2px solid rgba(120,80,20,0.2)",borderRadius:1,transition:"all 0.2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontFamily:"'Special Elite',cursive",color:C.ink,fontSize:15}}>{name}</span>
                {selectedPerson===name&&<Badge text="SEÇİLİ" variant="red" />}
              </div>
              <SuspicionBar score={score} />
            </div>
          ))}
        </PaperCard>

        <PaperCard corner="DOSYA·B2">
          <SecTitle icon="👁">Podo'nun İzi</SecTitle>
          {data.sightings.length===0&&<Empty />}
          {data.sightings.slice(0,6).map((s,i) => (
            <div key={i}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <span style={{fontFamily:"'Special Elite',cursive",color:C.ink,fontSize:14}}>📍 {locationOf(s)}</span>
                  {contentOf(s)&&<p style={{fontFamily:"'Special Elite',cursive",color:C.inkFaint,fontSize:12,margin:"3px 0 0"}}>{contentOf(s)}</p>}
                </div>
                <span style={{fontFamily:"'Oswald',sans-serif",color:C.inkFaint,fontSize:11,letterSpacing:1}}>{timeOf(s)}</span>
              </div>
              {i<Math.min(data.sightings.length,6)-1&&<Divider />}
            </div>
          ))}
        </PaperCard>
      </div>

      <PaperCard corner="DOSYA·C3">
        <SecTitle icon="📅">Olay Kronolojisi {selectedPerson&&`— ${selectedPerson}`}</SecTitle>
        {timeline.length===0&&<Empty />}
        <div style={{position:"relative",paddingLeft:"2.5rem"}}>
          <div style={{position:"absolute",left:12,top:0,bottom:0,width:2,background:`repeating-linear-gradient(180deg,${C.gold} 0px,${C.gold} 8px,transparent 8px,transparent 14px)`}} />
          {timeline.map((e,i) => (
            <div key={i} style={{marginBottom:"1.25rem",position:"relative"}}>
              <div style={{position:"absolute",left:-30,top:2,width:12,height:12,background:e._t==="checkin"?C.gold:C.red,border:`2px solid ${C.ink}`,borderRadius:"50%",boxShadow:`0 0 6px ${e._t==="checkin"?C.gold:C.red}`}} />
              <div style={{display:"flex",gap:"1rem",alignItems:"flex-start",flexWrap:"wrap"}}>
                <span style={{fontFamily:"'Oswald',sans-serif",color:C.inkFaint,fontSize:11,letterSpacing:1,minWidth:38}}>{timeOf(e)}</span>
                <div style={{flex:1}}>
                  <span style={{fontFamily:"'Special Elite',cursive",color:C.ink,fontWeight:600,fontSize:15}}>{personOf(e)}</span>
                  <span style={{fontFamily:"'Special Elite',cursive",color:C.inkFaint,fontSize:13}}> — {locationOf(e)}</span>
                  {contentOf(e)&&<p style={{fontFamily:"'Special Elite',cursive",color:C.inkFaint,fontSize:12,margin:"3px 0 0"}}>{contentOf(e)}</p>}
                </div>
                <Badge text={e._t==="checkin"?"Check-in":"Görülme"} variant={e._t==="checkin"?"dark":"red"} />
              </div>
            </div>
          ))}
        </div>
      </PaperCard>
    </div>
  );
}

function Checkins({ data, search }) {
  const items = data.checkins.filter(c => str(c).includes(search.toLowerCase()));
  if (!items.length) return <Empty />;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}} className="fade-in">
      {items.map((c,i) => (
        <PaperCard key={i} corner={`#${String(i+1).padStart(3,"0")}`}>
          <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div>
              <span style={{fontFamily:"'Rye',serif",color:C.ink,fontSize:16}}>{personOf(c)}</span>
              <span style={{fontFamily:"'Special Elite',cursive",color:C.inkFaint,marginLeft:10,fontSize:13}}>@ {locationOf(c)}</span>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontFamily:"'Oswald',sans-serif",color:C.inkFaint,fontSize:11,letterSpacing:1}}>{timeOf(c)} {dateOf(c)}</span>
              <Badge text="Check-in" />
            </div>
          </div>
          {contentOf(c)&&<><Divider /><p style={{fontFamily:"'Special Elite',cursive",color:C.inkLight,fontSize:13}}>» {contentOf(c)}</p></>}
          <FieldDebug item={c} />
        </PaperCard>
      ))}
    </div>
  );
}

function Sightings({ data, search }) {
  const items = data.sightings.filter(s => str(s).includes(search.toLowerCase()));
  if (!items.length) return <Empty />;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}} className="fade-in">
      {items.map((s,i) => (
        <PaperCard key={i} corner={`#${String(i+1).padStart(3,"0")}`} style={{borderLeft:`4px solid ${C.red}`}}>
          <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <span style={{fontFamily:"'Rye',serif",color:C.red,fontSize:16}}>📍 {locationOf(s)}</span>
            <span style={{fontFamily:"'Oswald',sans-serif",color:C.inkFaint,fontSize:11,letterSpacing:1}}>{timeOf(s)} {dateOf(s)}</span>
          </div>
          {contentOf(s)&&<><Divider /><p style={{fontFamily:"'Special Elite',cursive",color:C.inkLight,fontSize:13}}>» {contentOf(s)}</p></>}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
            {personOf(s)!=="—"&&<Badge text={`Tanık: ${personOf(s)}`} variant="dark" />}
            <Badge text="Görülme" variant="red" />
          </div>
          <FieldDebug item={s} />
        </PaperCard>
      ))}
    </div>
  );
}

function Messages({ data, search }) {
  const items = data.messages.filter(m => str(m).includes(search.toLowerCase()));
  if (!items.length) return <Empty />;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}} className="fade-in">
      {items.map((m,i) => {
        const to = val(m,"to","alici","kime","recipient","receiver","kime_gonderildi");
        return (
          <PaperCard key={i} corner={`#${String(i+1).padStart(3,"0")}`}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:8}}>
              <div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,display:"flex",alignItems:"center",gap:8}}>
                <span style={{color:C.gold,fontWeight:700}}>{personOf(m)}</span>
                {to&&<><span style={{color:C.inkFaint,fontSize:18}}>→</span><span style={{color:C.ink,fontWeight:600}}>{to}</span></>}
              </div>
              <span style={{fontFamily:"'Oswald',sans-serif",color:C.inkFaint,fontSize:11,letterSpacing:1}}>{timeOf(m)}</span>
            </div>
            <Divider />
            {contentOf(m)&&<p style={{fontFamily:"'Special Elite',cursive",color:C.inkLight,fontSize:14,marginTop:10,lineHeight:1.7,fontStyle:"italic",paddingLeft:12,borderLeft:`3px solid ${C.gold}`}}>"{contentOf(m)}"</p>}
            <FieldDebug item={m} />
          </PaperCard>
        );
      })}
    </div>
  );
}

function Notes({ data }) {
  if (!data.personalNotes.length) return <Empty />;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}} className="fade-in">
      {data.personalNotes.map((n,i) => (
        <PaperCard key={i} corner={`NOT-${String(i+1).padStart(2,"0")}`}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontFamily:"'Rye',serif",color:C.gold,fontSize:15}}>{personOf(n)}</span>
            <span style={{fontFamily:"'Oswald',sans-serif",color:C.inkFaint,fontSize:11,letterSpacing:1}}>{dateOf(n)}</span>
          </div>
          <Divider />
          {contentOf(n)&&<p style={{fontFamily:"'Special Elite',cursive",color:C.inkLight,fontSize:14,marginTop:10,lineHeight:1.8}}>{contentOf(n)}</p>}
          <FieldDebug item={n} />
        </PaperCard>
      ))}
    </div>
  );
}

function Tips({ data }) {
  if (!data.anonymousTips.length) return <Empty />;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}} className="fade-in">
      {data.anonymousTips.map((t,i) => {
        const rel = val(t,"reliability","guvenilirlik","guveni","credibility");
        const isHigh = rel.toLowerCase().includes("yük")||rel.toLowerCase().includes("high");
        const isMed  = rel.toLowerCase().includes("ort")||rel.toLowerCase().includes("med");
        return (
          <PaperCard key={i} corner={`İPUCU-${String(i+1).padStart(2,"0")}`} style={{borderStyle:"dashed",borderColor:C.red,borderWidth:2}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:18}}>⚠️</span>
                {rel&&<Badge text={`Güvenilirlik: ${rel}`} variant={isHigh?"green":isMed?"default":"red"} />}
              </div>
              <span style={{fontFamily:"'Oswald',sans-serif",color:C.inkFaint,fontSize:11,letterSpacing:1}}>{timeOf(t)} {dateOf(t)}</span>
            </div>
            <Divider />
            {contentOf(t)&&<p style={{fontFamily:"'Special Elite',cursive",color:C.inkLight,fontSize:14,marginTop:10,lineHeight:1.7,fontStyle:"italic",paddingLeft:12,borderLeft:`3px solid ${C.red}`}}>"{contentOf(t)}"</p>}
            <FieldDebug item={t} />
          </PaperCard>
        );
      })}
    </div>
  );
}

function RawData({ data }) {
  const [open, setOpen] = useState(null);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}} className="fade-in">
      {Object.entries(data).map(([key, items]) => (
        <PaperCard key={key}>
          <div style={{display:"flex",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>setOpen(open===key?null:key)}>
            <span style={{fontFamily:"'Rye',serif",color:C.ink,fontSize:14}}>
              {key} <span style={{fontFamily:"'Oswald',sans-serif",color:C.inkFaint,fontSize:12,fontWeight:400}}>({items.length} kayıt)</span>
            </span>
            <span style={{color:C.gold,fontFamily:"monospace"}}>{open===key?"▲":"▼"}</span>
          </div>
          {open===key&&(
            <>
              <Divider />
              {items.length>0
                ? <pre style={{fontFamily:"monospace",fontSize:11,color:C.inkLight,overflow:"auto",maxHeight:400,background:"rgba(0,0,0,0.06)",padding:"1rem",border:`1px solid rgba(120,80,20,0.2)`,marginTop:8}}>
                    {JSON.stringify(items[0]._raw||items[0], null, 2)}
                  </pre>
                : <Empty />}
            </>
          )}
        </PaperCard>
      ))}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = [
  {id:"Özet",     label:"📋 ÖZET"},
  {id:"Harita",   label:"🗺 HARİTA"},
  {id:"Checkin",  label:"📌 CHECK-IN"},
  {id:"Görülme",  label:"👁 GÖRÜLME"},
  {id:"Mesajlar", label:"✉ MESAJLAR"},
  {id:"Notlar",   label:"🗒 NOTLAR"},
  {id:"İpuçları", label:"⚠ İPUÇLARI"},
  {id:"Ham Veri", label:"⚙ HAM VERİ"},
];

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,setTab]           = useState("Özet");
  const [search,setSearch]     = useState("");
  const [selected,setSelected] = useState(null);
  const [loading,setLoading]   = useState(true);
  const [error,setError]       = useState(null);
  const [data,setData]         = useState(null);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = globalStyle;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [checkins,messages,sightings,personalNotes,anonymousTips] = await Promise.all(
          Object.values(FORM_IDS).map(fetchForm)
        );
        setData({
          checkins:      checkins.map(parseAnswers),
          messages:      messages.map(parseAnswers),
          sightings:     sightings.map(parseAnswers),
          personalNotes: personalNotes.map(parseAnswers),
          anonymousTips: anonymousTips.map(parseAnswers),
        });
      } catch(e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:64,marginBottom:16,animation:"flicker 3s infinite"}}>🔍</div>
        <p style={{fontFamily:"'Rye',serif",color:C.gold,fontSize:18,letterSpacing:4,textTransform:"uppercase"}}>DOSYA YÜKLENİYOR...</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <PaperCard style={{maxWidth:400,textAlign:"center",padding:"2rem"}} nails>
        <p style={{fontFamily:"'Rye',serif",color:C.red,fontSize:16,marginBottom:12}}>BAĞLANTI HATASI</p>
        <p style={{fontFamily:"'Special Elite',cursive",color:C.inkFaint,fontSize:13,marginBottom:16}}>{error}</p>
        <button className="wanted-btn" onClick={()=>window.location.reload()}>TEKRAR DENE</button>
      </PaperCard>
    </div>
  );

  const total = Object.values(data).reduce((s,a) => s+a.length, 0);

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.ink}}>
      <div className="wood-panel" style={{padding:"1.5rem 2rem"}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
            <div>
              <p style={{fontFamily:"'Oswald',sans-serif",color:C.gold,fontSize:10,letterSpacing:4,textTransform:"uppercase",margin:"0 0 6px",opacity:0.8}}>
                <span className="rivet" /> GİZLİ · ANKARA POLİS DOSYASI · 2026 <span className="rivet" />
              </p>
              <h1 style={{fontFamily:"'Rye',serif",color:C.cream,fontSize:26,letterSpacing:2,textShadow:`2px 2px 0 rgba(0,0,0,0.5),0 0 20px rgba(212,130,10,0.3)`,margin:"0 0 6px",animation:"flicker 8s infinite"}}>
                🐾 Missing Podo: The Ankara Case
              </h1>
              <p style={{fontFamily:"'Special Elite',cursive",color:C.inkFaint,fontSize:13}}>
                Soruşturma Panosu — {total} kayıt inceleniyor
              </p>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8,alignItems:"flex-end"}}>
              <Stamp text="GİZLİ" />
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
                <Badge text={`${data.checkins.length} Check-in`} />
                <Badge text={`${data.sightings.length} Görülme`} variant="red" />
                <Badge text={`${data.messages.length} Mesaj`} variant="dark" />
                <Badge text={`${data.anonymousTips.length} İpucu`} variant="red" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="warning-stripe" />

      <div style={{background:"linear-gradient(180deg,#2a1400,#1e0e00)",borderBottom:`2px solid ${C.gold}`,overflowX:"auto"}}>
        <div style={{maxWidth:1100,margin:"0 auto",padding:"0 2rem",display:"flex",alignItems:"center",minWidth:"max-content"}}>
          {TABS.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={`wanted-btn${tab===t.id?" active":""}`}
              style={{margin:"6px 3px",borderRadius:0}}>
              {t.label}
            </button>
          ))}
          <div style={{marginLeft:"auto",paddingLeft:"1rem"}}>
            <input placeholder="[ ARA... ]" value={search} onChange={e=>setSearch(e.target.value)} className="search-input" />
          </div>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"2rem auto",padding:"0 2rem 4rem"}}>
        {tab==="Özet"     && <Overview   data={data} selectedPerson={selected} onSelectPerson={setSelected} />}
        {tab==="Harita"   && <MapAndList data={data} search={search} />}
        {tab==="Checkin"  && <Checkins   data={data} search={search} />}
        {tab==="Görülme"  && <Sightings  data={data} search={search} />}
        {tab==="Mesajlar" && <Messages   data={data} search={search} />}
        {tab==="Notlar"   && <Notes      data={data} />}
        {tab==="İpuçları" && <Tips       data={data} />}
        {tab==="Ham Veri" && <RawData    data={data} />}
      </div>

      <div className="warning-stripe" />
      <div className="wood-panel" style={{padding:"0.75rem 2rem",textAlign:"center"}}>
        <p style={{fontFamily:"'Oswald',sans-serif",color:C.inkFaint,fontSize:10,letterSpacing:3,textTransform:"uppercase"}}>
          <span className="rivet" /> ANKARA PD · GİZLİ DOSYA · 2026 <span className="rivet" />
        </p>
      </div>
    </div>
  );
}