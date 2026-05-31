import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Leaf,
  Calendar,
  Car,
  UtensilsCrossed,
  Zap,
  CheckCircle2,
  TreePine,
  Flame,
  AlertCircle,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const API_URL = "https://ecosnap-api-3zt5.onrender.com";
const SESSION_KEY = "ecosnap_session_id";

type View = "landing" | "input" | "results";

type Inputs = {
  car_km: number;
  bus_km: number;
  train_km: number;
  flight_hours: number;
  meat_meals: number;
  vegetarian_meals: number;
  vegan_meals: number;
  electricity_kwh: number;
};

type ApiResult = {
  total_kg: number;
  breakdown: Record<string, number>;
  tips: string[];
  trees_equivalent: number;
  vs_global_average: string;
  streak_count: number;
  badge: string;
};

const emptyInputs: Inputs = {
  car_km: 0,
  bus_km: 0,
  train_km: 0,
  flight_hours: 0,
  meat_meals: 0,
  vegetarian_meals: 0,
  vegan_meals: 0,
  electricity_kwh: 0,
};

const LOADING_MESSAGES = [
  "Waking up the server...",
  "Crunching the numbers...",
  "Getting your AI tips...",
  "Almost there...",
];

const CHART_COLORS = ["#4A7C59", "#6B9B7A", "#E8A838", "#C98A2E", "#9BBFA8", "#D4B896"];

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 1400;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span>{display.toFixed(1)}</span>;
}

function NumberField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-foreground mb-1.5">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.1"
        value={value === 0 ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)))}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15"
      />
    </label>
  );
}

function SectionCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      <div className="mb-5 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-primary">
          {icon}
        </div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">{label}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function FadeView({ keyName, children }: { keyName: string; children: React.ReactNode }) {
  return (
    <div key={keyName} className="animate-in fade-in duration-500">
      {children}
    </div>
  );
}

