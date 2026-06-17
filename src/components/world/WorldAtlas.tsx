"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { MapIcon, PlusIcon, TrashIcon, CloseIcon } from "@/components/ui/icons";
import {
  useActiveCampaign,
  useDataProvider,
  useMaps,
} from "@/lib/data/hooks";
import { newId } from "@/lib/domain/ids";
import type { MapLocation } from "@/lib/domain/types";

const inputClass =
  "w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40";

export function WorldAtlas() {
  const { items: maps, update } = useMaps();
  const { capabilities } = useDataProvider();
  const { role } = useActiveCampaign();
  const isDM = !capabilities.multiUser || role === "dm";

  const [mapId, setMapId] = useState("");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const map = maps.find((m) => m.id === mapId) ?? maps[0] ?? null;
  const locations = map?.locations ?? [];
  const sel = locations.find((l) => l.id === selected) ?? null;

  function setLocations(next: MapLocation[]) {
    if (map) void update(map.id, { locations: next });
  }

  function onSurfaceClick(e: React.MouseEvent) {
    if (!adding || !map || !surfaceRef.current) return;
    const r = surfaceRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    const loc: MapLocation = {
      id: newId(),
      name: "New location",
      description: "",
      x,
      y,
    };
    setLocations([...locations, loc]);
    setSelected(loc.id);
    setAdding(false);
  }

  if (maps.length === 0) {
    return (
      <Panel tone="flat">
        <div className="py-8 text-center">
          <MapIcon className="mx-auto h-10 w-10 text-ink-faint" />
          <p className="mt-3 text-sm text-ink-soft">
            No maps yet. Add a map image in the{" "}
            <Link href="/codex" className="font-semibold text-brass-dark hover:underline">
              Codex
            </Link>{" "}
            and it&apos;ll appear here as an overworld you can pin.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Atlas map"
          value={map?.id ?? ""}
          onChange={(e) => {
            setMapId(e.target.value);
            setSelected(null);
            setAdding(false);
          }}
          className="h-9 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none"
        >
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {isDM && (
          <Button
            size="sm"
            variant={adding ? "primary" : "secondary"}
            onClick={() => setAdding((a) => !a)}
          >
            <PlusIcon className="h-4 w-4" />
            {adding ? "Click the map…" : "Add pin"}
          </Button>
        )}
        <span className="text-xs text-ink-faint">
          {locations.length} location{locations.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_18rem]">
        <div
          ref={surfaceRef}
          onClick={onSurfaceClick}
          className={cn(
            "relative aspect-[4/3] w-full overflow-hidden rounded-card border-2 border-parchment-400/70 bg-leather",
            adding && "cursor-crosshair",
          )}
          style={
            map?.imageUrl
              ? {
                  backgroundImage: `url(${map.imageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          {!map?.imageUrl && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-parchment-300/80">
              This map has no image yet — add one in the Codex. You can still drop
              pins.
            </div>
          )}
          {locations.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelected(l.id);
              }}
              style={{ left: `${l.x}%`, top: `${l.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              title={l.name}
            >
              <span
                className={cn(
                  "block h-4 w-4 rounded-full border-2 border-parchment-50 shadow-raised transition-transform hover:scale-125",
                  selected === l.id ? "bg-brass" : "bg-oxblood",
                )}
              />
              <span className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap rounded bg-ink/80 px-1.5 py-0.5 text-[0.6rem] font-semibold text-parchment-50">
                {l.name}
              </span>
            </button>
          ))}
        </div>

        {/* Selected location editor */}
        <div>
          {sel ? (
            <div className="surface-raised p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-brass-dark">
                  Location
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close"
                  className="rounded p-1 text-ink-faint hover:text-ink"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
              {isDM ? (
                <>
                  <input
                    defaultValue={sel.name}
                    key={`name-${sel.id}`}
                    onBlur={(e) =>
                      setLocations(
                        locations.map((l) =>
                          l.id === sel.id ? { ...l, name: e.target.value } : l,
                        ),
                      )
                    }
                    className={cn(inputClass, "font-semibold")}
                    aria-label="Location name"
                  />
                  <textarea
                    defaultValue={sel.description}
                    key={`desc-${sel.id}`}
                    onBlur={(e) =>
                      setLocations(
                        locations.map((l) =>
                          l.id === sel.id
                            ? { ...l, description: e.target.value }
                            : l,
                        ),
                      )
                    }
                    rows={4}
                    placeholder="Describe this place…"
                    className={cn(inputClass, "mt-2 resize-y")}
                    aria-label="Location description"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setLocations(locations.filter((l) => l.id !== sel.id));
                      setSelected(null);
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-oxblood/40 px-3 py-1.5 text-xs font-semibold text-oxblood hover:bg-oxblood hover:text-parchment-50"
                  >
                    <TrashIcon className="h-4 w-4" /> Remove pin
                  </button>
                </>
              ) : (
                <>
                  <h3 className="font-display text-lg font-bold text-ink">
                    {sel.name}
                  </h3>
                  {sel.description && (
                    <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">
                      {sel.description}
                    </p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="surface-parchment p-4 text-sm text-ink-faint">
              {isDM
                ? "Add a pin, then click it to name and describe the place."
                : "Click a pin to read about a location."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
