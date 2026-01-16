import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Upload,
  Users,
  AlertTriangle,
  Images,
  Settings,
  CheckCircle2,
  Sparkles,
  Merge,
  Split,
  ShieldCheck,
  XCircle,
  Pin,
  Trash2,
  ChevronRight,
  FolderOpen,
  Copy,
  Grid3X3,
  List,
  Filter,
  Tag,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

/**
 * Previewable MVP (single-file)
 * Focus: Web UI + Local Agent (FastAPI) workflow
 * - Assets: gallery grid + kinds (people + non-people)
 * - People: auto-grouped clusters
 * - Person: angle buckets + auto best-quality reference selection
 * - Local Agent: Open folder / Copy path (calls local FastAPI; graceful fallback)
 */

// ----------------------------
// Config
// ----------------------------
const DEFAULT_UMK_BASE_URL = "http://127.0.0.1:7000";
const UMK_BASE_URL =
  (typeof process !== "undefined" && process?.env?.NEXT_PUBLIC_UMK_BASE_URL) ||
  DEFAULT_UMK_BASE_URL;

// ----------------------------
// Domain constants
// ----------------------------
const ANGLE_BUCKETS = [
  { key: "frontal", label: "Frontal" },
  { key: "l3q", label: "Left 3/4" },
  { key: "r3q", label: "Right 3/4" },
  { key: "lprofile", label: "Left Profile" },
  { key: "rprofile", label: "Right Profile" },
  { key: "up", label: "Up" },
  { key: "down", label: "Down" },
];

const STATUS = {
  VERIFIED: "Verified",
  NEEDS_REVIEW: "Needs Review",
  NOISE: "Noise",
};

const ASSET_KIND = {
  PERSON: "person",
  LANDSCAPE: "landscape",
  ARCHITECTURE: "architecture",
  FILM: "film",
  PRODUCT: "product",
  DOCUMENT: "document",
};

const ASSET_KIND_LABEL = {
  [ASSET_KIND.PERSON]: "People",
  [ASSET_KIND.LANDSCAPE]: "Landscape",
  [ASSET_KIND.ARCHITECTURE]: "Architecture",
  [ASSET_KIND.FILM]: "Film",
  [ASSET_KIND.PRODUCT]: "Product",
  [ASSET_KIND.DOCUMENT]: "Document",
};

// ----------------------------
// Helpers
// ----------------------------
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function randInt(a, b) {
  return Math.floor(a + Math.random() * (b - a + 1));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatPct(x) {
  const v = Math.round(x * 100);
  return `${v}%`;
}

function confidenceLabel(x) {
  if (x >= 0.9) return { label: "High", variant: "default" };
  if (x >= 0.8) return { label: "Medium", variant: "secondary" };
  return { label: "Low", variant: "destructive" };
}

function angleCoverageScore(coverage) {
  const total = ANGLE_BUCKETS.length;
  const got = ANGLE_BUCKETS.reduce((acc, b) => acc + (coverage?.[b.key] ? 1 : 0), 0);
  return { got, total };
}

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const a = 30 + (h % 60);
  const b = 30 + ((h >>> 8) % 60);
  const c = 30 + ((h >>> 16) % 60);
  return `hsl(${a}, ${b}%, ${c}%)`;
}

function buildPersonRefsFolder(personId) {
  // local-first deterministic path (server computes real absolute path; UI shows fallback)
  return `./library/people/${personId}/refs`;
}

async function fetchWithTimeout(url, init, ms = 1200) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const detail = json?.detail || json || text || `HTTP ${res.status}`;
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

async function pingAgent() {
  return fetchWithTimeout(`${UMK_BASE_URL}/local/ping`, { method: "GET" }, 800);
}

async function getRefsFolder(personId) {
  return fetchWithTimeout(
    `${UMK_BASE_URL}/local/people/${encodeURIComponent(personId)}/refs-folder`,
    { method: "GET" },
    1200
  );
}

async function openRefsFolder(personId, prepare = true) {
  return fetchWithTimeout(
    `${UMK_BASE_URL}/local/people/${encodeURIComponent(personId)}/refs:open`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prepare, reveal: true }),
    },
    2000
  );
}

function PhotoStub({ seed, label }) {
  const bg = useMemo(() => hashColor(seed), [seed]);
  return (
    <div
      className="relative overflow-hidden ring-1 ring-black/5 bg-muted/20"
      style={{ background: `linear-gradient(135deg, ${bg}, rgba(0,0,0,0))` }}
    >
      <div className="absolute inset-0 opacity-[0.12] bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.65),transparent_55%),radial-gradient(circle_at_70%_65%,rgba(255,255,255,0.35),transparent_55%)]" />
      {label ? (
        <div className="absolute bottom-2 left-2 text-[11px] px-2 py-0.5 rounded-xl bg-background/70 ring-1 ring-black/5">
          {label}
        </div>
      ) : null}
    </div>
  );
}

function AvatarTile({ id, name, size = 56, sub = "", photoSeed }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="rounded-2xl shadow-sm ring-1 ring-black/10 overflow-hidden"
        style={{ width: size, height: size }}
        title={id}
      >
        {/* production: best face-crop thumbnail */}
        <PhotoStub seed={photoSeed || id} />
      </div>
      <div className="min-w-0">
        <div className="font-medium truncate">{name}</div>
        {sub ? <div className="text-xs text-muted-foreground truncate">{sub}</div> : null}
      </div>
    </div>
  );
}

function CoverageDots({ coverage }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ANGLE_BUCKETS.map((b) => (
        <span
          key={b.key}
          className={
            "inline-block w-2.5 h-2.5 rounded-full ring-1 ring-black/10 " +
            (coverage?.[b.key] ? "bg-foreground/80" : "bg-muted")
          }
          title={`${b.label}: ${coverage?.[b.key] ? "OK" : "Missing"}`}
        />
      ))}
    </div>
  );
}

