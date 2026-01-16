/* eslint-disable */
"use client";

import React from "react";
import { CheckCircle2, Pin, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarTile, CoverageDots, MiniBar, PhotoStub } from "./LibComponents";
import { ANGLE_BUCKETS, ASSET_KIND, ASSET_KIND_LABEL, STATUS } from "../data";
import { UMK_BASE_URL } from "../api";

// ----------------------------
// Helpers
// ----------------------------
function confidenceLabel(x: number) {
    if (x >= 0.9) return { label: "High", variant: "default" as const };
    if (x >= 0.8) return { label: "Medium", variant: "secondary" as const };
    return { label: "Low", variant: "destructive" as const };
}

function angleCoverageScore(coverage: any) {
    const total = ANGLE_BUCKETS.length;
    const got = ANGLE_BUCKETS.reduce((acc, b) => acc + (coverage?.[b.key] ? 1 : 0), 0);
    return { got, total };
}

// ----------------------------
// Components
// ----------------------------

export function PersonCard({ person, selected, onOpen, onSelect }: { person: any; selected: boolean; onOpen: (id: string) => void; onSelect: (id: string) => void }) {
    const c = confidenceLabel(person.confidence);
    const cov = angleCoverageScore(person.coverage);

    const coverUrl = person.cover_face_relpath ? `${UMK_BASE_URL}/files/${person.cover_face_relpath}` : undefined;

    return (
        <Card
            className={"rounded-3xl ring-1 cursor-pointer " + (selected ? "ring-foreground/30" : "ring-black/5")}
            onClick={() => onOpen(person.id)}
        >
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <AvatarTile
                        id={person.id}
                        name={person.name || person.display_name}
                        sub={`${person.faces_count || person.faces} faces • ${person.assets_count || person.assets} assets`}
                        size={52}
                        photoSeed={person.coverSeed || person.id}
                        src={coverUrl}
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
                        {person.tags.slice(0, 3).map((t: string) => (
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

export function FaceThumb({ face, selected, onClick }: { face: any; selected: boolean; onClick: () => void }) {
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

export function AssetCard({ asset, view, onClick }: { asset: any; view: "grid" | "list"; onClick: () => void }) {
    const label = ASSET_KIND_LABEL[asset.kind as keyof typeof ASSET_KIND_LABEL] || asset.kind;
    const hasPeople = asset.kind === ASSET_KIND.PERSON && asset.people?.length;
    const dateStr = new Date(asset.created_at || asset.createdAt || Date.now()).toLocaleDateString();

    // Construct image URL
    // Backend mount relative path "library/assets/..." at "/files/"
    // So full URL: UMK_BASE_URL + "/files/" + asset.storage_relpath
    const imageUrl = asset.storage_relpath ? `${UMK_BASE_URL}/files/${asset.storage_relpath}` : null;
    const isImage = (asset.filename || "").match(/\.(jpg|jpeg|png|webp|gif)$/i);

    if (view === "list") {
        return (
            <button
                onClick={onClick}
                className="rounded-2xl ring-1 ring-black/5 bg-muted/20 hover:bg-muted/30 transition px-3 py-2 text-left w-full h-full"
            >
                <div className="flex items-center gap-3">
                    <div className="w-16 h-12 rounded-2xl overflow-hidden ring-1 ring-black/5 flex-shrink-0 relative">
                        {imageUrl && isImage ? (
                            <img src={imageUrl} alt={asset.filename} className="w-full h-full object-cover" />
                        ) : (
                            <PhotoStub seed={asset.id} label={""} />
                        )}
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
                        <Badge variant="secondary" className="rounded-xl">{dateStr}</Badge>
                    </div>
                </div>
            </button>
        );
    }

    return (
        <Card className="rounded-3xl ring-1 ring-black/5 hover:ring-foreground/20 transition cursor-pointer" onClick={onClick}>
            <CardContent className="p-3">
                <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 relative bg-muted/10">
                    <div className="aspect-[4/3]">
                        {imageUrl && isImage ? (
                            <img src={imageUrl} alt={asset.filename} className="w-full h-full object-cover" />
                        ) : (
                            <PhotoStub seed={asset.id} label={label} />
                        )}
                    </div>
                </div>
                <div className="mt-3">
                    <div className="text-sm font-medium truncate">{asset.filename}</div>
                    <div className="text-xs text-muted-foreground truncate">{asset.source}</div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        {hasPeople ? (
                            asset.people.slice(0, 2).map((pid: string) => (
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
                    <div className="text-xs text-muted-foreground">{dateStr}</div>
                </div>
            </CardContent>
        </Card>
    );
}
