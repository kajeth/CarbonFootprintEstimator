import React, { useEffect, useMemo, useState } from "react";

// --- Starter emission factors (placeholders). Replace with curated values from Poore/Our World in Data.
const emissionFactors = {
  beef: { label: "Beef (avg)", co2_per_kg: 60, category: "meat" },
  lamb: { label: "Lamb", co2_per_kg: 24, category: "meat" },
  pork: { label: "Pork", co2_per_kg: 12, category: "meat" },
  chicken: { label: "Chicken", co2_per_kg: 6.9, category: "meat" },
  cheese: { label: "Cheese", co2_per_kg: 21, category: "dairy" },
  milk: { label: "Milk", co2_per_kg: 1.9, category: "dairy" },
  eggs: { label: "Eggs", co2_per_kg: 4.5, category: "dairy" },
  rice: { label: "Rice", co2_per_kg: 2.7, category: "grains" },
  pasta: { label: "Pasta", co2_per_kg: 1.1, category: "grains" },
  bread: { label: "Bread", co2_per_kg: 1.3, category: "grains" },
  potatoes: { label: "Potatoes", co2_per_kg: 0.3, category: "produce" },
  tomato: { label: "Tomato", co2_per_kg: 1.2, category: "produce" },
  lettuce: { label: "Lettuce", co2_per_kg: 0.5, category: "produce" },
  apple: { label: "Apple", co2_per_kg: 0.4, category: "produce" },
  banana: { label: "Banana", co2_per_kg: 0.8, category: "produce" },
  avocado: { label: "Avocado", co2_per_kg: 2.5, category: "produce" },
  salmon: { label: "Salmon", co2_per_kg: 11.9, category: "fish" },
  tuna: { label: "Tuna", co2_per_kg: 6.1, category: "fish" },
  shrimp: { label: "Shrimp", co2_per_kg: 12.5, category: "fish" },
  tofu: { label: "Tofu", co2_per_kg: 2.0, category: "protein" },
  beans: { label: "Beans (dried)", co2_per_kg: 2.0, category: "protein" },
  yogurt: { label: "Yogurt", co2_per_kg: 2.2, category: "dairy" },
  butter: { label: "Butter", co2_per_kg: 12.0, category: "dairy" },
  olive_oil: { label: "Olive oil", co2_per_kg: 6.0, category: "condiment" },
  coffee: { label: "Coffee (beans)", co2_per_kg: 16.5, category: "drinks" },
  sugar: { label: "Sugar", co2_per_kg: 2.8, category: "pantry" },
  almond_milk: { label: "Almond milk", co2_per_kg: 2.4, category: "dairy_alternative" },
  chocolate: { label: "Chocolate", co2_per_kg: 18, category: "treats" }
};

// Common "per piece" weights (kg)
const pieceWeights = {
  apple: 0.18,
  banana: 0.12,
  egg: 0.05,
  tomato: 0.12,
  avocado: 0.2
};

// --- Helper utilities
const round = (v, d = 2) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

function toKg(quantity, unit = "kg", name = "") {
  if (quantity == null || isNaN(quantity)) return 0;
  const u = (unit || "").toLowerCase();
  if (u === "kg" || u === "kilogram" || u === "kilograms") return quantity;
  if (u === "g" || u === "gram" || u === "grams") return quantity / 1000;
  if (u === "lb" || u === "lbs" || u === "pound" || u === "pounds") return quantity * 0.45359237;
  if (u === "oz" || u === "ounce" || u === "ounces") return quantity * 0.0283495231;
  if (u === "l" || u === "ltr" || u === "litre" || u === "liter") {
    // rough assumption: liquids ~ water density
    return quantity * 1.0;
  }
  if (u === "ml" || u === "milliliter") return (quantity / 1000) * 1.0;
  if (u === "piece" || u === "pc" || u === "pcs" || u === "item") {
    const key = name.toLowerCase();
    for (const k of Object.keys(pieceWeights)) {
      if (key.includes(k)) return quantity * pieceWeights[k];
    }
    // default per-piece fallback
    return quantity * 0.2;
  }
  // unknown unit -> assume it's pieces
  return quantity * 0.2;
}