export default function EcoSnap() {
  const [view, setView] = useState<View>("landing");
  const [inputs, setInputs] = useState<Inputs>(emptyInputs);
  const [loading, setLoading] = useState(false);
  const [loadingIdx, setLoadingIdx] = useState(0);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneTips, setDoneTips] = useState<Record<number, boolean>>({});
  const lastRequest = useRef<Inputs | null>(null);

  useEffect(() => {
    getSessionId();
  }, []);

  useEffect(() => {
    if (!loading) return;
    setLoadingIdx(0);
    const id = setInterval(() => {
      setLoadingIdx((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(id);
  }, [loading]);

  const setField = (k: keyof Inputs) => (v: number) =>
    setInputs((prev) => ({ ...prev, [k]: v }));

  async function submit(data: Inputs) {
    setLoading(true);
    setError(null);
    lastRequest.current = data;
    try {
      const body: Record<string, number | string> = { session_id: getSessionId() };
      (Object.keys(data) as (keyof Inputs)[]).forEach((k) => {
        if (data[k] !== 0) body[k] = data[k];
        else body[k] = 0;
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);
      const res = await fetch(`${API_URL}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResult = await res.json();
      setResult(json);
      setDoneTips({});
      setView("results");
    } catch (e) {
      console.error(e);
      setError("Something went wrong. The server might be waking up — please try again in 30 seconds.");
    } finally {
      setLoading(false);
    }
  }

  const chartData = useMemo(() => {
    if (!result?.breakdown) return [];
    return Object.entries(result.breakdown)
      .filter(([, v]) => typeof v === "number" && v > 0)
      .map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " "),
        value: Number((value as number).toFixed(2)),
      }));
  }, [result]);

  const pillTone = useMemo(() => {
    const t = result?.vs_global_average ?? "";
    if (/below/i.test(t)) return "bg-primary/10 text-primary";
    if (/above/i.test(t)) return "bg-accent/15 text-accent-foreground";
    return "bg-secondary text-muted-foreground";
  }, [result]);

  return (
    <main className="min-h-screen bg-background text-foreground" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="mx-auto max-w-2xl px-5 py-12 sm:py-20">
        {view === "landing" && (
          <FadeView keyName="landing">
            <div className="flex flex-col items-center text-center pt-8 sm:pt-16">
              <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Leaf className="h-7 w-7 text-primary" strokeWidth={2.25} />
              </div>
              <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-foreground">EcoSnap</h1>
              <p className="mt-5 text-lg sm:text-xl text-muted-foreground max-w-md">
                Know your carbon. Change your world.
              </p>
              <p className="mt-3 text-sm text-muted-foreground max-w-sm">
                Log your day in 2 minutes and get personalized AI tips to live lighter.
              </p>
              <button
                onClick={() => setView("input")}
                className="mt-12 w-full max-w-xs rounded-full bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-[0_2px_12px_rgba(74,124,89,0.25)] transition-all hover:bg-primary/90 hover:shadow-[0_4px_18px_rgba(74,124,89,0.32)] active:scale-[0.98]"
              >
                <span className="inline-flex items-center gap-1">Start Tracking <ArrowRight className="h-4 w-4" /></span>
              </button>
              <p className="mt-6 text-xs text-muted-foreground">
                Free. No account needed. Takes 2 minutes.
              </p>
            </div>
          </FadeView>
        )}

        {view === "input" && (
          <FadeView keyName="input">
            <header className="mb-8">
              <div className="flex items-center gap-2 text-foreground">
                <Calendar className="h-5 w-5 text-primary" />
                <h2 className="text-3xl font-bold tracking-tight">Log Your Day</h2>
              </div>
              <p className="mt-2 text-muted-foreground">What did you do today?</p>
            </header>

            <div className="space-y-4">
              <SectionCard icon={<Car className="h-4 w-4" />} label="Transport">
                <NumberField label="Car" placeholder="km driven" value={inputs.car_km} onChange={setField("car_km")} />
                <NumberField label="Bus" placeholder="km traveled" value={inputs.bus_km} onChange={setField("bus_km")} />
                <NumberField label="Train" placeholder="km traveled" value={inputs.train_km} onChange={setField("train_km")} />
                <NumberField label="Flight" placeholder="hours in air" value={inputs.flight_hours} onChange={setField("flight_hours")} />
              </SectionCard>

              <SectionCard icon={<UtensilsCrossed className="h-4 w-4" />} label="Food">
                <NumberField label="Meat meals" placeholder="count" value={inputs.meat_meals} onChange={setField("meat_meals")} />
                <NumberField label="Vegetarian meals" placeholder="count" value={inputs.vegetarian_meals} onChange={setField("vegetarian_meals")} />
                <NumberField label="Vegan meals" placeholder="count" value={inputs.vegan_meals} onChange={setField("vegan_meals")} />
              </SectionCard>

              <SectionCard icon={<Zap className="h-4 w-4" />} label="Energy">
                <NumberField label="Electricity used" placeholder="kWh" value={inputs.electricity_kwh} onChange={setField("electricity_kwh")} />
              </SectionCard>

              {error && (
                <div className="flex items-start gap-3 rounded-2xl bg-accent/10 p-5 text-sm text-foreground">
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
                  <div className="flex-1">
                    <p>{error}</p>
                    <button
                      onClick={() => lastRequest.current && submit(lastRequest.current)}
                      className="mt-3 rounded-full border border-foreground/20 px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/5"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-2">
                {loading ? (
                  <div className="flex items-center justify-center gap-3 rounded-full bg-primary/10 px-8 py-4 text-primary">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                    </span>
                    <span className="text-sm font-medium transition-opacity">{LOADING_MESSAGES[loadingIdx]}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => submit(inputs)}
                    className="w-full rounded-full bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-[0_2px_12px_rgba(74,124,89,0.25)] transition-all hover:bg-primary/90 hover:shadow-[0_4px_18px_rgba(74,124,89,0.32)] active:scale-[0.99]"
                  >
                    <span className="inline-flex items-center gap-1">Calculate My Footprint <ArrowRight className="h-4 w-4" /></span>
                  </button>
                )}
              </div>
            </div>
          </FadeView>
        )}

        {view === "results" && result && (
          <FadeView keyName="results">
            <div className="mx-auto max-w-lg space-y-4">
              {/* Hero stat */}
              <div className="rounded-2xl bg-card p-8 text-center shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                <div className="text-6xl font-extrabold tracking-tight text-foreground">
                  <AnimatedNumber value={result.total_kg} />
                </div>
                <p className="mt-2 text-sm font-medium text-muted-foreground">kg CO₂ today</p>
                <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
                  <Leaf className="h-3.5 w-3.5" />
                  {result.badge}
                </div>
                {result.vs_global_average && (
                  <div className="mt-3">
                    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${pillTone}`}>
                      {result.vs_global_average}
                    </span>
                  </div>
                )}
              </div>

              {/* Breakdown */}
              {chartData.length > 0 && (
                <div className="rounded-2xl bg-card p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                  <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-foreground">
                    Breakdown
                  </h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={chartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {chartData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "#fff",
                            border: "none",
                            borderRadius: 12,
                            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
                            fontSize: 13,
                          }}
                          formatter={(v: number) => [`${v} kg`, ""]}
                        />
                        <Legend
                          verticalAlign="bottom"
                          iconType="circle"
                          wrapperStyle={{ fontSize: 12, color: "#6B6B63", paddingTop: 8 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Impact */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-card p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                  <TreePine className="mb-3 h-5 w-5 text-primary" />
                  <p className="text-sm text-foreground">
                    Equivalent to <span className="font-semibold">{result.trees_equivalent}</span> trees absorbing CO₂ for a day
                  </p>
                </div>
                <div className="rounded-2xl bg-card p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                  <Flame className="mb-3 h-5 w-5 text-accent" />
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">{result.streak_count} Day</span> Streak
                  </p>
                </div>
              </div>

              {/* Tips */}
              <div className="space-y-3">
                <h3 className="px-1 text-xs font-bold uppercase tracking-widest text-foreground">
                  AI Tips for tomorrow
                </h3>
                {result.tips.slice(0, 3).map((tip, i) => {
                  const done = doneTips[i];
                  return (
                    <div key={i} className="rounded-2xl bg-card p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                      <div className="flex items-start gap-4">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {String(i + 1).padStart(2, "0")}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm leading-relaxed text-foreground">{tip}</p>
                          <button
                            onClick={() => setDoneTips((d) => ({ ...d, [i]: !d[i] }))}
                            className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                              done
                                ? "bg-primary text-primary-foreground"
                                : "border border-primary/30 text-primary hover:bg-primary/5"
                            }`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {done ? "Done today!" : "Mark as done"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4">
                <button
                  onClick={() => {
                    setInputs(emptyInputs);
                    setResult(null);
                    setView("input");
                  }}
                  className="w-full rounded-full border border-primary/30 px-8 py-4 text-base font-semibold text-primary transition-all hover:bg-primary/5"
                >
                  <span className="inline-flex items-center gap-1">Log Another Day <ArrowRight className="h-4 w-4" /></span>
                </button>
              </div>
            </div>
          </FadeView>
        )}
      </div>
    </main>
  );
}
