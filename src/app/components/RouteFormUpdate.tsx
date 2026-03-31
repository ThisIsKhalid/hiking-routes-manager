/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { clsx } from "clsx";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  useFieldArray,
  useForm,
  type Control,
  type UseFormRegister,
  type UseFormGetValues,
  type Resolver,
  type Path,
  type UseFormWatch,
  type UseFormSetValue,
} from "react-hook-form";
import type { InputHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// Zod Schema matching the complex JSON structure
const routeSchema = z.object({
  route_id: z.string().min(1, "Route ID is required"),
  route_name: z.string().min(1, "Route Name is required"),
  // route-level average daily distance metrics (array of objects)
  avg_daily_distance: z
    .array(
      z.object({
        range_value: z.string().optional(),
        minimum_km: z.coerce.number().optional(),
        minimum_mile: z.coerce.number().optional(),
        maximum_km: z.coerce.number().optional(),
        maximum_mile: z.coerce.number().optional(),
        days: z.coerce.number().optional(),
      }),
    )
    .optional(),
  // route-level starting points
  starting_point: z
    .array(
      z.object({
        name: z.string().optional(),
        avg_distance: z.string().optional(),
        avg_daily: z.string().optional(),
        stage_number: z.coerce.number().optional(),
      }),
    )
    .optional(),
  stages: z.array(
    z.object({
      stage_number: z.coerce.number().min(1),
      stage_name: z.string().min(1, "Stage Name is required"),
      distance_km: z.coerce.number(),
      distance_miles: z.coerce.number(),
      gpx: z.string().optional(),
      // per-stage details
      details: z.object({
        total_distance: z.string(),
        total_time: z.string(),
        accumulated_ascent: z.string(),
        accumulated_descent: z.string(),
        walking_surface: z.array(z.string()),
        elevation_profile: z.string(),
        challenges: z.array(z.string()),
        highlights: z.array(z.string()),
      }),
      facilities: z.array(
        z.object({
          index: z.coerce.number(),
          name: z.string().optional(),
          distance: z.string().optional(),
          services: z.array(z.string()),
        }),
      ),
      accommodations: z.array(
        z.object({
          name: z.string(),
          price_category: z.string(),
          contact_url: z.string().optional(),
          contact_phone: z.string().optional(),
          lat: z.coerce.number().optional(),
          long: z.coerce.number().optional(),
        }),
      ),
    }),
  ),
});

export type RouteFormValues = z.infer<typeof routeSchema>;

type RouteFormUpdateProps = {
  initialData?: RouteFormValues;
  targetRouteId?: string;
  onCancel?: () => void;
  onUpdated?: (data: Record<string, unknown>) => void;
};

function normalizeInitialData(input?: RouteFormValues): RouteFormValues {
  if (!input) {
    return {
      route_id: "",
      route_name: "",
      avg_daily_distance: [],
      starting_point: [],
      stages: [],
    };
  }

  const normalizedAvgDaily = (input.avg_daily_distance || []).map((item) => {
    const record = item as Record<string, unknown>;
    const dynamicKey = Object.keys(record).find((key) =>
      key.startsWith("avg_daily_distance_"),
    );
    const dynamicLabel =
      dynamicKey && typeof record[dynamicKey] === "string"
        ? (record[dynamicKey] as string)
        : "";
    const label =
      (typeof record.label === "string" && record.label) ||
      (typeof record.range_value === "string" && record.range_value) ||
      dynamicLabel ||
      "";

    return {
      range_value: label,
      minimum_km: record.minimum_km as number | undefined,
      minimum_mile: record.minimum_mile as number | undefined,
      maximum_km: record.maximum_km as number | undefined,
      maximum_mile: record.maximum_mile as number | undefined,
      days: record.days as number | undefined,
    };
  });

  const normalizedStarting = (input.starting_point || []).map((item) => {
    const record = item as Record<string, unknown>;
    const stageNumRaw = record.stage_number as unknown;
    let stageNumber = 1;
    if (typeof stageNumRaw === "number") {
      stageNumber = stageNumRaw;
    } else if (typeof stageNumRaw === "string" && stageNumRaw.trim() !== "") {
      const parsed = Number(stageNumRaw);
      if (!Number.isNaN(parsed)) stageNumber = parsed;
    }

    return {
      name: typeof record.name === "string" ? record.name : "",
      avg_distance:
        typeof record.avg_distance === "string" ? record.avg_distance : "",
      avg_daily: typeof record.avg_daily === "string" ? record.avg_daily : "",
      stage_number: stageNumber,
    };
  });

  return {
    route_id: input.route_id || "",
    route_name: input.route_name || "",
    avg_daily_distance: normalizedAvgDaily,
    starting_point: normalizedStarting,
    stages: input.stages || [],
  };
}

export default function RouteFormUpdate({
  initialData,
  targetRouteId,
  onCancel,
  onUpdated,
}: RouteFormUpdateProps) {
  const [submissionStatus, setSubmissionStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [modalCountdown, setModalCountdown] = useState(5);

  const {
    register,
    control,
    handleSubmit,
    reset,

    formState: { errors },
    watch,
    setValue,
    getValues,
  } = useForm<RouteFormValues>({
    resolver: zodResolver(routeSchema) as Resolver<RouteFormValues>,
    defaultValues: normalizeInitialData(initialData),
  });

  useEffect(() => {
    reset(normalizeInitialData(initialData));
  }, [initialData, reset]);

  const {
    fields: stageFields,
    append: appendStage,
    remove: removeStage,
  } = useFieldArray({
    control,
    name: "stages",
  });

  // Paste / copy modal state and helpers
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

      // If pasting into an existing index, always set the stage_number
      // to the destination index + 1 so pasted stage matches its position.
      if (pasteModalIndex !== null) {
        parsed.stage_number = pasteModalIndex + 1;
      }

      if (pasteModalIndex === null) {
        appendStage(parsed as any);
      } else {
        setValue(`stages.${pasteModalIndex}`, parsed as any);
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
      // Transform route-level avg_daily_distance into objects with dynamic keys
      const transformedAvgDaily = (data.avg_daily_distance || []).map(
        (item: Record<string, unknown>, idx: number) => {
          const rangeValue =
            (item && (item["range_value"] as string)) ||
            (item && (item[`avg_daily_distance_${idx + 1}`] as string)) ||
            "";
          const keyName = `avg_daily_distance_${idx + 1}`;
          const restEntries = Object.entries(item || {}).filter(
            ([k]) =>
              !k.startsWith("avg_daily_distance_") && k !== "range_value",
          );
          const cleanRest = Object.fromEntries(
            restEntries as [string, unknown][],
          );
          return {
            [keyName]: rangeValue,
            ...cleanRest,
          };
        },
      );

      const transformedData = {
        ...data,
        avg_daily_distance: transformedAvgDaily,
      };

      const payload = { routes: [transformedData] };
      const isUpdate = !!targetRouteId;
      const url = isUpdate
        ? `/api/route/${encodeURIComponent(targetRouteId as string)}`
        : `/api/route`;
      const method = isUpdate ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resultData = await res.json();
      if (res.ok) {
        setSubmissionStatus("success");
        // If updating an existing route, preserve existing behavior
        if (isUpdate) {
          setResult(resultData as Record<string, unknown>);
          onUpdated?.(resultData as Record<string, unknown>);
        } else {
          // New create mode: show a success modal with countdown and clear the form
          setShowSuccessModal(true);
          setModalCountdown(5);
          reset(normalizeInitialData(undefined));
          setResult(null);
          onUpdated?.(resultData as Record<string, unknown>);
        }
      } else {
        setSubmissionStatus("error");
        setResult(resultData as Record<string, unknown>);
      }
    } catch {
      setSubmissionStatus("error");
      setResult({ error: "Network or parsing error" });
    }
  };

  // modal countdown and auto-close
  useEffect(() => {
    if (!showSuccessModal) return;
    let mounted = true;
    const id = setInterval(() => {
      if (!mounted) return;
      setModalCountdown((c) => {
        if (c <= 1) {
          // close modal when it reaches 0
          setShowSuccessModal(false);
          return 5;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [showSuccessModal]);

  return (
    <>
      <div className="space-y-8">
        {/* Quick Import */}
        {/* <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
        <label className="block text-sm font-medium text-cyan-300 mb-2">
          Or paste existing JSON to populate form:
        </label>
        <textarea
          onChange={handleJsonPaste}
          className="w-full h-24 bg-slate-900 border border-slate-600 rounded p-2 text-xs font-mono text-slate-300 focus:ring-1 focus:ring-cyan-500 outline-none"
          placeholder='{"route_id": "...", "stages": [...]}'
        />
      </div> */}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="Route ID"
              error={errors.route_id?.message}
              disabled={!!targetRouteId}
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
              <h2 className="text-xl font-bold text-white">Stages</h2>
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
            {/* Route-level avg daily distance metrics */}
            <RouteAvgDailyDistanceInput control={control} register={register} />
            {/* Route-level starting points */}
            <StartingPointInput
              control={control}
              register={register}
              watch={watch}
            />

            <div className="space-y-6">
              {stageFields.map((field, index) => (
                <StageItem
                  key={field.id}
                  index={index}
                  control={control}
                  register={register}
                  remove={() => removeStage(index)}
                  watch={watch}
                  setValue={setValue}
                  getValues={getValues}
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

          <div className="pt-6 border-t border-slate-700 flex flex-col sm:flex-row gap-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="w-full sm:w-40 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submissionStatus === "loading"}
              className="w-full py-4 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-900/20 transform transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submissionStatus === "loading" ? "Saving..." : "Save Route"}
            </button>
          </div>

          {/* {result && (
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
          )} */}
          {showSuccessModal &&
            typeof document !== "undefined" &&
            createPortal(
              <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div
                  className="absolute inset-0 bg-black/60"
                  onClick={() => {
                    setShowSuccessModal(false);
                    setModalCountdown(5);
                  }}
                />
                <div className="relative bg-slate-900 p-6 rounded-lg w-full max-w-sm z-50">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Route created successfully
                  </h3>
                  <p className="text-sm text-slate-300 mb-4">
                    The route was created.
                  </p>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSuccessModal(false);
                        setModalCountdown(5);
                      }}
                      className="bg-emerald-600 cursor-pointer text-white px-4 py-2 rounded"
                    >
                      {`Ok (${modalCountdown})`}
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )}
          {pasteModalOpen &&
            typeof document !== "undefined" &&
            createPortal(
              <div className="fixed top-0 left-0 w-screen h-screen z-9999 flex items-center justify-center">
                <div
                  className="absolute inset-0 bg-black/60"
                  onClick={closePasteModal}
                />
                <div className="relative bg-slate-900 p-6 rounded-lg w-full max-w-2xl z-10000">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Paste Stage JSON
                  </h3>
                  <textarea
                    value={pasteModalText}
                    onChange={(e) => setPasteModalText(e.target.value)}
                    className="w-full h-48 bg-slate-800 border border-slate-700 rounded p-2 text-sm font-mono text-slate-200 focus:ring-1 focus:ring-cyan-500 outline-none"
                  />
                  {pasteModalError && (
                    <p className="text-red-400 text-sm mt-2">
                      {pasteModalError}
                    </p>
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
              </div>,
              document.body,
            )}
        </form>
      </div>
    </>
  );
}

// Sub-components to keep things clean

function StageItem({
  index,
  control,
  register,
  remove,
  watch,
  setValue,
  getValues,
  openPasteModal,
}: {
  index: number;
  control: Control<RouteFormValues>;
  register: UseFormRegister<RouteFormValues>;
  remove: () => void;
  watch: UseFormWatch<RouteFormValues>;
  setValue: UseFormSetValue<RouteFormValues>;
  getValues: UseFormGetValues<RouteFormValues>;
  openPasteModal?: (index: number | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [localPasteError, setLocalPasteError] = useState<string | null>(null);

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
                // remove stage_number so pasted stage will adopt destination index
                delete sanitized.stage_number;
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
              disabled
              title="Auto generated by system."
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
              name={`stages.${index}.details.walking_surface`}
              label="Walking Surface"
              watch={watch}
              setValue={setValue}
            />
            <StringArrayInput
              name={`stages.${index}.details.challenges`}
              label="Challenges"
              watch={watch}
              setValue={setValue}
            />
            <StringArrayInput
              name={`stages.${index}.details.highlights`}
              label="Highlights"
              watch={watch}
              setValue={setValue}
            />
          </div>

          {/* (Avg Daily Distance moved to route-level) */}

          {/* Facilities Section */}
          <FacilitiesInput
            control={control}
            stageIndex={index}
            register={register}
            watch={watch}
            setValue={setValue}
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

function FacilitiesInput({
  control,
  stageIndex,
  register,
  watch,
  setValue,
}: {
  control: Control<RouteFormValues>;
  stageIndex: number;
  register: UseFormRegister<RouteFormValues>;
  watch: UseFormWatch<RouteFormValues>;
  setValue: UseFormSetValue<RouteFormValues>;
}) {
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
          onClick={() =>
            append({
              index: fields.length + 1,
              name: "",
              distance: "",
              services: [],
            })
          }
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
              <Input
                label="Name"
                {...register(`stages.${stageIndex}.facilities.${k}.name`)}
              />
              <Input
                label="Distance"
                {...register(`stages.${stageIndex}.facilities.${k}.distance`)}
              />
              <ServicesSelectInput
                name={`stages.${stageIndex}.facilities.${k}.services`}
                label="Services"
                watch={watch}
                setValue={setValue}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccommodationsInput({
  control,
  stageIndex,
  register,
}: {
  control: Control<RouteFormValues>;
  stageIndex: number;
  register: UseFormRegister<RouteFormValues>;
}) {
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
          onClick={() =>
            append({ name: "", price_category: "$", lat: 0, long: 0 })
          }
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
              <Input
                label="Latitude"
                type="number"
                step="0.000001"
                {...register(`stages.${stageIndex}.accommodations.${k}.lat`)}
              />
              <Input
                label="Longitude"
                type="number"
                step="0.000001"
                {...register(`stages.${stageIndex}.accommodations.${k}.long`)}
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
function StringArrayInput({
  name,
  label,
  simple = false,
  watch,
  setValue,
}: {
  name: Path<RouteFormValues>;
  label: string;
  simple?: boolean;
  watch: UseFormWatch<RouteFormValues>;
  setValue: UseFormSetValue<RouteFormValues>;
}) {
  const value = (watch(name) as unknown as string[]) || [];
  return (
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
          onClick={() => setValue(name, [...value, ""])}
          className="text-cyan-500 hover:text-cyan-400"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="space-y-2">
        {value.map((item: string, i: number) => (
          <div key={`string-${i}-${item}`} className="flex gap-2">
            <input
              value={item}
              onChange={(e) => {
                const newValue = [...value];
                newValue[i] = e.target.value;
                setValue(name, newValue);
              }}
              className="flex-1 bg-slate-800 border-b border-transparent focus:border-cyan-500 outline-none text-sm text-slate-200 px-2 py-1"
            />
            <button
              type="button"
              onClick={() => {
                const newValue = value.filter((_, idx) => idx !== i);
                setValue(name, newValue);
              }}
              className="text-slate-600 hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
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

function ServicesSelectInput({
  name,
  label,
  watch,
  setValue,
}: {
  name: Path<RouteFormValues>;
  label: string;
  watch: UseFormWatch<RouteFormValues>;
  setValue: UseFormSetValue<RouteFormValues>;
}) {
  const value = (watch(name) as unknown as string[]) || [];
  const [selected, setSelected] = useState(SERVICE_OPTIONS[0]);
  const availableOptions = SERVICE_OPTIONS.filter(
    (option) => !value.includes(option),
  );
  const canAdd = availableOptions.length > 0;
  const resolvedSelected = availableOptions.includes(selected)
    ? selected
    : availableOptions[0] || "";

  return (
    <div className="bg-slate-950/30 p-3 rounded border border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-slate-400 uppercase">
          {label}
        </label>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <select
          value={resolvedSelected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={!canAdd}
          className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
        >
          {canAdd ? (
            availableOptions.map((option, idx) => (
              <option key={`opt-${idx}-${option}`} value={option}>
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
            if (!canAdd) {
              return;
            }
            const nextValue = [...value, resolvedSelected];
            setValue(name, nextValue);
            const nextAvailable = SERVICE_OPTIONS.filter(
              (option) => !nextValue.includes(option),
            );
            if (nextAvailable.length > 0) {
              setSelected(nextAvailable[0]);
            }
          }}
          className="text-cyan-500 hover:text-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Add service"
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
              onClick={() => {
                const newValue = value.filter((_, idx) => idx !== i);
                setValue(name, newValue);
              }}
              className="text-slate-600 hover:text-red-400"
              aria-label="Remove service"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Input({
  label,
  error,
  className,
  ...props
}: {
  label: string;
  error?: string;
  className?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
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

function RouteAvgDailyDistanceInput({
  control,
  register,
}: {
  control: Control<RouteFormValues>;
  register: UseFormRegister<RouteFormValues>;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `avg_daily_distance`,
  });

  return (
    <div className="bg-slate-900/50 p-4 rounded-lg space-y-3 border border-slate-700">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">
          Avg Daily Distance (Route)
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
                  {...register(`avg_daily_distance.${k}.range_value`)}
                />
              </div>
              <Input
                label="Min KM"
                type="number"
                step="0.1"
                {...register(`avg_daily_distance.${k}.minimum_km`)}
              />
              <Input
                label="Min Mile"
                type="number"
                step="0.1"
                {...register(`avg_daily_distance.${k}.minimum_mile`)}
              />
              <Input
                label="Max KM"
                type="number"
                step="0.1"
                {...register(`avg_daily_distance.${k}.maximum_km`)}
              />
              <Input
                label="Max Mile"
                type="number"
                step="0.1"
                {...register(`avg_daily_distance.${k}.maximum_mile`)}
              />
              <Input
                label="Days"
                type="number"
                {...register(`avg_daily_distance.${k}.days`)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StartingPointInput({
  control,
  register,
  watch,
}: {
  control: Control<RouteFormValues>;
  register: UseFormRegister<RouteFormValues>;
  watch: UseFormWatch<RouteFormValues>;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `starting_point`,
  });

  const stages = (watch("stages") as unknown as unknown[]) || [];
  const stageCount = Math.max(1, stages.length);

  return (
    <div className="bg-slate-900/30 p-4 rounded-lg space-y-3 border border-slate-700">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">
          Starting Points
        </h4>
        <button
          type="button"
          onClick={() =>
            append({
              name: "",
              avg_distance: "",
              avg_daily: "",
              stage_number: 1,
            })
          }
          className="text-xs bg-slate-700 px-2 py-1 rounded text-cyan-300 flex items-center gap-1 hover:bg-slate-600"
        >
          <Plus size={12} /> Add Starting Point
        </button>
      </div>
      <div className="space-y-3">
        {fields.map((field, i) => (
          <div
            key={field.id}
            className="bg-slate-950 p-3 rounded border border-slate-800 relative group"
          >
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute top-2 right-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={14} />
            </button>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input label="Name" {...register(`starting_point.${i}.name`)} />

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                  Stage Number
                </label>
                <select
                  className={cn(
                    "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all",
                  )}
                  {...register(`starting_point.${i}.stage_number`, {
                    valueAsNumber: true,
                  } as any)}
                >
                  {Array.from({ length: stageCount }, (_, idx) => (
                    <option key={`opt-${i}-${idx + 1}`} value={idx + 1}>
                      {idx + 1}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Avg Distance"
                {...register(`starting_point.${i}.avg_distance`)}
              />
              <Input
                label="Avg Daily"
                {...register(`starting_point.${i}.avg_daily`)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
