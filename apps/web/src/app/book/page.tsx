import type { Metadata } from "next";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { Header } from "@/components/Header";
import { PageTransition } from "@/components/PageTransition";
import { getCatalog } from "@/lib/api";
import { ANY_BARBER, canPerformAll } from "@/lib/booking";
import { isTimeString, todayInShop } from "@/lib/time";

export const metadata: Metadata = {
  title: "Запись — Barber Time",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function BookPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, { services, barbers }] = await Promise.all([searchParams, getCatalog()]);

  const serviceId = single(params.service);
  const barberParam = single(params.barber);
  const timeParam = single(params.time);

  const initialServiceIds = services.some((s) => s.id === serviceId) ? [serviceId as string] : [];
  const barber = barbers.find((b) => b.id === barberParam);
  const initialBarberId =
    barberParam === ANY_BARBER
      ? ANY_BARBER
      : barber && canPerformAll(barber, initialServiceIds)
        ? barber.id
        : null;
  const initialTime = initialBarberId && timeParam && isTimeString(timeParam) ? timeParam : null;

  return (
    <>
      <Header showCta={false} />
      <PageTransition>
        <main className="container">
          <BookingWizard
            services={services}
            barbers={barbers}
            initialServiceIds={initialServiceIds}
            initialBarberId={initialBarberId}
            initialDate={initialTime ? todayInShop() : null}
            initialTime={initialTime}
          />
        </main>
      </PageTransition>
    </>
  );
}
