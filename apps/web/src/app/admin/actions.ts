"use server";

import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, AdminApiError, adminFetch, callApi, getSessionToken } from "@/lib/admin/api";
import { errorText, shopIso } from "@/lib/admin/format";
import type { ActionState, AdminSettings } from "@/lib/admin/types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const int = (form: FormData, key: string) => Number.parseInt(text(form, key), 10);
const optionalInt = (form: FormData, key: string) => (text(form, key) === "" ? null : int(form, key));
const checked = (form: FormData, key: string) => form.get(key) === "on";

/** Runs an API mutation and maps API errors to a message; redirects (expired session) pass through. */
async function mutate(fn: () => Promise<unknown>, success: string): Promise<ActionState> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof AdminApiError) return { ok: false, message: errorText(error.code) };
    throw error;
  }
  refresh();
  return { ok: true, message: success };
}

// ---------- session ----------

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const login = text(form, "login");
  const password = String(form.get("password") ?? "");
  if (!login || !password) return { ok: false, message: "Введите логин и пароль." };

  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  let session: { token: string; expiresAt: string };
  try {
    session = await callApi("/login", { method: "POST", body: { login, password }, headers: forwarded ? { "X-Forwarded-For": forwarded } : {} });
  } catch (error) {
    if (error instanceof AdminApiError) return { ok: false, message: errorText(error.code) };
    throw error;
  }
  (await cookies()).set(ADMIN_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expiresAt),
  });
  redirect("/admin");
}

export async function logoutAction() {
  const token = await getSessionToken();
  if (token) await callApi("/logout", { method: "POST" }, token).catch(() => undefined);
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

// ---------- bookings ----------

export async function createBookingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const serviceIds = form.getAll("serviceIds").map(String);
  if (serviceIds.length === 0) return { ok: false, message: "Выберите хотя бы одну услугу." };
  const digits = text(form, "phone").replace(/\D/g, "").replace(/^998/, "");
  if (digits.length !== 9) return { ok: false, message: "Телефон: 9 цифр после +998." };
  const time = text(form, "manualTime") || text(form, "time");
  if (!time) return { ok: false, message: "Выберите время." };
  return mutate(
    () =>
      adminFetch("/bookings", {
        method: "POST",
        body: {
          serviceIds,
          barberId: text(form, "barberId"),
          startsAt: shopIso(text(form, "date"), time),
          client: { name: text(form, "name"), phone: `+998${digits}` },
        },
      }),
    "Запись создана.",
  );
}

export async function setBookingStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const labels: Record<string, string> = { completed: "Отмечено: пришёл.", no_show: "Отмечено: неявка.", cancelled: "Запись отменена.", confirmed: "Запись восстановлена." };
  const status = text(form, "status");
  return mutate(() => adminFetch(`/bookings/${text(form, "id")}`, { method: "PATCH", body: { status } }), labels[status] ?? "Сохранено.");
}

export async function rescheduleBookingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return mutate(
    () => adminFetch(`/bookings/${text(form, "id")}`, { method: "PATCH", body: { startsAt: shopIso(text(form, "date"), text(form, "time")) } }),
    "Запись перенесена.",
  );
}

// ---------- services ----------

function serviceBody(form: FormData) {
  return {
    name: text(form, "name"),
    description: text(form, "description"),
    durationMin: int(form, "durationMin"),
    price: int(form, "price"),
    sortOrder: int(form, "sortOrder") || 0,
  };
}

export async function createServiceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return mutate(() => adminFetch("/services", { method: "POST", body: { ...serviceBody(form), assignToAll: checked(form, "assignToAll") } }), "Услуга добавлена.");
}

export async function updateServiceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return mutate(
    () => adminFetch(`/services/${text(form, "id")}`, { method: "PATCH", body: { ...serviceBody(form), isActive: checked(form, "isActive") } }),
    "Сохранено.",
  );
}

export async function deleteServiceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let archived = false;
  const result = await mutate(async () => {
    archived = (await adminFetch<{ archived: boolean }>(`/services/${text(form, "id")}`, { method: "DELETE" })).archived;
  }, "");
  if (!result?.ok) return result;
  return { ok: true, message: archived ? "У услуги есть история записей — она скрыта, а не удалена." : "Услуга удалена." };
}

// ---------- barbers ----------

function barberBody(form: FormData) {
  return {
    name: text(form, "name"),
    bio: text(form, "bio"),
    experienceYears: int(form, "experienceYears") || 0,
    specialties: text(form, "specialties").split(",").map((s) => s.trim()).filter(Boolean),
    sortOrder: int(form, "sortOrder") || 0,
  };
}

export async function createBarberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id = "";
  const result = await mutate(async () => {
    id = (await adminFetch<{ id: string }>("/barbers", { method: "POST", body: barberBody(form) })).id;
  }, "");
  if (!result?.ok) return result;
  redirect(`/admin/barbers/${id}`);
}

