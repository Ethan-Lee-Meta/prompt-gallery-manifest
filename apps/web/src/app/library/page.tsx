/* eslint-disable */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Upload,
    AlertTriangle,
    Images,
    Users,
    CheckCircle2,
    Sparkles,
    Copy,
    FolderOpen,
    ShieldCheck,
    Grid3X3,
    List,
    Filter,
    Merge,
    Tag,
    Trash2,
    XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

import {
    ANGLE_BUCKETS,
    ASSET_KIND,
    ASSET_KIND_LABEL,
    STATUS,
    autoPickReferences,
    clamp,
    deriveCoverageFromRefs,
    makeMockFaces,
    pick,
    randInt,
} from "./data";

import { api, UMK_BASE_URL } from "./api"; // Imported API helper

import { AvatarTile, StatPill } from "./components/LibComponents";
import { AngleMatrix, EmptyState, SectionTitle, Sidebar, Toolbar } from "./components/Layouts";
import { AssetCard, FaceThumb, PersonCard } from "./components/Cards";
import { AssetInspector, FaceInspector, Inspector } from "./components/Inspectors";


// ----------------------------
// Client Logic
// ----------------------------

export default function LibraryPage() {

    // Local Agent status
    const [agentStatus, setAgentStatus] = useState("unknown"); // unknown | online | offline

    // Data state
    const [people, setPeople] = useState<any[]>([]);
    const [assets, setAssets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [uploads, setUploads] = useState<any[]>([]);

    const [settings, setSettings] = useState({
        matchThreshold: 0.32,
        strictness: 0.58,
        minFaceSize: 80,
        prepareBeforeOpen: true,
    });

    // Navigation & Search State
    const [route, setRoute] = useState("assets"); // "uploads" | "assets" | "people" | "person" | "review" | "settings"
    const [query, setQuery] = useState("");

    // Initial Fetch
    useEffect(() => {
        let mounted = true;
        Promise.all([
            api.ping().then(() => "online").catch(() => "offline"),
            api.listAssets("all"),
            api.listPeople()
        ]).then(([status, assetsData, peopleData]) => {
            if (!mounted) return;
            setAgentStatus(status);
            // Map API assets to internal format if needed
            // For MVP, API returns standard objects. 
            // We need to ensure 'people' array on assets exists for filtering.
            const mappedAssets = assetsData.map((a: any) => ({
                ...a,
                people: [], // TODO: backend should return people IDs associated with asset
                tags: [] // TODO: backend tags
            }));
            setAssets(mappedAssets);
            setPeople(peopleData.map((p: any) => ({
                ...p,
                name: p.display_name, // Mapping
                createdAt: p.created_at || Date.now(),
                assets: p.assets_count || 0,
                faces: p.faces_count || 0
            })));
            setLoading(false);
        }).catch(err => {
            console.error("Failed to load library data", err);
            setLoading(false);
        });

        return () => { mounted = false; };
    }, []);

    // Assets UI
    const [assetsView, setAssetsView] = useState<"grid" | "list">("grid");
    const [assetsKindFilter, setAssetsKindFilter] = useState("all");

    const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
    const [activePersonId, setActivePersonId] = useState<string | null>(null);
    const [activeBucket, setActiveBucket] = useState("frontal");
    const [inspector, setInspector] = useState<any>(null); // {type, data}

    // Face instances per person
    const [facesByPerson, setFacesByPerson] = useState<Record<string, any[]>>(() => {
        const map: Record<string, any[]> = {};
        for (const p of people) {
            const pAssets = assets.filter((a) => a.kind === ASSET_KIND.PERSON && a.people.includes(p.id)).map((a) => a.id);
            map[p.id] = makeMockFaces(p.id, pAssets.length ? pAssets : assets.map((a) => a.id));
        }
        return map;
    });

    // Reference selections per person: bucket -> faceId
    const [refsByPerson, setRefsByPerson] = useState<Record<string, Record<string, string>>>(() => {
        const map: Record<string, Record<string, string>> = {};
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
        // @ts-ignore
        return arr.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.quality - a.quality);
    }, [activeFaces, activeBucket]);

    const filteredPeople = useMemo(() => {
        const q = query.trim().toLowerCase();
        let list = people.slice();
        if (q) {
            list = list.filter((p) => [p.id, p.name, ...(p.tags || [])].some((x: string) => String(x).toLowerCase().includes(q)));
        }
        if (route === "review") list = list.filter((p) => p.status !== STATUS.VERIFIED);
        return list;
    }, [people, query, route]);

    const filteredAssets = useMemo(() => {
        const q = query.trim().toLowerCase();
        let list = assets.slice();
        if (assetsKindFilter !== "all") list = list.filter((a) => a.kind === assetsKindFilter);
        if (q) {
            list = list.filter((a) => [a.id, a.filename, a.source, a.kind, ...(a.tags || []), ...(a.people || [])].some((x: string) => String(x).toLowerCase().includes(q)));
        }
        return list;
    }, [assets, query, assetsKindFilter]);

    const kindCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const a of assets) counts[a.kind] = (counts[a.kind] || 0) + 1;
        return counts;
    }, [assets]);

    function toast(title: string, body: string) {
        setInspector({ type: "toast", data: { title, body } });
    }

    function openPerson(personId: string) {
        setActivePersonId(personId);
        setRoute("person");
        setActiveBucket("frontal");
        setInspector(null);
    }

    function toggleSelectPerson(personId: string) {
        setSelectedPeople((prev) => (prev.includes(personId) ? prev.filter((x) => x !== personId) : [...prev, personId]));
    }

    async function copyFolder(personId: string) {
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

    async function openFolder(personId: string) {
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



    // ----------------------------
    // API Wrappers & Helpers
    // ----------------------------

    function pingAgent() {
        return api.ping();
    }

    function buildPersonRefsFolder(personId: string) {
        // Fallback path logic
        return `[LibraryRoot] / People / ${personId} / references`;
    }

    function getRefsFolder(personId: string) {
        return api.getRefsFolder(personId);
    }

    function openRefsFolder(personId: string, prepare: boolean) {
        return api.openRefsFolder(personId, prepare);
    }

    function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (!e.target.files) return;
        const files = Array.from(e.target.files);

        // Add to uploads list
        const newUploads = files.map(f => ({
            id: `u_${Date.now()}_${Math.random()}`,
            filename: f.name,
            state: "processing",
            createdAt: Date.now(),
            message: ""
        }));
        setUploads(prev => [...newUploads, ...prev]);

        // Process sequentially
        files.forEach(async (file, idx) => {
            const uid = newUploads[idx].id;
            try {
                const asset = await api.uploadAsset(file);
                setUploads(prev => prev.map(u => u.id === uid ? { ...u, state: "done" } : u));
                setAssets(prev => [{
                    ...asset,
                    people: [],
                    tags: []
                }, ...prev]);
                toast("Uploaded", `Asset created: ${asset.id}`);
            } catch (err: any) {
                setUploads(prev => prev.map(u => u.id === uid ? { ...u, state: "failed", message: err.message } : u));
                toast("Upload failed", err.message);
            }
        });

        e.target.value = "";
    }

    function simulateUpload() {
        document.getElementById("hidden-file-upload")?.click();
    }

    function rerunAutoSelection(personId: string) {
        const faces = facesByPerson[personId] || [];
        const picks = autoPickReferences(faces, settings.strictness);
        setRefsByPerson((prev) => ({ ...prev, [personId]: picks }));
        setPeople((prev) => prev.map((p) => (p.id === personId ? { ...p, coverage: deriveCoverageFromRefs(picks) } : p)));
    }

    function selectAsRepresentative(bucketKey: string, faceId: string) {
        if (!activePersonId) return;
        setRefsByPerson((prev) => ({ ...prev, [activePersonId]: { ...(prev[activePersonId] || {}), [bucketKey]: faceId } }));
        setPeople((prev) => prev.map((p) => (p.id === activePersonId ? { ...p, coverage: deriveCoverageFromRefs({ ...(refsByPerson[activePersonId] || {}), [bucketKey]: faceId }), coverSeed: faceId } : p)));
    }

    function excludeFace(faceId: string, value: boolean) {
        if (!activePersonId) return;
        setFacesByPerson((prev) => ({
            ...prev,
            [activePersonId]: (prev[activePersonId] || []).map((f) => (f.id === faceId ? { ...f, excluded: value } : f)),
        }));
    }

    function pinFace(faceId: string, value: boolean) {
        if (!activePersonId) return;
        setFacesByPerson((prev) => ({
            ...prev,
            [activePersonId]: (prev[activePersonId] || []).map((f) => (f.id === faceId ? { ...f, pinned: value } : f)),
        }));
    }

    function moveFaceToNewPerson(faceId: string) {
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

        setAssets((prev) => prev.map((a) => (a.kind !== ASSET_KIND.PERSON ? a : { ...a, people: a.people.map((pid: string) => (rest.includes(pid) ? target : pid)).filter((v: any, idx: any, arr: any) => arr.indexOf(v) === idx) })));

        setSelectedPeople([]);
        toast("Merged", `Merged into ${target}.`);
    }

    function markVerified(personId: string) {
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
                onUpload={handleUpload} // Change to handleUpload (implicitly accepted if type matches or we cast)
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
                                            <div key={u.id} className="flex flex-col gap-2 rounded-2xl bg-muted/30 ring-1 ring-black/5 px-3 py-2">
                                                <div className="flex items-center justify-between gap-3">
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
                                                {u.state === "failed" && u.message ? (
                                                    <div className="text-xs text-destructive break-all">{u.message}</div>
                                                ) : null}
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
                                        {ASSET_KIND_LABEL[k as keyof typeof ASSET_KIND_LABEL]} <Badge variant="secondary" className="rounded-xl ml-2">{kindCounts[k] || 0}</Badge>
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
                                                    {/* <Badge className="rounded-xl" variant="secondary">consistency {formatPct(activePerson.confidence)}</Badge> */}
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
                                                                const face = activeFaces.find((f: any) => f.id === faceId) || null;
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
                                                            // @ts-ignore
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
                                                                    {/* <ChevronRight className={"w-4 h-4 " + (is ? "text-background" : "text-muted-foreground")} /> */}
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