function MiniBar({ value }) {
  const pct = clamp(Math.round(value * 100), 0, 100);
  return (
    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
      <div className="h-full bg-foreground/80" style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatPill({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 ring-1 ring-black/5">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium ml-auto">{value}</div>
    </div>
  );
}

function Toolbar({ query, setQuery, onUpload, right }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people, assets, tags…"
          className="pl-9 rounded-2xl"
        />
      </div>
      <Button onClick={onUpload} className="rounded-2xl">
        <Upload className="w-4 h-4 mr-2" />
        Simulate Upload
      </Button>
      {right}
    </div>
  );
}

function Sidebar({ active, setActive }) {
  const items = [
    { key: "uploads", label: "Uploads", icon: Upload },
    { key: "assets", label: "Assets", icon: Images },
    { key: "people", label: "People", icon: Users },
    { key: "review", label: "Review", icon: AlertTriangle },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="h-full p-3 flex flex-col gap-3">
      <div className="px-2 py-2">
        <div className="text-sm font-semibold">Media Grouping MVP</div>
        <div className="text-xs text-muted-foreground">Web UI + Local Agent (FastAPI)</div>
      </div>
      <div className="flex flex-col gap-1">
        {items.map(({ key, label, icon: Icon }) => {
          const is = active === key;
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={
                "flex items-center gap-2 px-3 py-2 rounded-2xl text-sm transition ring-1 " +
                (is
                  ? "bg-foreground text-background ring-black/10"
                  : "bg-transparent hover:bg-muted ring-transparent")
              }
            >
              <Icon className={"w-4 h-4 " + (is ? "text-background" : "text-muted-foreground")} />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto p-3 rounded-2xl bg-muted/40 ring-1 ring-black/5">
        <div className="text-xs text-muted-foreground">MVP Notes</div>
        <div className="text-sm mt-1">
          Folder actions call <span className="font-medium">/local/*</span> endpoints (FastAPI).
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-lg font-semibold">{title}</div>
        {subtitle ? <div className="text-sm text-muted-foreground mt-1">{subtitle}</div> : null}
      </div>
      {right}
    </div>
  );
}

function EmptyState({ title, subtitle, action }) {
  return (
    <div className="p-10 rounded-3xl bg-muted/30 ring-1 ring-black/5 text-center">
      <div className="text-base font-semibold">{title}</div>
      <div className="text-sm text-muted-foreground mt-2">{subtitle}</div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function PersonCard({ person, selected, onOpen, onSelect }) {
  const c = confidenceLabel(person.confidence);
  const cov = angleCoverageScore(person.coverage);

  return (
    <Card
      className={"rounded-3xl ring-1 cursor-pointer " + (selected ? "ring-foreground/30" : "ring-black/5")}
      onClick={() => onOpen(person.id)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <AvatarTile
            id={person.id}
            name={person.name}
            sub={`${person.faces} faces • ${person.assets} assets`}
            size={52}
            photoSeed={person.coverSeed || person.id}
          />
          <div className="flex items-center gap-2">
            <Badge
              variant={
                person.status === STATUS.VERIFIED
                  ? "default"
                  : person.status === STATUS.NEEDS_REVIEW
                    ? "secondary"
                    : "destructive"
              }
              className="rounded-xl"
            >
              {person.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Consistency</div>
              <Badge variant={c.variant} className="rounded-xl">
                {c.label}
              </Badge>
            </div>
            <MiniBar value={person.confidence} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Angle coverage</span>
              <span>
                {cov.got}/{cov.total}
              </span>
            </div>
            <CoverageDots coverage={person.coverage} />
          </div>
          <div className="pl-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(person.id);
              }}
              className={
                "w-9 h-9 rounded-2xl ring-1 grid place-items-center transition " +
                (selected ? "bg-foreground text-background ring-black/10" : "bg-muted/40 hover:bg-muted ring-black/5")
              }
              title={selected ? "Selected" : "Select"}
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        {person.tags?.length ? (
          <div className="flex flex-wrap gap-2 mt-4">
            {person.tags.slice(0, 3).map((t) => (
              <Badge key={t} variant="secondary" className="rounded-xl">
                {t}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AngleMatrix({ selections, onPickBucket, activeBucket }) {
  // 3x3: Up / Neutral / Down x Left / Center / Right (simplified)
  const map = [
    { key: "up", label: "Up", row: 0, col: 1 },
    { key: "l3q", label: "Left 3/4", row: 1, col: 0 },
    { key: "frontal", label: "Frontal", row: 1, col: 1 },
    { key: "r3q", label: "Right 3/4", row: 1, col: 2 },
    { key: "lprofile", label: "Left Profile", row: 2, col: 0 },
    { key: "down", label: "Down", row: 2, col: 1 },
    { key: "rprofile", label: "Right Profile", row: 2, col: 2 },
  ];

  const cell = Array.from({ length: 9 }, () => null);
  for (const item of map) cell[item.row * 3 + item.col] = item;

  return (
    <div className="rounded-3xl ring-1 ring-black/5 bg-muted/20 p-4">
      <div className="text-sm font-medium mb-3">Angle coverage</div>
      <div className="grid grid-cols-3 gap-3">
        {cell.map((b, idx) => {
          if (!b) return <div key={idx} className="h-20 rounded-2xl bg-muted/30 ring-1 ring-black/5" />;
          const has = !!selections?.[b.key];
          const isActive = activeBucket === b.key;
          return (
            <button
              key={b.key}
              onClick={() => onPickBucket(b.key)}
              className={
                "h-20 rounded-2xl ring-1 text-left p-3 transition relative overflow-hidden " +
                (isActive ? "ring-foreground/30 bg-background" : "ring-black/5 bg-background/60 hover:bg-background")
              }
              title={b.label}
            >
              <div className="text-xs text-muted-foreground">{b.label}</div>
              <div className="mt-2 flex items-center justify-between">
                <div className={"text-sm font-medium " + (has ? "" : "text-muted-foreground")}>
                  {has ? "Selected" : "Missing"}
                </div>
                {has ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
              </div>
              {has ? <div className="absolute -right-10 -bottom-10 w-24 h-24 rounded-full bg-foreground/5" /> : null}
            </button>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
        <Sparkles className="w-4 h-4" />
        Click a bucket to manage candidates.
      </div>
    </div>
  );
}

function FaceThumb({ face, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={
        "group rounded-2xl ring-1 overflow-hidden text-left transition " +
        (selected ? "ring-foreground/30" : "ring-black/5 hover:ring-foreground/20")
      }
      title={`${face.angleLabel} • q=${Math.round(face.quality * 100)}`}
    >
      <div className="aspect-square">
        <PhotoStub seed={face.id} />
      </div>
      <div className="p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium truncate">{face.angleLabel}</div>
          {face.pinned ? <Pin className="w-3.5 h-3.5" /> : null}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          q={Math.round(face.quality * 100)} • yaw {face.yaw}° • pitch {face.pitch}°
        </div>
        <div className="mt-1 flex gap-1">
          {face.excluded ? (
            <Badge variant="destructive" className="rounded-xl text-[10px] px-2 py-0">
              Excluded
            </Badge>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function AssetCard({ asset, view, onClick }) {
  const label = ASSET_KIND_LABEL[asset.kind] || asset.kind;
  const hasPeople = asset.kind === ASSET_KIND.PERSON && asset.people?.length;

  if (view === "list") {
    return (
      <button
        onClick={onClick}
        className="rounded-2xl ring-1 ring-black/5 bg-muted/20 hover:bg-muted/30 transition px-3 py-2 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-16 h-12 rounded-2xl overflow-hidden ring-1 ring-black/5">
            <PhotoStub seed={asset.id} label={""} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{asset.filename}</div>
            <div className="text-xs text-muted-foreground truncate">
              {asset.id} • {asset.source} • {label}
              {hasPeople ? ` • ${asset.people.join(", ")}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-xl">{label}</Badge>
            <Badge variant="secondary" className="rounded-xl">{new Date(asset.createdAt).toLocaleDateString()}</Badge>
          </div>
        </div>
      </button>
    );
  }

  return (
    <Card className="rounded-3xl ring-1 ring-black/5 hover:ring-foreground/20 transition cursor-pointer" onClick={onClick}>
      <CardContent className="p-3">
        <div className="rounded-2xl overflow-hidden ring-1 ring-black/5">
          <div className="aspect-[4/3]">
            <PhotoStub seed={asset.id} label={label} />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-sm font-medium truncate">{asset.filename}</div>
          <div className="text-xs text-muted-foreground truncate">{asset.source}</div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {hasPeople ? (
              asset.people.slice(0, 2).map((pid) => (
                <Badge key={pid} variant="secondary" className="rounded-xl">
                  {pid}
                </Badge>
              ))
            ) : (
              <Badge variant="secondary" className="rounded-xl">
                {label}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{new Date(asset.createdAt).toLocaleDateString()}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Inspector({ title, children, onClose }) {
  return (
    <div className="h-full w-full rounded-3xl bg-background ring-1 ring-black/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground mt-1">Inspector</div>
        </div>
        <Button variant="ghost" size="icon" className="rounded-2xl" onClick={onClose}>
          <XCircle className="w-5 h-5" />
        </Button>
      </div>
      <Separator className="my-4" />
      <div className="text-sm">{children}</div>
    </div>
  );
}

// ----------------------------
// Mock data
// ----------------------------
function makeMockPeople() {
  const base = [
    { id: "p001", name: "Person 001", tags: ["clientA"] },
    { id: "p002", name: "Person 002", tags: ["campaign"] },
    { id: "p003", name: "Person 003", tags: [] },
    { id: "p004", name: "Person 004", tags: ["vip"] },
    { id: "p005", name: "Person 005", tags: [] },
    { id: "p006", name: "Person 006", tags: ["test"] },
    { id: "p007", name: "Person 007", tags: [] },
  ];

  return base.map((p, i) => {
    const confidence = clamp(0.72 + Math.random() * 0.26 - (i === 5 ? 0.18 : 0), 0.55, 0.98);
    const faces = randInt(8, 220);
    const assets = clamp(Math.round(faces / randInt(2, 5)), 2, 120);

    const coverage = {};
    for (const b of ANGLE_BUCKETS) {
      const missChance = i === 5 ? 0.45 : 0.18;
      coverage[b.key] = Math.random() > missChance;
    }
    coverage.frontal = Math.random() > (i === 5 ? 0.25 : 0.05);

    const status = confidence >= 0.9 ? STATUS.VERIFIED : STATUS.NEEDS_REVIEW;

    return {
      ...p,
      confidence,
      faces,
      assets,
      status,
      coverage,
      createdAt: Date.now() - randInt(1, 15) * 86400_000,
      coverSeed: `${p.id}_cover`,
    };
  });
}

function makeMockAssets(people) {
  const sources = ["Batch 2026-01-16", "Camera Roll", "Client Upload", "WeChat Export", "Project X"];
  const kinds = Object.values(ASSET_KIND);

  const assets = [];
  for (let i = 1; i <= 48; i++) {
    const id = `a${String(i).padStart(3, "0")}`;
    const src = pick(sources);
    const kind = pick(kinds);

    const hasMulti = kind === ASSET_KIND.PERSON && Math.random() < 0.25;
    const includedPeople =
      kind === ASSET_KIND.PERSON
        ? hasMulti
          ? [pick(people).id, pick(people).id].filter((v, idx, arr) => arr.indexOf(v) === idx)
          : [pick(people).id]
        : [];

    assets.push({
      id,
      kind,
      filename:
        kind === ASSET_KIND.DOCUMENT
          ? `DOC_${randInt(1000, 9999)}.png`
          : `IMG_${randInt(1000, 9999)}.jpg`,
      source: src,
      createdAt: Date.now() - randInt(0, 20) * 86400_000,
      people: includedPeople,
      faces: kind === ASSET_KIND.PERSON ? randInt(1, 3) : 0,
      tags: kind === ASSET_KIND.PERSON ? ["portrait"] : [pick(["travel", "cinema", "design", "reference"])],
    });
  }
  return assets;
}

function makeMockFaces(personId, assetIds) {
  const faces = [];
  const baseAngles = [
    { yaw: 0, pitch: 0, label: "Frontal", bucket: "frontal" },
    { yaw: -28, pitch: 0, label: "Left 3/4", bucket: "l3q" },
    { yaw: 28, pitch: 0, label: "Right 3/4", bucket: "r3q" },
    { yaw: -60, pitch: 0, label: "Left Profile", bucket: "lprofile" },
    { yaw: 60, pitch: 0, label: "Right Profile", bucket: "rprofile" },
    { yaw: 0, pitch: 18, label: "Up", bucket: "up" },
    { yaw: 0, pitch: -18, label: "Down", bucket: "down" },
  ];

  const n = randInt(18, 65);
  for (let i = 0; i < n; i++) {
    const base = pick(baseAngles);
    const yaw = clamp(base.yaw + randInt(-10, 10), -75, 75);
    const pitch = clamp(base.pitch + randInt(-10, 10), -35, 35);
    const quality = clamp(0.55 + Math.random() * 0.45 - (Math.abs(yaw) > 55 ? 0.08 : 0), 0.35, 0.98);
    faces.push({
      id: `${personId}_f${String(i + 1).padStart(3, "0")}`,
      personId,
      assetId: pick(assetIds),
      yaw,
      pitch,
      roll: randInt(-8, 8),
      quality,
      angleLabel: base.label,
      bucket: base.bucket,
      excluded: Math.random() < 0.05,
      pinned: false,
    });
  }

  return faces;
}

function autoPickReferences(faces, strictness = 0.55) {
  const out = {};
  const byBucket = {};

  for (const f of faces) {
    if (f.excluded) continue;
    (byBucket[f.bucket] ||= []).push(f);
  }

  for (const b of ANGLE_BUCKETS) {
    const arr = (byBucket[b.key] || []).slice();
    arr.sort((a, c) => {
      const pa = Math.abs(a.yaw) + Math.abs(a.pitch) * 0.6;
      const pc = Math.abs(c.yaw) + Math.abs(c.pitch) * 0.6;
      const sa = a.quality - strictness * (pa / 120);
      const sc = c.quality - strictness * (pc / 120);
      return sc - sa;
    });
    if (arr.length) out[b.key] = arr[0].id;
  }

  return out;
}

function deriveCoverageFromRefs(refs) {
  const cov = {};
  for (const b of ANGLE_BUCKETS) cov[b.key] = !!refs?.[b.key];
  return cov;
}

// ----------------------------
// App
// ----------------------------
function App() {
  const [route, setRoute] = useState("assets");
  const [query, setQuery] = useState("");

  const [settings, setSettings] = useState({
    matchThreshold: 0.32,
    strictness: 0.58,
    minFaceSize: 80,
    prepareBeforeOpen: true,
  });

  const [people, setPeople] = useState(() => makeMockPeople());
  const [assets, setAssets] = useState(() => makeMockAssets(people));

  const [uploads, setUploads] = useState(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const id = `u${String(i + 1).padStart(3, "0")}`;
      const state = pick(["queued", "processing", "done", "done", "failed"]);
      return {
        id,
        filename: `upload_${randInt(100, 999)}.jpg`,
        state,
        createdAt: Date.now() - randInt(0, 3) * 3600_000,
        message: state === "failed" ? "Face detector timeout" : "",
      };
    });
  });

  // Local Agent status
  const [agentStatus, setAgentStatus] = useState("unknown"); // unknown | online | offline

  // Assets UI
  const [assetsView, setAssetsView] = useState("grid"); // grid | list
  const [assetsKindFilter, setAssetsKindFilter] = useState("all");

  const [selectedPeople, setSelectedPeople] = useState([]); // array of person ids
  const [activePersonId, setActivePersonId] = useState(null);
  const [activeBucket, setActiveBucket] = useState("frontal");
  const [inspector, setInspector] = useState(null); // {type, data}

  // Face instances per person
  const [facesByPerson, setFacesByPerson] = useState(() => {
    const map = {};
    for (const p of people) {
      const pAssets = assets.filter((a) => a.kind === ASSET_KIND.PERSON && a.people.includes(p.id)).map((a) => a.id);
      map[p.id] = makeMockFaces(p.id, pAssets.length ? pAssets : assets.map((a) => a.id));
    }
    return map;
  });

  // Reference selections per person: bucket -> faceId
  const [refsByPerson, setRefsByPerson] = useState(() => {
    const map = {};
    for (const p of people) {
      map[p.id] = autoPickReferences(facesByPerson[p.id], settings.strictness);
    }
    return map;
  });

  useEffect(() => {
    let alive = true;
    pingAgent()
      .then(() => {
        if (alive) setAgentStatus("online");
      })
      .catch(() => {
        if (alive) setAgentStatus("offline");
      });
    return () => {
      alive = false;
    };
  }, []);

  const activePerson = useMemo(
    () => people.find((p) => p.id === activePersonId) || null,
    [people, activePersonId]
  );

  const activeFaces = useMemo(() => {
    if (!activePersonId) return [];
    return facesByPerson[activePersonId] || [];
  }, [activePersonId, facesByPerson]);

  const activeRefs = useMemo(() => {
    if (!activePersonId) return {};
    return refsByPerson[activePersonId] || {};
  }, [activePersonId, refsByPerson]);

  const activeCandidates = useMemo(() => {
    const arr = activeFaces.filter((f) => f.bucket === activeBucket);
    return arr.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.quality - a.quality);
  }, [activeFaces, activeBucket]);

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = people.slice();
    if (q) {
      list = list.filter((p) => [p.id, p.name, ...(p.tags || [])].some((x) => String(x).toLowerCase().includes(q)));
    }
    if (route === "review") list = list.filter((p) => p.status !== STATUS.VERIFIED);
    return list;
  }, [people, query, route]);

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = assets.slice();
    if (assetsKindFilter !== "all") list = list.filter((a) => a.kind === assetsKindFilter);
    if (q) {
      list = list.filter((a) => [a.id, a.filename, a.source, a.kind, ...(a.tags || []), ...(a.people || [])].some((x) => String(x).toLowerCase().includes(q)));
    }
    return list;
  }, [assets, query, assetsKindFilter]);

  const kindCounts = useMemo(() => {
    const counts = {};
    for (const a of assets) counts[a.kind] = (counts[a.kind] || 0) + 1;
    return counts;
  }, [assets]);

  function toast(title, body) {
    setInspector({ type: "toast", data: { title, body } });
  }

  function openPerson(personId) {
    setActivePersonId(personId);
    setRoute("person");
    setActiveBucket("frontal");
    setInspector(null);
  }

  function toggleSelectPerson(personId) {
    setSelectedPeople((prev) => (prev.includes(personId) ? prev.filter((x) => x !== personId) : [...prev, personId]));
  }

  async function copyFolder(personId) {
    const fallback = buildPersonRefsFolder(personId);
    try {
      const r = await getRefsFolder(personId);
      const path = r?.path || fallback;
      await navigator.clipboard?.writeText(path);
      toast("Copied", path);
    } catch {
      try {
        await navigator.clipboard?.writeText(fallback);
        toast("Copied", fallback);
      } catch {
        toast("Copy", "Clipboard not available.");
      }
    }
  }

  async function openFolder(personId) {
    const fallback = buildPersonRefsFolder(personId);
    try {
      const r = await openRefsFolder(personId, !!settings.prepareBeforeOpen);
      const path = r?.path || fallback;
      toast("Open folder", `Opened: ${path}`);
      setAgentStatus("online");
    } catch (e) {
      setAgentStatus("offline");
      toast("Open folder failed", `Agent offline or blocked. Fallback path: ${fallback}`);
    }
  }

  function simulateUpload() {
    const uid = `u${String(uploads.length + 1).padStart(3, "0")}`;
    const kind = pick(Object.values(ASSET_KIND));
    const file = kind === ASSET_KIND.DOCUMENT ? `upload_${randInt(100, 999)}.png` : `upload_${randInt(100, 999)}.jpg`;

    setUploads((prev) => [{ id: uid, filename: file, state: "processing", createdAt: Date.now(), message: "" }, ...prev]);

    const toExisting = Math.random() < 0.8;
    const targetPerson = kind === ASSET_KIND.PERSON && toExisting ? pick(people) : null;

    const newAsset = {
      id: `a${String(assets.length + 1).padStart(3, "0")}`,
      kind,
      filename: file,
      source: "Simulated Upload",
      createdAt: Date.now(),
      people: targetPerson ? [targetPerson.id] : [],
      faces: kind === ASSET_KIND.PERSON ? randInt(1, 2) : 0,
      tags: kind === ASSET_KIND.PERSON ? ["portrait"] : ["reference"],
    };

    setAssets((prev) => [newAsset, ...prev]);

    setTimeout(() => {
      setUploads((prev) => prev.map((u) => (u.id === uid ? { ...u, state: "done" } : u)));
    }, 350);

    if (kind !== ASSET_KIND.PERSON) {
      toast("Ingested", `Added ${ASSET_KIND_LABEL[kind]} asset: ${file}`);
      return;
    }

    if (targetPerson) {
      const addFace = {
        id: `${targetPerson.id}_f${String((facesByPerson[targetPerson.id]?.length || 0) + 1).padStart(3, "0")}`,
        personId: targetPerson.id,
        assetId: newAsset.id,
        yaw: pick([0, -28, 28, -60, 60]),
        pitch: pick([0, 18, -18]),
        roll: randInt(-6, 6),
        quality: clamp(0.6 + Math.random() * 0.35, 0.4, 0.98),
        angleLabel: "Ingested",
        bucket: pick(["frontal", "l3q", "r3q", "lprofile", "rprofile", "up", "down"]),
        excluded: false,
        pinned: false,
      };

      setFacesByPerson((prev) => ({ ...prev, [targetPerson.id]: [addFace, ...(prev[targetPerson.id] || [])] }));
      setPeople((prev) => prev.map((p) => (p.id === targetPerson.id ? { ...p, faces: p.faces + 1, assets: p.assets + 1, coverSeed: addFace.id } : p)));

      setTimeout(() => {
        setRefsByPerson((prev) => {
          const next = { ...prev };
          const facesNow = [addFace, ...(facesByPerson[targetPerson.id] || [])];
          next[targetPerson.id] = autoPickReferences(facesNow, settings.strictness);
          return next;
        });
      }, 0);
    }
  }

  function rerunAutoSelection(personId) {
    const faces = facesByPerson[personId] || [];
    const picks = autoPickReferences(faces, settings.strictness);
    setRefsByPerson((prev) => ({ ...prev, [personId]: picks }));
    setPeople((prev) => prev.map((p) => (p.id === personId ? { ...p, coverage: deriveCoverageFromRefs(picks) } : p)));
  }

  function selectAsRepresentative(bucketKey, faceId) {
    if (!activePersonId) return;
    setRefsByPerson((prev) => ({ ...prev, [activePersonId]: { ...(prev[activePersonId] || {}), [bucketKey]: faceId } }));
    setPeople((prev) => prev.map((p) => (p.id === activePersonId ? { ...p, coverage: deriveCoverageFromRefs({ ...(refsByPerson[activePersonId] || {}), [bucketKey]: faceId }), coverSeed: faceId } : p)));
  }

  function excludeFace(faceId, value) {
    if (!activePersonId) return;
    setFacesByPerson((prev) => ({
      ...prev,
      [activePersonId]: (prev[activePersonId] || []).map((f) => (f.id === faceId ? { ...f, excluded: value } : f)),
    }));
  }

  function pinFace(faceId, value) {
    if (!activePersonId) return;
    setFacesByPerson((prev) => ({
      ...prev,
      [activePersonId]: (prev[activePersonId] || []).map((f) => (f.id === faceId ? { ...f, pinned: value } : f)),
    }));
  }

  function moveFaceToNewPerson(faceId) {
    if (!activePersonId) return;
    const face = (facesByPerson[activePersonId] || []).find((f) => f.id === faceId);
    if (!face) return;

    const newPid = `p${String(people.length + 1).padStart(3, "0")}`;
    const newPerson = {
      id: newPid,
      name: `Person ${newPid.toUpperCase()}`,
      tags: ["split"],
      confidence: 0.8,
      faces: 1,
      assets: 1,
      status: STATUS.NEEDS_REVIEW,
      coverage: { [face.bucket]: true, frontal: face.bucket === "frontal" },
      createdAt: Date.now(),
      coverSeed: face.id,
    };

    setFacesByPerson((prev) => {
      const cur = (prev[activePersonId] || []).filter((f) => f.id !== faceId);
      return { ...prev, [activePersonId]: cur, [newPid]: [face] };
    });

    setPeople((prev) => {
      const cur = prev.map((p) => (p.id === activePersonId ? { ...p, faces: Math.max(0, p.faces - 1) } : p));
      return [newPerson, ...cur];
    });

    setRefsByPerson((prev) => ({ ...prev, [newPid]: { [face.bucket]: face.id } }));
  }

  function mergeSelectedPeople() {
    if (selectedPeople.length < 2) return;
    const [target, ...rest] = selectedPeople;

    setFacesByPerson((prev) => {
      const next = { ...prev };
      const tFaces = next[target] || [];
      for (const pid of rest) {
        next[target] = [...(next[pid] || []), ...tFaces];
        delete next[pid];
      }
      return next;
    });

    setPeople((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      const t = map.get(target);
      if (!t) return prev;
      let facesAdd = 0;
      let assetsAdd = 0;
      for (const pid of rest) {
        const p = map.get(pid);
        if (p) {
          facesAdd += p.faces;
          assetsAdd += p.assets;
        }
      }
      const merged = {
        ...t,
        faces: t.faces + facesAdd,
        assets: t.assets + assetsAdd,
        status: STATUS.NEEDS_REVIEW,
        confidence: clamp((t.confidence + 0.85) / 2, 0.6, 0.98),
        tags: Array.from(new Set([...(t.tags || []), "merged"])),
      };
      return prev.filter((p) => !rest.includes(p.id)).map((p) => (p.id === target ? merged : p));
    });

    setAssets((prev) => prev.map((a) => (a.kind !== ASSET_KIND.PERSON ? a : { ...a, people: a.people.map((pid) => (rest.includes(pid) ? target : pid)).filter((v, idx, arr) => arr.indexOf(v) === idx) })));

    setSelectedPeople([]);
    toast("Merged", `Merged into ${target}.`);
  }

  function markVerified(personId) {
    setPeople((prev) => prev.map((p) => (p.id === personId ? { ...p, status: STATUS.VERIFIED, confidence: clamp(p.confidence + 0.05, 0.6, 0.98) } : p)));
  }

  const bulkBar = selectedPeople.length ? (
    <div className="sticky top-0 z-20">
      <div className="rounded-3xl bg-background/80 backdrop-blur ring-1 ring-black/5 px-4 py-3 flex items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-medium">{selectedPeople.length}</span> selected
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="rounded-2xl" onClick={mergeSelectedPeople} disabled={selectedPeople.length < 2}>
            <Merge className="w-4 h-4 mr-2" />
            Merge
          </Button>
          <Button variant="ghost" className="rounded-2xl" onClick={() => setSelectedPeople([])}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  const content = (
    <div className="h-full flex flex-col gap-4">
      <Toolbar
        query={query}
        setQuery={setQuery}
        onUpload={simulateUpload}
        right={
          <div className="hidden md:flex items-center gap-2">
            <Badge variant="secondary" className="rounded-xl">threshold {settings.matchThreshold.toFixed(2)}</Badge>
            <Badge variant="secondary" className="rounded-xl">strict {settings.strictness.toFixed(2)}</Badge>
          </div>
        }
      />

      <AnimatePresence mode="wait">
        {route === "uploads" ? (
          <motion.div key="uploads" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex-1">
            <SectionTitle title="Uploads" subtitle="Ingestion queue and processing state (simulated)." />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
              <Card className="rounded-3xl ring-1 ring-black/5 lg:col-span-2">
                <CardHeader><CardTitle className="text-sm">Queue</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    {uploads.map((u) => (
                      <div key={u.id} className="flex items-center justify-between gap-3 rounded-2xl bg-muted/30 ring-1 ring-black/5 px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{u.filename}</div>
                          <div className="text-xs text-muted-foreground truncate">{u.id} • {new Date(u.createdAt).toLocaleString()}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {u.state === "queued" ? <Badge className="rounded-xl" variant="secondary">queued</Badge> : null}
                          {u.state === "processing" ? <Badge className="rounded-xl" variant="default">processing</Badge> : null}
                          {u.state === "done" ? <Badge className="rounded-xl" variant="default">done</Badge> : null}
                          {u.state === "failed" ? <Badge className="rounded-xl" variant="destructive">failed</Badge> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-3xl ring-1 ring-black/5">
                <CardHeader><CardTitle className="text-sm">Summary</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <StatPill icon={Upload} label="Total uploads" value={uploads.length} />
                  <StatPill icon={CheckCircle2} label="Done" value={uploads.filter((u) => u.state === "done").length} />
                  <StatPill icon={AlertTriangle} label="Failed" value={uploads.filter((u) => u.state === "failed").length} />
                  <Separator />
                  <div className="text-xs text-muted-foreground">Simulate Upload creates people and non-people assets.</div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        ) : null}

        {route === "assets" ? (
          <motion.div key="assets" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex-1">
            <SectionTitle
              title="Assets"
              subtitle="All uploads (people + non-people). People grouping is a view on top of Assets."
              right={
                <div className="flex items-center gap-2">
                  <Button variant={assetsView === "grid" ? "default" : "secondary"} className="rounded-2xl" onClick={() => setAssetsView("grid")}>
                    <Grid3X3 className="w-4 h-4 mr-2" />Grid
                  </Button>
                  <Button variant={assetsView === "list" ? "default" : "secondary"} className="rounded-2xl" onClick={() => setAssetsView("list")}>
                    <List className="w-4 h-4 mr-2" />List
                  </Button>
                  <Button variant="secondary" className="rounded-2xl" onClick={() => setRoute("people")}>
                    <Users className="w-4 h-4 mr-2" />People
                  </Button>
                </div>
              }
            />

            <div className="mt-4 rounded-3xl bg-muted/20 ring-1 ring-black/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Filter className="w-4 h-4" />Content kind
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" className="rounded-2xl" variant={assetsKindFilter === "all" ? "default" : "secondary"} onClick={() => setAssetsKindFilter("all")}>
                  All <Badge variant="secondary" className="rounded-xl ml-2">{assets.length}</Badge>
                </Button>
                {Object.values(ASSET_KIND).map((k) => (
                  <Button key={k} size="sm" className="rounded-2xl" variant={assetsKindFilter === k ? "default" : "secondary"} onClick={() => setAssetsKindFilter(k)}>
                    {ASSET_KIND_LABEL[k]} <Badge variant="secondary" className="rounded-xl ml-2">{kindCounts[k] || 0}</Badge>
                  </Button>
                ))}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                In production: kind can be assigned by a lightweight classifier (CLIP/embedding) + tags.
              </div>
            </div>

            <div className="mt-4">
              {filteredAssets.length ? (
                assetsView === "grid" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredAssets.slice(0, 48).map((a) => (
                      <AssetCard key={a.id} asset={a} view="grid" onClick={() => setInspector({ type: "asset", data: { assetId: a.id } })} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {filteredAssets.slice(0, 48).map((a) => (
                      <AssetCard key={a.id} asset={a} view="list" onClick={() => setInspector({ type: "asset", data: { assetId: a.id } })} />
                    ))}
                  </div>
                )
              ) : (
                <EmptyState title="No assets" subtitle="Try simulating uploads." />
              )}
            </div>

            <div className="mt-4">
              {inspector?.type === "asset" ? (
                <div className="rounded-3xl bg-background ring-1 ring-black/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Asset inspector</div>
                    <Button variant="ghost" className="rounded-2xl" onClick={() => setInspector(null)}>Close</Button>
                  </div>
                  <Separator className="my-3" />
                  <AssetInspector asset={assets.find((x) => x.id === inspector.data.assetId)} people={people} onOpenPerson={(id) => openPerson(id)} />
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}

        {route === "people" ? (
          <motion.div key="people" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex-1 flex flex-col gap-4">
            <SectionTitle
              title="People"
              subtitle="Auto-grouped clusters. Cover is the representative face-crop (stub in MVP)."
              right={
                <div className="flex items-center gap-2">
                  <Button variant="secondary" className="rounded-2xl" onClick={() => setRoute("assets")}>
                    <Images className="w-4 h-4 mr-2" />Assets
                  </Button>
                  <Button className="rounded-2xl" onClick={() => setRoute("review")}>
                    <AlertTriangle className="w-4 h-4 mr-2" />Review
                  </Button>
                </div>
              }
            />

            {bulkBar}

            {filteredPeople.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredPeople.map((p) => (
                  <PersonCard key={p.id} person={p} selected={selectedPeople.includes(p.id)} onOpen={openPerson} onSelect={toggleSelectPerson} />
                ))}
              </div>
            ) : (
              <EmptyState title="No people" subtitle="Simulate uploads to create person assets." action={<Button className="rounded-2xl" onClick={simulateUpload}>Simulate Upload</Button>} />
            )}
          </motion.div>
        ) : null}

        {route === "person" ? (
          <motion.div key="person" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex-1">
            {!activePerson ? (
              <EmptyState title="No person selected" subtitle="Open a person from People." action={<Button className="rounded-2xl" onClick={() => setRoute("people")}>Go to People</Button>} />
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2 flex flex-col gap-4">
                  <Card className="rounded-3xl ring-1 ring-black/5">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <AvatarTile
                          id={activePerson.id}
                          name={activePerson.name}
                          sub={`${activePerson.faces} faces • ${activePerson.assets} assets • created ${new Date(activePerson.createdAt).toLocaleDateString()}`}
                          size={60}
                          photoSeed={activePerson.coverSeed}
                        />
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <Badge className="rounded-xl" variant={activePerson.status === STATUS.VERIFIED ? "default" : "secondary"}>{activePerson.status}</Badge>
                          <Badge className="rounded-xl" variant="secondary">consistency {formatPct(activePerson.confidence)}</Badge>
                          <Badge className="rounded-xl" variant={agentStatus === "online" ? "default" : agentStatus === "offline" ? "destructive" : "secondary"}>
                            agent {agentStatus}
                          </Badge>

                          <Button variant="secondary" className="rounded-2xl" onClick={() => rerunAutoSelection(activePerson.id)}>
                            <Sparkles className="w-4 h-4 mr-2" />Auto-pick
                          </Button>

                          <Button variant="secondary" className="rounded-2xl" onClick={() => copyFolder(activePerson.id)}>
                            <Copy className="w-4 h-4 mr-2" />Copy folder
                          </Button>

                          <Button className="rounded-2xl" onClick={() => openFolder(activePerson.id)}>
                            <FolderOpen className="w-4 h-4 mr-2" />Open folder
                          </Button>

                          <Button className="rounded-2xl" onClick={() => markVerified(activePerson.id)}>
                            <ShieldCheck className="w-4 h-4 mr-2" />Mark Verified
                          </Button>

                          <Button variant="ghost" className="rounded-2xl" onClick={() => setRoute("people")}>
                            Back
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl bg-muted/20 ring-1 ring-black/5 px-3 py-2 text-xs text-muted-foreground flex items-center justify-between gap-3">
                        <div className="min-w-0 truncate">Refs folder: <span className="font-medium text-foreground">{buildPersonRefsFolder(activePerson.id)}</span></div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="rounded-xl">prepare {settings.prepareBeforeOpen ? "on" : "off"}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="rounded-2xl">
                      <TabsTrigger value="overview" className="rounded-2xl">Overview</TabsTrigger>
                      <TabsTrigger value="references" className="rounded-2xl">References</TabsTrigger>
                      <TabsTrigger value="faces" className="rounded-2xl">Faces</TabsTrigger>
                      <TabsTrigger value="assets" className="rounded-2xl">Assets</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-4">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <AngleMatrix selections={activeRefs} activeBucket={activeBucket} onPickBucket={(k) => setActiveBucket(k)} />
                        <Card className="rounded-3xl ring-1 ring-black/5">
                          <CardHeader><CardTitle className="text-sm">Auto-selected references</CardTitle></CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 gap-3">
                              {ANGLE_BUCKETS.map((b) => {
                                const faceId = activeRefs[b.key];
                                const face = activeFaces.find((f) => f.id === faceId) || null;
                                return (
                                  <button
                                    key={b.key}
                                    onClick={() => setActiveBucket(b.key)}
                                    className="rounded-2xl ring-1 ring-black/5 bg-muted/20 hover:bg-muted/30 transition p-3 text-left"
                                  >
                                    <div className="text-xs text-muted-foreground">{b.label}</div>
                                    <div className="mt-2 flex items-center justify-between">
                                      <div className={"text-sm font-medium " + (face ? "" : "text-muted-foreground")}>{face ? "Selected" : "Missing"}</div>
                                      {face ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                                    </div>
                                    {face ? (
                                      <div className="mt-2 text-xs text-muted-foreground">q={Math.round(face.quality * 100)} • yaw {face.yaw}° • pitch {face.pitch}°</div>
                                    ) : (
                                      <div className="mt-2 text-xs text-muted-foreground">Click to fill</div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="mt-3 text-xs text-muted-foreground">
                              Tip: Open folder will (optionally) materialize these refs into per-bucket files.
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="rounded-3xl ring-1 ring-black/5 lg:col-span-2">
                          <CardHeader><CardTitle className="text-sm">Outliers (likely mis-grouped)</CardTitle></CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {activeFaces.slice().sort((a, b) => a.quality - b.quality).slice(0, 8).map((f) => (
                                <FaceThumb key={f.id} face={f} selected={false} onClick={() => setInspector({ type: "face", data: { faceId: f.id, personId: activePerson.id } })} />
                              ))}
                            </div>
                            <div className="mt-3 text-xs text-muted-foreground">Move outliers to a new person if they do not match.</div>
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>

                    <TabsContent value="references" className="mt-4">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <Card className="rounded-3xl ring-1 ring-black/5">
                          <CardHeader><CardTitle className="text-sm">Buckets</CardTitle></CardHeader>
                          <CardContent className="flex flex-col gap-2">
                            {ANGLE_BUCKETS.map((b) => {
                              const has = !!activeRefs[b.key];
                              const is = activeBucket === b.key;
                              return (
                                <button
                                  key={b.key}
                                  onClick={() => setActiveBucket(b.key)}
                                  className={
                                    "px-3 py-2 rounded-2xl ring-1 text-left flex items-center justify-between gap-3 transition " +
                                    (is ? "bg-foreground text-background ring-black/10" : "bg-muted/20 hover:bg-muted/30 ring-black/5")
                                  }
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">{b.label}</div>
                                    <div className={"text-xs truncate " + (is ? "text-background/80" : "text-muted-foreground")}>
                                      {has ? "Representative selected" : "Missing"}
                                    </div>
                                  </div>
                                  <ChevronRight className={"w-4 h-4 " + (is ? "text-background" : "text-muted-foreground")} />
                                </button>
                              );
                            })}
                          </CardContent>
                        </Card>

                        <Card className="rounded-3xl ring-1 ring-black/5 lg:col-span-2">
                          <CardHeader>
                            <div className="flex items-center justify-between gap-3">
                              <CardTitle className="text-sm">Candidates: {ANGLE_BUCKETS.find((b) => b.key === activeBucket)?.label}</CardTitle>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="rounded-xl">{activeCandidates.length} candidates</Badge>
                                <Button
                                  variant="secondary"
                                  className="rounded-2xl"
                                  onClick={() => {
                                    const faces = activeFaces.filter((f) => f.bucket === activeBucket && !f.excluded);
                                    if (!faces.length) return;
                                    const picks = autoPickReferences(faces, settings.strictness);
                                    const chosen = picks[activeBucket];
                                    if (chosen) selectAsRepresentative(activeBucket, chosen);
                                  }}
                                >
                                  <Sparkles className="w-4 h-4 mr-2" />Auto-pick bucket
                                </Button>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            {activeCandidates.length ? (
                              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                                {activeCandidates.slice(0, 16).map((f) => (
                                  <FaceThumb key={f.id} face={f} selected={activeRefs[activeBucket] === f.id} onClick={() => setInspector({ type: "face", data: { faceId: f.id, personId: activePerson.id, bucket: activeBucket } })} />
                                ))}
                              </div>
                            ) : (
                              <EmptyState title="No candidates" subtitle="This bucket has no eligible faces. Add more uploads or lower strictness." />
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>

                    <TabsContent value="faces" className="mt-4">
                      <Card className="rounded-3xl ring-1 ring-black/5">
                        <CardHeader>
                          <div className="flex items-center justify-between gap-3">
                            <CardTitle className="text-sm">All faces</CardTitle>
                            <div className="flex items-center gap-2">
                              <Button variant="secondary" className="rounded-2xl" onClick={() => {
                                const worst = activeFaces.slice().sort((a, b) => a.quality - b.quality)[0];
                                if (worst) excludeFace(worst.id, true);
                              }}>
                                <Trash2 className="w-4 h-4 mr-2" />Exclude worst
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
                            {activeFaces.slice(0, 30).map((f) => (
                              <FaceThumb key={f.id} face={f} selected={false} onClick={() => setInspector({ type: "face", data: { faceId: f.id, personId: activePerson.id } })} />
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="assets" className="mt-4">
                      <Card className="rounded-3xl ring-1 ring-black/5">
                        <CardHeader><CardTitle className="text-sm">Assets containing this person</CardTitle></CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {assets.filter((a) => a.kind === ASSET_KIND.PERSON && a.people.includes(activePerson.id)).slice(0, 18).map((a) => (
                              <AssetCard key={a.id} asset={a} view="list" onClick={() => setInspector({ type: "asset", data: { assetId: a.id } })} />
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>

                <div className="xl:col-span-1">
                  <Card className="rounded-3xl ring-1 ring-black/5">
                    <CardHeader><CardTitle className="text-sm">Quick actions</CardTitle></CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <Button className="rounded-2xl" onClick={() => openFolder(activePerson.id)}>
                        <FolderOpen className="w-4 h-4 mr-2" />Open folder
                      </Button>
                      <Button variant="secondary" className="rounded-2xl" onClick={() => copyFolder(activePerson.id)}>
                        <Copy className="w-4 h-4 mr-2" />Copy folder path
                      </Button>
                      <Button variant={settings.prepareBeforeOpen ? "default" : "secondary"} className="rounded-2xl" onClick={() => setSettings((s) => ({ ...s, prepareBeforeOpen: !s.prepareBeforeOpen }))}>
                        <Tag className="w-4 h-4 mr-2" />prepare before open: {settings.prepareBeforeOpen ? "on" : "off"}
                      </Button>
                      <Separator />
                      <div className="text-xs text-muted-foreground">
                        Local Agent opens Explorer/Finder via FastAPI. If offline, we fall back to showing the deterministic folder path.
                      </div>
                    </CardContent>
                  </Card>

                  <div className="mt-4">
                    {inspector && inspector.type !== "toast" ? (
                      <Inspector title={inspector.type === "face" ? "Face instance" : "Asset"} onClose={() => setInspector(null)}>
                        {inspector.type === "face" ? (
                          <FaceInspector
                            inspector={inspector}
                            faces={activeFaces}
                            refs={activeRefs}
                            onSelect={(bucket, faceId) => selectAsRepresentative(bucket, faceId)}
                            onExclude={(faceId, val) => excludeFace(faceId, val)}
                            onPin={(faceId, val) => pinFace(faceId, val)}
                            onSplit={(faceId) => moveFaceToNewPerson(faceId)}
                          />
                        ) : null}
                        {inspector.type === "asset" ? (
                          <AssetInspector asset={assets.find((a) => a.id === inspector.data.assetId)} people={people} onOpenPerson={(id) => openPerson(id)} />
                        ) : null}
                      </Inspector>
                    ) : (
                      <Card className="rounded-3xl ring-1 ring-black/5">
                        <CardHeader><CardTitle className="text-sm">Inspector</CardTitle></CardHeader>
                        <CardContent><div className="text-sm text-muted-foreground">Click a face candidate or an asset to inspect.</div></CardContent>
                      </Card>
                    )}

                    {inspector?.type === "toast" ? (
                      <div className="mt-4 rounded-3xl bg-muted/40 ring-1 ring-black/5 p-4">
                        <div className="text-sm font-semibold">{inspector.data.title}</div>
                        <div className="text-sm text-muted-foreground mt-1">{inspector.data.body}</div>
                        <div className="mt-3">
                          <Button variant="secondary" className="rounded-2xl" onClick={() => setInspector(null)}>Dismiss</Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        ) : null}

        {route === "review" ? (
          <motion.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex-1">
            <SectionTitle title="Review" subtitle="MVP placeholder: put low-confidence / merge suggestions / noise here." right={<Button className="rounded-2xl" onClick={() => setRoute("people")}>Back</Button>} />
            <EmptyState title="Review queue" subtitle="In production: show merge suggestions + low confidence + noise items." />
          </motion.div>
        ) : null}

        {route === "settings" ? (
          <motion.div key="settings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex-1">
            <SectionTitle title="Settings" subtitle="Selection policies (MVP)." />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <Card className="rounded-3xl ring-1 ring-black/5">
                <CardHeader><CardTitle className="text-sm">Selection</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="rounded-2xl bg-muted/20 ring-1 ring-black/5 p-3">
                    <div className="text-xs text-muted-foreground">Strictness</div>
                    <div className="text-lg font-semibold mt-1">{settings.strictness.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground mt-1">Higher = prefer high-quality & less extreme angles</div>
                    <div className="mt-3 flex items-center gap-2">
                      <Button variant="secondary" className="rounded-2xl" onClick={() => setSettings((s) => ({ ...s, strictness: clamp(s.strictness - 0.05, 0, 1) }))}>-</Button>
                      <Button variant="secondary" className="rounded-2xl" onClick={() => setSettings((s) => ({ ...s, strictness: clamp(s.strictness + 0.05, 0, 1) }))}>+</Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="rounded-2xl bg-muted/20 ring-1 ring-black/5 p-3">
                    <div className="text-xs text-muted-foreground">Prepare refs before open</div>
                    <div className="text-sm mt-1 text-muted-foreground">If enabled, /refs:open will materialize per-bucket reference files then reveal the folder.</div>
                    <div className="mt-3">
                      <Button variant={settings.prepareBeforeOpen ? "default" : "secondary"} className="rounded-2xl" onClick={() => setSettings((s) => ({ ...s, prepareBeforeOpen: !s.prepareBeforeOpen }))}>
                        {settings.prepareBeforeOpen ? "Enabled" : "Disabled"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl ring-1 ring-black/5">
                <CardHeader><CardTitle className="text-sm">Local Agent</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="rounded-2xl bg-muted/20 ring-1 ring-black/5 p-3">
                    <div className="text-xs text-muted-foreground">Base URL</div>
                    <div className="text-sm font-medium mt-1 break-all">{UMK_BASE_URL}</div>
                    <div className="mt-2 text-xs text-muted-foreground">Expected endpoints: /local/ping, /local/people/{`{id}`}/refs-folder, /local/people/{`{id}`}/refs:open</div>
                  </div>
                  <div className="rounded-2xl bg-muted/20 ring-1 ring-black/5 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">Agent status</div>
                        <div className="text-xs text-muted-foreground">{agentStatus}</div>
                      </div>
                      <Button variant="secondary" className="rounded-2xl" onClick={() => {
                        setAgentStatus("unknown");
                        pingAgent().then(() => setAgentStatus("online")).catch(() => setAgentStatus("offline"));
                      }}>Recheck</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="h-[92vh] w-full bg-background text-foreground">
      <div className="h-full grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 p-4">
        <div className="hidden lg:block rounded-3xl bg-background ring-1 ring-black/5">
          <Sidebar active={route === "person" ? "people" : route} setActive={(k) => setRoute(k)} />
        </div>
        <div className="rounded-3xl bg-background ring-1 ring-black/5 p-4 overflow-auto">{content}</div>
      </div>
    </div>
  );
}

function FaceInspector({ inspector, faces, refs, onSelect, onExclude, onPin, onSplit }) {
  const face = faces.find((f) => f.id === inspector.data.faceId);
  if (!face) return <div className="text-muted-foreground">Face not found.</div>;

  const bucketKey = inspector.data.bucket || face.bucket;
  const isSelected = refs?.[bucketKey] === face.id;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl overflow-hidden ring-1 ring-black/5">
        <div className="aspect-square">
          <PhotoStub seed={face.id} />
        </div>
      </div>

      <div className="text-sm font-medium">{face.id}</div>
      <div className="text-xs text-muted-foreground">
        bucket: <span className="font-medium text-foreground">{bucketKey}</span> • asset: <span className="font-medium text-foreground">{face.assetId}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-muted/20 ring-1 ring-black/5 p-3">
          <div className="text-xs text-muted-foreground">Quality</div>
          <div className="text-base font-semibold mt-1">{Math.round(face.quality * 100)}</div>
        </div>
        <div className="rounded-2xl bg-muted/20 ring-1 ring-black/5 p-3">
          <div className="text-xs text-muted-foreground">Pose</div>
          <div className="text-xs mt-1 text-muted-foreground">yaw {face.yaw}° • pitch {face.pitch}° • roll {face.roll}°</div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button className="rounded-2xl" onClick={() => onSelect(bucketKey, face.id)} disabled={isSelected}>
          <CheckCircle2 className="w-4 h-4 mr-2" />
          {isSelected ? "Selected representative" : `Set as representative (${bucketKey})`}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button variant={face.pinned ? "default" : "secondary"} className="rounded-2xl" onClick={() => onPin(face.id, !face.pinned)}>
            <Pin className="w-4 h-4 mr-2" />
            {face.pinned ? "Pinned" : "Pin"}
          </Button>
          <Button variant={face.excluded ? "destructive" : "secondary"} className="rounded-2xl" onClick={() => onExclude(face.id, !face.excluded)}>
            <Trash2 className="w-4 h-4 mr-2" />
            {face.excluded ? "Excluded" : "Exclude"}
          </Button>
        </div>

        <Button variant="secondary" className="rounded-2xl" onClick={() => onSplit(face.id)}>
          <Split className="w-4 h-4 mr-2" />
          Move to new person
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        In production, this inspector shows the real face-crop and a link to the original asset.
      </div>
    </div>
  );
}

function AssetInspector({ asset, people, onOpenPerson }) {
  if (!asset) return <div className="text-muted-foreground">Asset not found.</div>;
  const label = ASSET_KIND_LABEL[asset.kind] || asset.kind;
  const hasPeople = asset.kind === ASSET_KIND.PERSON && asset.people?.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl overflow-hidden ring-1 ring-black/5">
        <div className="aspect-[16/10]">
          <PhotoStub seed={asset.id} label={label} />
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold">{asset.filename}</div>
        <div className="text-xs text-muted-foreground">{asset.id} • {asset.source} • {label}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-muted/20 ring-1 ring-black/5 p-3">
          <div className="text-xs text-muted-foreground">Kind</div>
          <div className="text-base font-semibold mt-1">{label}</div>
        </div>
        <div className="rounded-2xl bg-muted/20 ring-1 ring-black/5 p-3">
          <div className="text-xs text-muted-foreground">Date</div>
          <div className="text-xs mt-1 text-muted-foreground">{new Date(asset.createdAt).toLocaleString()}</div>
        </div>
      </div>

      <Separator />

      <div className="text-sm font-medium">Tags</div>
      <div className="flex flex-wrap gap-2">
        {(asset.tags || []).slice(0, 8).map((t) => (
          <Badge key={t} variant="secondary" className="rounded-xl">{t}</Badge>
        ))}
      </div>

      {hasPeople ? (
        <>
          <Separator />
          <div className="text-sm font-medium">People detected in this asset</div>
          <div className="flex flex-col gap-2">
            {asset.people.map((pid) => {
              const p = people.find((x) => x.id === pid);
              return (
                <button key={pid} onClick={() => onOpenPerson(pid)} className="rounded-2xl ring-1 ring-black/5 bg-muted/20 hover:bg-muted/30 transition px-3 py-2 text-left">
                  <div className="text-sm font-medium">{pid}</div>
                  <div className="text-xs text-muted-foreground">{p?.name || "Unknown"}</div>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">This is a non-people asset; it remains in the general library.</div>
      )}
    </div>
  );
}

export default App;
