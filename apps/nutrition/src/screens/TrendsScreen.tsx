import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Shell } from "../components/Shell.js";
import { api, userTimezone } from "../lib/api.js";
import { CORE_DISPLAY_NUTRIENTS, NUTRIENT_META, formatNutrient } from "@diabetes-companion/food-engine";

const RANGES = ["7d", "30d", "90d", "365d", "all"] as const;

export function TrendsScreen() {
  const [range, setRange] = useState<(typeof RANGES)[number]>("7d");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    void api.summary(range, userTimezone()).then(setData);
    void api.track("trend_viewed");
  }, [range]);
  const averages = (data?.averages as { onLoggedDays: Record<string, number | null>; onCompleteDays: Record<string, number | null> | null } | undefined)?.onLoggedDays;
  const coverage = data?.coverage as { note: string; loggedDays: number; calendarDays: number; completeDays: number } | undefined;
  const patterns = (data?.patterns as Array<{ text: string }>) ?? [];
  const days = (data?.days as Array<{ localDate: string; logged: boolean; totals: Record<string, number | null> }>) ?? [];
  return (
    <Shell title="Trends">
      <div className="range-tabs">
        {RANGES.map((item) => (
          <button key={item} type="button" className={item === range ? "active" : ""} onClick={() => setRange(item)}>
            {item === "all" ? "All time" : item}
          </button>
        ))}
      </div>
      {coverage ? <div className="banner">{coverage.note}</div> : null}
      <div className="macro-grid">
        {CORE_DISPLAY_NUTRIENTS.map((key) => {
          const meta = NUTRIENT_META.find((item) => item.key === key)!;
          return (
            <Link key={key} to={`/trends/${key}?range=${range}`} className="macro" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="macro__label">{meta.label} avg</div>
              <div className="macro__value">{formatNutrient(averages?.[key] ?? null, meta.unit)}</div>
            </Link>
          );
        })}
      </div>
      <div className="card">
        <h3>Logged days</h3>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {days.map((day) => (
            <span key={day.localDate} title={day.localDate} style={{ width: 12, height: 12, borderRadius: 2, background: day.logged ? "var(--signal)" : "var(--ink-500)" }} />
          ))}
        </div>
      </div>
      {patterns.map((pattern) => <p key={pattern.text}>{pattern.text}</p>)}
    </Shell>
  );
}

export function NutrientDetailScreen() {
  const { key = "proteinG" } = useParams();
  const range = new URLSearchParams(window.location.search).get("range") ?? "30d";
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    void api.nutrient(key, range, userTimezone()).then(setData);
  }, [key, range]);
  const meta = NUTRIENT_META.find((item) => item.key === key);
  const sources = (data?.sources as Array<{ label: string; amount: number; percent: number }>) ?? [];
  const days = (data?.days as Array<{ date: string; value: number | null; logged: boolean }>) ?? [];
  const max = Math.max(...days.map((day) => day.value ?? 0), 1);
  return (
    <Shell title={meta?.label ?? key}>
      <p className="muted">{(data?.coverage as { note?: string } | undefined)?.note}</p>
      {days.slice(-14).map((day) => (
        <div className="bar-row" key={day.date}>
          <span>{day.date.slice(5)}</span>
          <div className="track"><span style={{ width: day.logged ? `${((day.value ?? 0) / max) * 100}%` : "0%" }} /></div>
          <span>{day.logged ? formatNutrient(day.value, meta?.unit) : "—"}</span>
        </div>
      ))}
      <div className="card">
        <h3>Top sources</h3>
        {sources.length === 0 ? <p className="muted">Not enough logged foods yet.</p> : null}
        {sources.map((row) => (
          <div className="bar-row" key={row.label}>
            <span>{row.label}</span>
            <div className="track"><span style={{ width: `${row.percent}%` }} /></div>
            <span>{row.percent}%</span>
          </div>
        ))}
      </div>
    </Shell>
  );
}