function findEmissionFactorByName(name, custom = {}) {
  if (!name) return null;
  const n = name.toLowerCase();
  // custom overrides first
  for (const k of Object.keys(custom)) {
    if (n.includes(k) || custom[k].label.toLowerCase().includes(n)) return { key: k, ...custom[k] };
  }
  // then built-in factors
  for (const k of Object.keys(emissionFactors)) {
    const f = emissionFactors[k];
    if (n === k || n.includes(k) || f.label.toLowerCase().includes(n)) return { key: k, ...f };
  }
  // try substring match across labels
  for (const k of Object.keys(emissionFactors)) {
    const f = emissionFactors[k];
    if (f.label.toLowerCase().split(/\W+/).some(tok => tok && n.includes(tok))) return { key: k, ...f };
  }
  return null;
}

function parseLine(line) {
  const raw = line.trim();
  if (!raw) return null;
  const original = raw;
  let kg = null;
  let unit = null;
  let qty = null;
  let name = raw;

  // Pattern A: e.g. "2 x 500g chicken breast" or "2x500g chicken"
  const pA = raw.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(kg|g|lb|lbs|oz)?/i);
  if (pA) {
    const count = parseFloat(pA[1]);
    const size = parseFloat(pA[2]);
    const u = pA[3] || "g";
    kg = toKg(count * size, u);
    unit = u;
    name = raw.replace(pA[0], "").trim();
  } else {
    // Pattern B: direct quantity and unit e.g. "1 kg beef" or "500 g rice"
    const pB = raw.match(/(\d+(?:\.\d+)?)\s*(kg|g|lb|lbs|oz|l|ml)\b/i);
    if (pB) {
      qty = parseFloat(pB[1]);
      unit = pB[2];
      kg = toKg(qty, unit);
      name = raw.replace(pB[0], "").trim();
    } else {
      // Pattern C: number + (optional) descriptor -> treat as pieces
      const pC = raw.match(/(\d+(?:\.\d+)?)(?:\s*)(pcs|pieces|piece|pc|eggs?|bunch|pack|packs|pk)\b/i);
      if (pC) {
        qty = parseFloat(pC[1]);
        unit = "piece";
        kg = toKg(qty, unit, raw);
        name = raw.replace(pC[0], "").trim();
      } else {
        // Pattern D: starts with a single number -> likely pieces
        const pD = raw.match(/^(\d+(?:\.\d+)?)(?:\s+)(.+)$/i);
        if (pD) {
          qty = parseFloat(pD[1]);
          unit = "piece";
          name = pD[2].trim();
          kg = toKg(qty, unit, name);
        } else {
          // No quantity detected: default to 1 piece of whatever it is
          qty = 1;
          unit = "piece";
          kg = toKg(1, "piece", raw);
          name = raw;
        }
      }
    }
  }

  // sanitize name
  name = name.replace(/^of\s+/i, "").replace(/^[x×]\s*/i, "").trim();
  // final fallback
  if (kg == null) kg = toKg(qty || 1, unit || "piece", name);

  return { original, name, qty: qty == null ? undefined : qty, unit: unit || "piece", kg: round(kg, 3) };
}

