/* eslint-disable */
"use client";

import React, { useMemo } from "react";
import { ANGLE_BUCKETS, clamp, hashColor } from "../data";

// ----------------------------
// Small Components
// ----------------------------

export function PhotoStub({ seed, label, src }: { seed: string; label?: string; src?: string }) {
    const bg = useMemo(() => hashColor(seed), [seed]);

    if (src) {
        return (
            <div className="relative overflow-hidden ring-1 ring-black/5 bg-muted/20 w-full h-full group">
                <img src={src} className="w-full h-full object-cover" alt={label || "cover"} />
                {label ? (
                    <div className="absolute bottom-2 left-2 text-[11px] px-2 py-0.5 rounded-xl bg-background/70 ring-1 ring-black/5 backdrop-blur-md">
                        {label}
                    </div>
                ) : null}
            </div>
        )
    }

    return (
        <div
            className="relative overflow-hidden ring-1 ring-black/5 bg-muted/20 w-full h-full"
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

export function AvatarTile({ id, name, size = 56, sub = "", photoSeed, src }: { id: string; name: string; size?: number; sub?: string; photoSeed?: string; src?: string }) {
    return (
        <div className="flex items-center gap-3">
            <div
                className="rounded-2xl shadow-sm ring-1 ring-black/10 overflow-hidden flex-shrink-0"
                style={{ width: size, height: size }}
                title={id}
            >
                <PhotoStub seed={photoSeed || id} src={src} />
            </div>
            <div className="min-w-0">
                <div className="font-medium truncate">{name}</div>
                {sub ? <div className="text-xs text-muted-foreground truncate">{sub}</div> : null}
            </div>
        </div>
    );
}

export function CoverageDots({ coverage }: { coverage: Record<string, boolean> }) {
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

export function MiniBar({ value }: { value: number }) {
    const pct = clamp(Math.round(value * 100), 0, 100);
    return (
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-foreground/80" style={{ width: `${pct}%` }} />
        </div>
    );
}

export function StatPill({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
    return (
        <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 ring-1 ring-black/5">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-sm font-medium ml-auto">{value}</div>
        </div>
    );
}
