/* eslint-disable */
"use client";

import React from "react";
import { CheckCircle2, Pin, Split, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PhotoStub } from "./LibComponents";
import { ASSET_KIND, ASSET_KIND_LABEL } from "../data";

// ----------------------------
// Components
// ----------------------------

export function FaceInspector({ inspector, faces, refs, onSelect, onExclude, onPin, onSplit }: { inspector: any; faces: any[]; refs: any; onSelect: (bucket: string, id: string) => void; onExclude: (id: string, val: boolean) => void; onPin: (id: string, val: boolean) => void; onSplit: (id: string) => void }) {
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

export function AssetInspector({ asset, people, onOpenPerson }: { asset: any; people: any[]; onOpenPerson: (id: string) => void }) {
    if (!asset) return <div className="text-muted-foreground">Asset not found.</div>;
    const label = ASSET_KIND_LABEL[asset.kind as keyof typeof ASSET_KIND_LABEL] || asset.kind;
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
                {(asset.tags || []).slice(0, 8).map((t: string) => (
                    <Badge key={t} variant="secondary" className="rounded-xl">{t}</Badge>
                ))}
            </div>

            {hasPeople ? (
                <>
                    <Separator />
                    <div className="text-sm font-medium">People detected in this asset</div>
                    <div className="flex flex-col gap-2">
                        {asset.people.map((pid: string) => {
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

export function Inspector({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
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