export async function updateBarberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return mutate(
    () => adminFetch(`/barbers/${text(form, "id")}`, { method: "PATCH", body: { ...barberBody(form), isActive: checked(form, "isActive") } }),
    "Профиль сохранён.",
  );
}

export async function updateBarberServicesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const services = form.getAll("serviceId").map(String).map((serviceId) => ({
    serviceId,
    enabled: checked(form, `enabled_${serviceId}`),
    durationMin: optionalInt(form, `duration_${serviceId}`),
    price: optionalInt(form, `price_${serviceId}`),
  }));
  return mutate(() => adminFetch(`/barbers/${text(form, "id")}`, { method: "PATCH", body: { services } }), "Услуги мастера сохранены.");
}

export async function deleteBarberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let archived = false;
  const result = await mutate(async () => {
    archived = (await adminFetch<{ archived: boolean }>(`/barbers/${text(form, "id")}`, { method: "DELETE" })).archived;
  }, "");
  if (!result?.ok) return result;
  if (!archived) redirect("/admin/barbers");
  return { ok: true, message: "У мастера есть записи — он скрыт с сайта, а не удалён." };
}

function imageForm(form: FormData): FormData | null {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  const upload = new FormData();
  upload.append("file", file, file.name);
  return upload;
}

export async function uploadPhotoAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const upload = imageForm(form);
  if (!upload) return { ok: false, message: "Выберите файл." };
  return mutate(() => adminFetch(`/barbers/${text(form, "id")}/photo`, { method: "POST", form: upload }), "Фото обновлено.");
}

export async function deletePhotoAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return mutate(() => adminFetch(`/barbers/${text(form, "id")}/photo`, { method: "DELETE" }), "Фото удалено.");
}

export async function uploadPortfolioAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const upload = imageForm(form);
  if (!upload) return { ok: false, message: "Выберите файл." };
  return mutate(() => adminFetch(`/barbers/${text(form, "id")}/portfolio`, { method: "POST", form: upload }), "Фото добавлено в портфолио.");
}

export async function deletePortfolioAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return mutate(() => adminFetch(`/portfolio/${text(form, "itemId")}`, { method: "DELETE" }), "Фото удалено.");
}

// ---------- schedule ----------

export async function saveScheduleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const days = [1, 2, 3, 4, 5, 6, 7]
    .filter((weekday) => checked(form, `work_${weekday}`))
    .map((weekday) => {
      const breakStart = text(form, `breakStart_${weekday}`);
      const breakEnd = text(form, `breakEnd_${weekday}`);
      return {
        weekday,
        start: text(form, `start_${weekday}`),
        end: text(form, `end_${weekday}`),
        breaks: breakStart && breakEnd ? [{ start: breakStart, end: breakEnd }] : [],
      };
    });
  return mutate(() => adminFetch(`/barbers/${text(form, "barberId")}/schedule`, { method: "PUT", body: { days } }), "График сохранён.");
}

export async function createTimeOffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const allDay = checked(form, "allDay");
  const from = text(form, "from");
  let conflicts = 0;
  const result = await mutate(async () => {
    const created = await adminFetch<{ conflicts: number }>("/time-off", {
      method: "POST",
      body: {
        barberId: text(form, "barberId") || null,
        from,
        to: text(form, "to") || from,
        ...(allDay ? {} : { startTime: text(form, "startTime"), endTime: text(form, "endTime") }),
        type: text(form, "type"),
        note: text(form, "note") || undefined,
      },
    });
    conflicts = created.conflicts;
  }, "");
  if (!result?.ok) return result;
  return {
    ok: true,
    message: conflicts
      ? `Исключение добавлено. Внимание: на это время уже есть записей — ${conflicts}. Перенесите или отмените их в разделе «Записи».`
      : "Исключение добавлено.",
  };
}

export async function deleteTimeOffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return mutate(() => adminFetch(`/time-off/${text(form, "id")}`, { method: "DELETE" }), "Исключение удалено.");
}

// ---------- reviews & settings ----------

export async function setReviewVisibilityAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const isPublic = text(form, "isPublic") === "true";
  return mutate(
    () => adminFetch(`/reviews/${text(form, "id")}`, { method: "PATCH", body: { isPublic } }),
    isPublic ? "Отзыв опубликован." : "Отзыв скрыт.",
  );
}

const NUMERIC_SETTINGS: (keyof AdminSettings)[] = [
  "cancel_cutoff_min",
  "slot_step_min",
  "booking_horizon_days",
  "min_notice_min",
  "reminder_day_minutes",
  "reminder_short_minutes",
  "review_delay_min",
  "review_public_min_rating",
];

export async function saveSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const body: Partial<Record<keyof AdminSettings, number | string>> = { timezone: text(form, "timezone") };
  for (const key of NUMERIC_SETTINGS) body[key] = int(form, key);
  return mutate(() => adminFetch("/settings", { method: "PUT", body }), "Настройки сохранены.");
}
