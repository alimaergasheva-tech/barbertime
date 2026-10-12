import { z } from "zod";
import { isIsoDate } from "../booking/time";

export const Id = z.string().regex(/^[\w-]{1,64}$/, "Invalid id");

export const ManageToken = z.string().regex(/^[\w-]{20,128}$/, "Invalid token");

export const IsoDate = z.string().refine(isIsoDate, "Expected date as YYYY-MM-DD");

/** `serviceIds=haircut,beard` in query strings. */
export const ServiceIdsQuery = z
  .string()
  .transform((value) => value.split(",").filter(Boolean))
  .pipe(z.array(Id).min(1).max(5));

export const ServiceIdsBody = z.array(Id).min(1).max(5);

export const StartsAt = z.iso.datetime({ offset: true });

export const ClientInput = z.object({
  name: z.string().trim().min(2).max(60),
  phone: z.string().regex(/^\+998\d{9}$/, "Expected +998XXXXXXXXX"),
});
