/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { clsx } from "clsx";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useState, useRef } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// Reusable stage schema so we can validate pasted/copied stage JSON independently
const stageSchema = z.object({
  stage_number: z.coerce.number().min(1),
  stage_name: z.string().min(1, "Stage Name is required"),
  distance_km: z.coerce.number().optional().default(0),
  distance_miles: z.coerce.number().optional().default(0),
  gpx: z.string().optional(),
  avg_daily_distance: z
    .array(z.record(z.string(), z.any()))
    .optional()
    .default([]),
  details: z.object({
    total_distance: z.string().optional().default(""),
    total_time: z.string().optional().default(""),
    accumulated_ascent: z.string().optional().default(""),
    accumulated_descent: z.string().optional().default(""),
    walking_surface: z.array(z.string()).optional().default([]),
    elevation_profile: z.string().optional().default(""),
    challenges: z.array(z.string()).optional().default([]),
    highlights: z.array(z.string()).optional().default([]),
  }),
  facilities: z
    .array(
      z.object({
        index: z.coerce.number().optional().default(0),
        name: z.string().optional(),
        distance: z.string().optional(),
        services: z.array(z.string()).optional().default([]),
      }),
    )
    .optional()
    .default([]),
  accommodations: z
    .array(
      z.object({
        name: z.string().optional().default(""),
        price_category: z.string().optional().default(""),
        contact_url: z.string().optional(),
        contact_phone: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

// Zod Schema matching the complex JSON structure
const routeSchema = z.object({
  route_id: z.string().min(1, "Route ID is required"),
  route_name: z.string().min(1, "Route Name is required"),
  stages: z.array(stageSchema).optional().default([]),
});

type RouteFormValues = z.infer<typeof routeSchema>;

export default function RouteForm() {
  const [submissionStatus, setSubmissionStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [result, setResult] = useState<any>(null);
  const [jsonInput, setJsonInput] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<RouteFormValues>({
    resolver: zodResolver(routeSchema) as any,
    defaultValues: {
      route_id: "",
      route_name: "",
      stages: [],
    },
  });

  const {
    fields: stageFields,
    append: appendStage,
    remove: removeStage,
  } = useFieldArray({
    control,
    name: "stages",
  });

  // Import JSON from textarea into form values
  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(jsonInput || "{}");
      setJsonError(null);
      setValue("route_id", parsed.route_id || "");
      setValue("route_name", parsed.route_name || "");
      if (Array.isArray(parsed.stages)) {
        setValue("stages", parsed.stages);
      }
    } catch (err) {
      setJsonError("Invalid JSON. Please fix and try again.");
    }
  };

  // Modal state for paste action (per-stage replace or append when index === null)
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteModalIndex, setPasteModalIndex] = useState<number | null>(null);
  const [pasteModalText, setPasteModalText] = useState<string>("");
  const [pasteModalError, setPasteModalError] = useState<string | null>(null);

  const openPasteModal = async (index: number | null = null) => {
    setPasteModalIndex(index);
    setPasteModalError(null);
    try {
      const txt = await navigator.clipboard.readText();
      setPasteModalText(txt || "");
    } catch (err) {
      setPasteModalText("");
    }
    setPasteModalOpen(true);
  };

  const closePasteModal = () => {
    setPasteModalOpen(false);
    setPasteModalText("");
    setPasteModalError(null);
    setPasteModalIndex(null);
  };

  const applyPasteModal = () => {
    try {
      const parsed = JSON.parse(pasteModalText || "{}");

      if (
        pasteModalIndex === null &&
        !Object.prototype.hasOwnProperty.call(parsed, "stage_number")
      ) {
        // appending - assign next stage number if missing
        parsed.stage_number = stageFields.length + 1;
      }

      if (
        pasteModalIndex !== null &&
        !Object.prototype.hasOwnProperty.call(parsed, "stage_number")
      ) {
        const existing = getValues(`stages.${pasteModalIndex}`) as any;
        parsed.stage_number = existing?.stage_number ?? pasteModalIndex + 1;
      }

      const validated = stageSchema.parse(parsed);

      if (pasteModalIndex === null) {
        appendStage(validated as any);
      } else {
        setValue(`stages.${pasteModalIndex}`, validated as any);
      }

      closePasteModal();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Invalid JSON or stage data";
      setPasteModalError("Invalid stage JSON. " + msg);
    }
  };

  const onSubmit = async (data: RouteFormValues) => {
    setSubmissionStatus("loading");
    setResult(null);

    try {
      // Transform data to ensure avg_daily_distance keys are dynamic (e.g. avg_daily_distance_1)
      const transformedData = {
        ...data,
        stages: data.stages.map((stage) => ({
          ...stage,
          avg_daily_distance: stage.avg_daily_distance.map((item: any, idx) => {
            // If the user pasted JSON, it might already have the keys.
            // But if coming from our new form inputs, it might be in a temporary 'range_value' field.
            // We need to support both or standardize.
            // Let's assume we map 'range_value' to the dynamic key if it exists, otherwise leave as is.
            const rangeValue =
              item.range_value || item[`avg_daily_distance_${idx + 1}`];
            const keyName = `avg_daily_distance_${idx + 1}`;

            // Remove the temp key and old dynamic keys to avoid duplication if re-saving
            const { range_value, ...rest } = item;
            // Also need to clean up any potential old keys if index changed?
            // For simplicity, we construct a new object with the correct key.
            const cleanRest = Object.fromEntries(
              Object.entries(rest).filter(
                ([k]) => !k.startsWith("avg_daily_distance_"),
              ),
            );

            return {
              [keyName]: rangeValue,
              ...cleanRest,
            };
          }),
        })),
      };

      const res = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transformedData),
      });
      const resultData = await res.json();
      if (res.ok) {
        setSubmissionStatus("success");
        setResult(resultData);
      } else {
        setSubmissionStatus("error");
        setResult(resultData);
      }
    } catch (e) {
      setSubmissionStatus("error");
      setResult({ error: "Network or parsing error" });
    }
  };

  const handleJsonPaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // keep the textarea value synchronized (legacy handler kept for typing)
    setJsonInput(e.target.value);
  };

  return (
    <div className="space-y-8">
      {/* Quick Import JSON */}
      <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
        <label className="block text-sm font-medium text-cyan-300 mb-2">
          Paste route JSON to populate form (route-level JSON)
        </label>
        <textarea
          value={jsonInput}
          onChange={handleJsonPaste}
          className="w-full h-24 bg-slate-900 border border-slate-600 rounded p-2 text-xs font-mono text-slate-300 focus:ring-1 focus:ring-cyan-500 outline-none"
          placeholder='{"route_id": "...", "stages": [...]}'
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={handleImportJson}
            className="px-3 py-1 bg-cyan-600 text-white rounded text-sm"
          >
            Import JSON
          </button>
          <button
            type="button"
            onClick={() => {
              setJsonInput("");
              setJsonError(null);
            }}
            className="px-3 py-1 bg-slate-700 text-slate-200 rounded text-sm"
          >
            Clear
          </button>
          {clipboardMessage && (
            <div className="text-xs text-emerald-300">{clipboardMessage}</div>
          )}
          {clipboardError && (
            <div className="text-xs text-red-400">{clipboardError}</div>
          )}
        </div>
        {jsonError && <p className="text-red-400 text-xs mt-2">{jsonError}</p>}
      </div>

      <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            label="Route ID"
            error={errors.route_id?.message}
            {...register("route_id")}
          />
          <Input
            label="Route Name"
            error={errors.route_name?.message}
            {...register("route_name")}
          />
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-700 pb-2">
            <h2 className="text-xl font-bold text-white">Stages2</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  appendStage({
                    stage_number: stageFields.length + 1,
                    stage_name: "",
                    distance_km: 0,
                    distance_miles: 0,
                    gpx: "",
                    avg_daily_distance: [],
                    details: {
                      total_distance: "",
                      total_time: "",
                      accumulated_ascent: "",
                      accumulated_descent: "",
                      walking_surface: [],
                      elevation_profile: "",
                      challenges: [],
                      highlights: [],
                    },
                    facilities: [],
                    accommodations: [],
                  })
                }
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm transition-colors"
              >
                <Plus size={16} /> Add Stage
              </button>

              <button
                type="button"
                onClick={() => openPasteModal(null)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors"
              >
                Paste Stage
              </button>
            </div>
          </div>
          {clipboardError && (
            <div className="text-xs text-red-400 mt-2">{clipboardError}</div>
          )}

          <div className="space-y-6">
            {stageFields.map((field, index) => (
              <StageItem
                key={field.id}
                index={index}
                control={control}
                register={register}
                remove={() => removeStage(index)}
                errors={errors}
                getValues={getValues}
                setValue={setValue}
                openPasteModal={openPasteModal}
              />
            ))}
            {stageFields.length === 0 && (
              <p className="text-center text-slate-500 py-8 italic">
                No stages added yet.
              </p>
            )}
          </div>
        </div>

        <div className="pt-6 border-t border-slate-700">
          <button
            type="submit"
            disabled={submissionStatus === "loading"}
            className="w-full py-4 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-900/20 transform transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submissionStatus === "loading" ? "Saving..." : "Save Route"}
          </button>
        </div>

        {result && (
          <div
            className={cn(
              "p-4 rounded-lg border font-mono text-sm overflow-auto max-h-60",
              submissionStatus === "success"
                ? "bg-emerald-900/20 border-emerald-500/50 text-emerald-300"
                : "bg-red-900/20 border-red-500/50 text-red-300",
            )}
          >
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
        {/* Paste Modal */}
        {pasteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={closePasteModal}
            />
            <div className="relative bg-slate-900 p-6 rounded-lg w-full max-w-2xl z-10">
              <h3 className="text-lg font-semibold text-white mb-2">
                Paste Stage JSON
              </h3>
              <textarea
                value={pasteModalText}
                onChange={(e) => setPasteModalText(e.target.value)}
                className="w-full h-48 bg-slate-800 border border-slate-700 rounded p-2 text-sm font-mono text-slate-200 focus:ring-1 focus:ring-cyan-500 outline-none"
              />
              {pasteModalError && (
                <p className="text-red-400 text-sm mt-2">{pasteModalError}</p>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={closePasteModal}
                  className="px-3 py-1 bg-slate-700 text-slate-200 rounded text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyPasteModal}
                  className="px-3 py-1 bg-cyan-600 text-white rounded text-sm"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

// Sub-components to keep things clean

function StageItem({
  index,
  control,
  register,
  remove,
  errors,
  getValues,
  setValue,
  openPasteModal,
}: any) {
  const [isOpen, setIsOpen] = useState(true);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [localPasteError, setLocalPasteError] = useState<string | null>(null);

  // Field arrays for nested lists
  const {
    fields: surfaceFields,
    append: appendSurface,
    remove: removeSurface,
  } = useFieldArray({
    control,
    name: `stages.${index}.details.walking_surface`,
  });

  // Since walking_surface is array of strings, useFieldArray might be tricky with simple strings
  // but we can wrap them or handle manual array management.
  // Actually simpler: standard array of strings is hard with useFieldArray which expects objects with 'id'.
  // We'll use a custom component for string arrays.

  return (
    <div className="bg-slate-800/30 border border-slate-700 rounded-xl overflow-hidden">
      <div
        className="bg-slate-800 p-4 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4">
          <span className="bg-slate-700 text-slate-300 w-8 h-8 flex items-center justify-center rounded-full font-bold">
            {index + 1}
          </span>
          <h3 className="font-semibold text-slate-200">Stage {index + 1}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              remove();
            }}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
          >
            <Trash2 size={16} />
          </button>

          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const stage =
                  typeof getValues === "function"
                    ? getValues(`stages.${index}`)
                    : undefined;
                const sanitized = JSON.parse(JSON.stringify(stage || {}));
                delete sanitized.id;
                delete sanitized._id;
                delete sanitized.route_id;
                delete sanitized.routeId;
                await navigator.clipboard.writeText(JSON.stringify(sanitized));
                setCopyStatus("Copied");
                setTimeout(() => setCopyStatus(null), 2000);
              } catch (err) {
                setCopyStatus("Copy failed");
                setTimeout(() => setCopyStatus(null), 2000);
              }
            }}
            className="p-2 text-slate-400 hover:text-cyan-300 hover:bg-slate-700 rounded transition-colors"
          >
            Copy
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openPasteModal?.(index);
            }}
            className="p-2 text-slate-400 hover:text-cyan-300 hover:bg-slate-700 rounded transition-colors"
          >
            Paste
          </button>

          {copyStatus && (
            <span className="text-xs text-emerald-300">{copyStatus}</span>
          )}
          {localPasteError && (
            <span className="text-xs text-red-400">{localPasteError}</span>
          )}

          {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </div>

      {isOpen && (
        <div className="p-6 space-y-6">
          {/* Basic Stage Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              label="Stage Name"
              {...register(`stages.${index}.stage_name`)}
            />
            <Input
              label="Stage Number"
              type="number"
              {...register(`stages.${index}.stage_number`)}
            />
            <Input
              label="Distance (km)"
              type="number"
              step="0.1"
              {...register(`stages.${index}.distance_km`)}
            />
            <Input
              label="Distance (mi)"
              type="number"
              step="0.1"
              {...register(`stages.${index}.distance_miles`)}
            />
            <Input label="GPX File Name" {...register(`stages.${index}.gpx`)} />
          </div>
          {/* Details Section */}
          <div className="bg-slate-900/50 p-4 rounded-lg space-y-4">
            <h4 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">
              Details
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Total Distance String"
                {...register(`stages.${index}.details.total_distance`)}
              />
              <Input
                label="Total Time"
                {...register(`stages.${index}.details.total_time`)}
              />
              <Input
                label="Elevation Profile"
                {...register(`stages.${index}.details.elevation_profile`)}
              />
              <Input
                label="Ascent"
                {...register(`stages.${index}.details.accumulated_ascent`)}
              />
              <Input
                label="Descent"
                {...register(`stages.${index}.details.accumulated_descent`)}
              />
            </div>

            <StringArrayInput
              control={control}
              name={`stages.${index}.details.walking_surface`}
              label="Walking Surface"
            />
            <StringArrayInput
              control={control}
              name={`stages.${index}.details.challenges`}
              label="Challenges"
            />
            <StringArrayInput
              control={control}
              name={`stages.${index}.details.highlights`}
              label="Highlights"
            />
          </div>
          {/* Avg Daily Distance Section */}
          <AvgDailyDistanceInput
            control={control}
            stageIndex={index}
            register={register}
          />
          {/* Facilities Section */}
          <FacilitiesInput
            control={control}
            stageIndex={index}
            register={register}
          />
          {/* Accommodations Section */}
          <AccommodationsInput
            control={control}
            stageIndex={index}
            register={register}
          />
        </div>
      )}
    </div>
  );
}