// --- React component
export default function App() {
  const [paste, setPaste] = useState("2 x 500g chicken breast\n1 kg potatoes\n3 apples\n250g cheese");
  const [list, setList] = useState([]);
  const [customFactors, setCustomFactors] = useState({});

  // CSS injection (single-file starter)
  useEffect(() => {
    const css = `
      :root{ --bg:#0f172a; --card:#0b1220; --accent:#22c55e; --muted:#94a3b8; }
      *{ box-sizing:border-box }
      body{ font-family:Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; background:linear-gradient(180deg,#071029, #0b1220); color:#e6eef8; padding:24px }
      .container{ max-width:980px; margin:0 auto }
      .card{ background: rgba(255,255,255,0.03); border-radius:12px; padding:16px; margin-bottom:16px; box-shadow: 0 6px 18px rgba(2,6,23,0.6) }
      textarea{ width:100%; min-height:120px; background:transparent; border:1px dashed rgba(255,255,255,0.06); padding:12px; color:inherit; border-radius:8px }
      button{ background:var(--accent); color:#022; padding:8px 12px; border-radius:8px; border:none; font-weight:600; cursor:pointer }
      table{ width:100%; border-collapse:collapse; margin-top:12px }
      th,td{ text-align:left; padding:8px; border-bottom:1px solid rgba(255,255,255,0.03); font-size:14px }
      .muted{ color:var(--muted); font-size:13px }
      .bar{ height:18px; background:linear-gradient(90deg, rgba(34,197,94,0.85), rgba(34,197,94,0.45)); border-radius:10px }
      .small{ font-size:13px }
      .pill{ background:rgba(255,255,255,0.03); padding:6px 8px; border-radius:999px; margin-right:8px }
      .flex{ display:flex; gap:12px; align-items:center }
      .row{ display:flex; gap:10px }
      .col{ display:flex; flex-direction:column; gap:8px }
    `;
    const style = document.createElement("style");
    style.innerHTML = css;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const addParsed = () => {
    const lines = paste.split("\n").map(l => l.trim()).filter(Boolean);
    const parsed = lines.map(parseLine).filter(Boolean);
    setList(prev => [...prev, ...parsed]);
    setPaste("");
  };

  const removeIndex = (i) => setList(prev => prev.filter((_, idx) => idx !== i));

  const clearList = () => setList([]);

  const setCustomFactorFor = (key, label, co2, category) => {
    setCustomFactors(prev => ({ ...prev, [key]: { label: label || key, co2_per_kg: Number(co2), category: category || "other" } }));
  };

  const computed = useMemo(() => {
    let total = 0;
    const breakdown = {};
    const details = list.map(item => {
      const found = findEmissionFactorByName(item.name, customFactors);
      const ef = found ? found : null;
      const co2 = ef ? ef.co2_per_kg * item.kg : null;
      if (co2 != null) {
        total += co2;
        breakdown[ef.category] = (breakdown[ef.category] || 0) + co2;
      } else {
        breakdown.unknown = (breakdown.unknown || 0) + 0;
      }
      return { ...item, ef, co2: co2 == null ? null : round(co2, 2) };
    });
    return { total: round(total, 2), breakdown, details };
  }, [list, customFactors]);

  const topEmitters = useMemo(() => {
    return [...computed.details].filter(d => d.co2).sort((a, b) => (b.co2 || 0) - (a.co2 || 0)).slice(0, 4);
  }, [computed]);

  function suggestSwap(item) {
    if (!item || !item.ef) return null;
    const cat = item.ef.category;
    const candidates = Object.keys(emissionFactors)
      .map(k => ({ key: k, ...emissionFactors[k] }))
      .filter(x => x.category === cat && x.co2_per_kg < item.ef.co2_per_kg)
      .sort((a, b) => a.co2_per_kg - b.co2_per_kg);
    return candidates.length ? candidates[0] : null;
  }

  function editEFForRow(i) {
    const row = list[i];
    const key = row.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const current = findEmissionFactorByName(row.name, customFactors);
    const label = window.prompt("Label for this item:", current ? current.label : row.name);
    const co2 = window.prompt("Enter CO2e per kg (numeric) for this item:", current ? current.co2_per_kg : "");
    const category = window.prompt("Category (meat/dairy/produce/grains/protein/other):", current ? current.category : "other");
    if (!co2) return;
    setCustomFactorFor(key, label || row.name, Number(co2), category || "other");
  }

  return (
    <div className="container">
      <h1 style={{ marginBottom: 8 }}>🌱 Carbon Footprint — Grocery List Estimator</h1>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ maxWidth: 680 }}>
            <div className="muted small">Paste your grocery list (one item per line). Examples:</div>
            <div className="muted small">"2 x 500g chicken breast" or "1 kg potatoes" or "3 apples"</div>
            <textarea value={paste} onChange={e => setPaste(e.target.value)} placeholder="1 kg beef\n2 x 500g chicken breast\n3 apples" />
            <div style={{ marginTop: 10 }} className="flex">
              <button onClick={addParsed}>Parse & Add Items</button>
              <button onClick={() => { setPaste('2 x 500g chicken breast\n1 kg potatoes\n3 apples\n250g cheese'); }}>Load example</button>
              <button onClick={clearList} style={{ background: 'rgba(255,255,255,0.06)' }}>Clear list</button>
            </div>
          </div>
          <div style={{ width: 260 }}>
            <div className="pill">Items: {list.length}</div>
            <div className="pill">Total CO₂e (kg): <strong style={{ marginLeft: 6 }}>{computed.total}</strong></div>
            <div style={{ marginTop: 8 }} className="muted small">Tip: click "Edit EF" on a row to set a custom emission factor for unknown items.</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Items</h3>
        {list.length === 0 ? (
          <div className="muted">No items yet — parse a list or add items manually.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>kg</th>
                <th>EF</th>
                <th>kg CO₂e</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {computed.details.map((d, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{d.name}</div>
                    <div className="muted small">{d.original}</div>
                  </td>
                  <td>{d.qty ?? "—"} {d.unit}</td>
                  <td>{d.kg}</td>
                  <td className="small">{d.ef ? `${d.ef.label} (${d.ef.co2_per_kg} kgCO₂e/kg)` : <span className="muted">unknown</span>}</td>
                  <td>{d.co2 ?? <span className="muted">—</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={() => removeIndex(i)} style={{ marginRight: 8, background: 'rgba(255,255,255,0.06)' }}>Remove</button>
                    <button onClick={() => editEFForRow(i)} style={{ background: 'rgba(255,255,255,0.03)' }}>Edit EF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Breakdown by category</h3>
        {Object.keys(computed.breakdown).length === 0 ? (
          <div className="muted">No data to show</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {Object.entries(computed.breakdown).map(([cat, val]) => (
              <div key={cat} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ minWidth: 90, textTransform: 'capitalize' }} className="small">{cat}</div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: 6, borderRadius: 8 }}>
                  <div className="bar" style={{ width: computed.total ? `${(val / computed.total) * 100}%` : '0%' }} />
                </div>
                <div style={{ minWidth: 80, textAlign: 'right', fontWeight: 600 }}>{round(val,2)} kg</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Top emitters & quick swaps</h3>
        {topEmitters.length === 0 ? (
          <div className="muted">No high emitters yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {topEmitters.map((t, idx) => {
              const swap = suggestSwap(t);
              return (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{t.name}</div>
                    <div className="muted small">{t.ef ? `${t.ef.label} — ${t.ef.co2_per_kg} kgCO₂e/kg` : 'unknown'}</div>
                    <div className="muted small">Emissions: <strong>{t.co2 ?? '—'} kgCO₂e</strong></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {swap ? (
                      <div>
                        <div className="muted small">Suggestion:</div>
                        <div style={{ fontWeight: 800 }}>{swap.label}</div>
                        <div className="muted small">{swap.co2_per_kg} kgCO₂e/kg</div>
                      </div>
                    ) : (
                      <div className="muted small">No lower-footprint swap found in same category</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card muted small">
        Data in this starter is for demo purposes. Replace the `emissionFactors` object with curated values and cite your sources (e.g., Poore & Nemecek, Our World in Data, government GHG conversion tables, or Open Food Facts for product lookups).
      </div>
    </div>
  );
}
