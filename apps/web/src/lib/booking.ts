import type { Barber, Service } from "@/types";

export const ANY_BARBER = "any";

export function selectedServices(all: Service[], ids: string[]): Service[] {
  return all.filter((service) => ids.includes(service.id));
}

export function totals(items: Service[]) {
  return items.reduce(
    (acc, item) => ({
      durationMin: acc.durationMin + item.durationMin,
      price: acc.price + item.price,
    }),
    { durationMin: 0, price: 0 },
  );
}

export function canPerformAll(barber: Barber, serviceIds: string[]): boolean {
  return serviceIds.every((id) => barber.serviceIds.includes(id));
}

export function missingServices(barber: Barber, items: Service[]): Service[] {
  return items.filter((item) => !barber.serviceIds.includes(item.id));
}

export function eligibleBarbers(all: Barber[], serviceIds: string[]): Barber[] {
  return all.filter((barber) => canPerformAll(barber, serviceIds));
}

export function pluralServices(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} услуга`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} услуги`;
  return `${count} услуг`;
}