function FacilitiesInput({ control, stageIndex, register }: any) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `stages.${stageIndex}.facilities`,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">
          Facilities
        </h4>
        <button
          type="button"
          onClick={() => append({ index: fields.length + 1, services: [] })}
          className="text-xs bg-slate-700 px-2 py-1 rounded text-cyan-300 flex items-center gap-1 hover:bg-slate-600"
        >
          <Plus size={12} /> Add Facility
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {fields.map((field, k) => (
          <div
            key={field.id}
            className="bg-slate-900 p-3 rounded border border-slate-700 relative group"
          >
            <button
              type="button"
              onClick={() => remove(k)}
              className="absolute top-2 right-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={14} />
            </button>
            <div className="space-y-2">
              <Input
                label="Index"
                type="number"
                {...register(`stages.${stageIndex}.facilities.${k}.index`)}
              />
              <ServicesSelectInput
                control={control}
                name={`stages.${stageIndex}.facilities.${k}.services`}
                label="Services"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccommodationsInput({ control, stageIndex, register }: any) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `stages.${stageIndex}.accommodations`,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">
          Accommodations
        </h4>
        <button
          type="button"
          onClick={() => append({ name: "", price_category: "$" })}
          className="text-xs bg-slate-700 px-2 py-1 rounded text-cyan-300 flex items-center gap-1 hover:bg-slate-600"
        >
          <Plus size={12} /> Add Hotel
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {fields.map((field, k) => (
          <div
            key={field.id}
            className="bg-slate-900 p-3 rounded border border-slate-700 relative group"
          >
            <button
              type="button"
              onClick={() => remove(k)}
              className="absolute top-2 right-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={14} />
            </button>
            <div className="space-y-2">
              <Input
                label="Name"
                {...register(`stages.${stageIndex}.accommodations.${k}.name`)}
              />
              <Input
                label="Price ($)"
                {...register(
                  `stages.${stageIndex}.accommodations.${k}.price_category`,
                )}
              />
              <Input
                label="URL"
                {...register(
                  `stages.${stageIndex}.accommodations.${k}.contact_url`,
                )}
              />
              <Input
                label="Phone"
                {...register(
                  `stages.${stageIndex}.accommodations.${k}.contact_phone`,
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper for array of strings (using a single comma separated input for simplicity or better UI?
// Let's do simple tag-like input or just text inputs.
// For complexity reduction, multiple text inputs with add button.)
function StringArrayInput({ control, name, label, simple = false }: any) {
  // We need to use Controller or just manage it.
  // Since useFieldArray expects objects, we can't easily use it for primitive arrays [string, string].
  // So we'll use a Controller that renders a custom list component.
  return (
    <Controller
      control={control}
      name={name}
      defaultValue={[]}
      render={({ field: { value = [], onChange } }) => (
        <div
          className={
            simple ? "" : "bg-slate-950/30 p-3 rounded border border-slate-800"
          }
        >
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-400 uppercase">
              {label}
            </label>
            <button
              type="button"
              onClick={() => onChange([...value, ""])}
              className="text-cyan-500 hover:text-cyan-400"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-2">
            {value.map((item: string, i: number) => (
              <div key={i} className="flex gap-2">
                <input
                  value={item}
                  onChange={(e) => {
                    const newValue = [...value];
                    newValue[i] = e.target.value;
                    onChange(newValue);
                  }}
                  className="flex-1 bg-slate-800 border-b border-transparent focus:border-cyan-500 outline-none text-sm text-slate-200 px-2 py-1"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newValue = value.filter(
                      (_: any, idx: number) => idx !== i,
                    );
                    onChange(newValue);
                  }}
                  className="text-slate-600 hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    />
  );
}

const SERVICE_OPTIONS = [
  "Shop",
  "ATM",
  "Food_Drink",
  "Camino_Stamp",
  "Hotel",
  "Guest_House",
  "Supermarket",
  "Campsite",
  "Albergue",
  "Pharmacy",
  // "Blank_Space",
];

function ServicesSelectInput({ control, name, label }: any) {
  const selectRef = useRef<HTMLSelectElement | null>(null);

  return (
    <Controller
      control={control}
      name={name}
      defaultValue={[]}
      render={({ field: { value = [], onChange } }) => {
        const availableOptions = SERVICE_OPTIONS.filter(
          (opt) => !value.includes(opt),
        );
        const canAdd = availableOptions.length > 0;

        return (
          <div className="bg-slate-950/30 p-3 rounded border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-400 uppercase">
                {label}
              </label>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <select
                ref={selectRef}
                defaultValue={availableOptions[0] || ""}
                disabled={!canAdd}
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              >
                {canAdd ? (
                  availableOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.replace(/_/g, " ")}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>
                    All services added
                  </option>
                )}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!canAdd) return;
                  const chosen =
                    selectRef.current?.value || availableOptions[0];
                  const next = [...value, chosen];
                  onChange(next);
                }}
                className="text-cyan-500 hover:text-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!canAdd}
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-2">
              {value.map((item: string, i: number) => (
                <div key={`${item}-${i}`} className="flex items-center gap-2">
                  <input
                    value={item.replace(/_/g, " ")}
                    readOnly
                    className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onChange(
                        value.filter((_: unknown, idx: number) => idx !== i),
                      )
                    }
                    className="text-slate-600 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      }}
    />
  );
}

function Input({ label, error, className, ...props }: any) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
        {label}
      </label>
      <input
        className={cn(
          "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all",
          error && "border-red-500 focus:border-red-500 focus:ring-red-500",
        )}
        {...props}
      />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

function AvgDailyDistanceInput({ control, stageIndex, register }: any) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `stages.${stageIndex}.avg_daily_distance`,
  });

  return (
    <div className="bg-slate-900/50 p-4 rounded-lg space-y-3 border border-slate-700">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">
          Avg Daily Distance
        </h4>
        <button
          type="button"
          onClick={() =>
            append({
              range_value: "",
              minimum_km: 0,
              minimum_mile: 0,
              maximum_km: 0,
              maximum_mile: 0,
              days: 0,
            })
          }
          className="text-xs bg-slate-700 px-2 py-1 rounded text-cyan-300 flex items-center gap-1 hover:bg-slate-600"
        >
          <Plus size={12} /> Add Distance Metric
        </button>
      </div>
      <div className="space-y-4">
        {fields.map((field, k) => (
          <div
            key={field.id}
            className="bg-slate-950 p-3 rounded border border-slate-800 relative group"
          >
            <div className="absolute -left-3 top-2 bg-slate-800 text-xs rounded-full w-5 h-5 flex items-center justify-center border border-slate-600">
              {k + 1}
            </div>
            <button
              type="button"
              onClick={() => remove(k)}
              className="absolute top-2 right-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={14} />
            </button>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="col-span-1 md:col-span-2 lg:col-span-3">
                <Input
                  label={`Distance Range (Label for _${k + 1})`}
                  placeholder="e.g. 10-16km/6.2-10mi"
                  {...register(
                    `stages.${stageIndex}.avg_daily_distance.${k}.range_value`,
                  )}
                />
              </div>
              <Input
                label="Min KM"
                type="number"
                step="0.1"
                {...register(
                  `stages.${stageIndex}.avg_daily_distance.${k}.minimum_km`,
                )}
              />
              <Input
                label="Min Mile"
                type="number"
                step="0.1"
                {...register(
                  `stages.${stageIndex}.avg_daily_distance.${k}.minimum_mile`,
                )}
              />
              <Input
                label="Max KM"
                type="number"
                step="0.1"
                {...register(
                  `stages.${stageIndex}.avg_daily_distance.${k}.maximum_km`,
                )}
              />
              <Input
                label="Max Mile"
                type="number"
                step="0.1"
                {...register(
                  `stages.${stageIndex}.avg_daily_distance.${k}.maximum_mile`,
                )}
              />
              <Input
                label="Days"
                type="number"
                {...register(
                  `stages.${stageIndex}.avg_daily_distance.${k}.days`,
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
