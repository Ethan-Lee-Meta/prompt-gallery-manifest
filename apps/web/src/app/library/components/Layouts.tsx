/* eslint-disable */
"use client";

import React from "react";
import { Search, Upload, Images, Users, AlertTriangle, Settings, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ANGLE_BUCKETS } from "../data";

// ----------------------------
// Layout Components
// ----------------------------

export function Toolbar({ query, setQuery, onUpload, right }: { query: string; setQuery: (s: string) => void; onUpload: (e: any) => void; right?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3">
            <input type="file" id="hidden-file-upload" className="hidden" multiple onChange={onUpload} />
            <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search people, assets, tags…"
                    className="pl-9 rounded-2xl"
                />
            </div>
            <Button onClick={() => document.getElementById("hidden-file-upload")?.click()} className="rounded-2xl">
                <Upload className="w-4 h-4 mr-2" />
                Upload
            </Button>
            {right}
        </div>
    );
}

export function Sidebar({ active, setActive }: { active: string; setActive: (k: string) => void }) {
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

export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
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

export function EmptyState({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
    return (
        <div className="p-10 rounded-3xl bg-muted/30 ring-1 ring-black/5 text-center">
            <div className="text-base font-semibold">{title}</div>
            <div className="text-sm text-muted-foreground mt-2">{subtitle}</div>
            {action ? <div className="mt-4">{action}</div> : null}
        </div>
    );
}

export function AngleMatrix({ selections, onPickBucket, activeBucket }: { selections: any; onPickBucket: (k: string) => void; activeBucket: string }) {
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

    const cell = Array.from({ length: 9 }, () => null) as (typeof map[0] | null)[];
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
