import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ManageBooking } from "@/components/booking/ManageBooking";
import { Header } from "@/components/Header";
import { PageTransition } from "@/components/PageTransition";
import { getBooking } from "@/lib/api";

export const metadata: Metadata = {
  title: "Ваша запись — Barber Time",
  robots: { index: false, follow: false },
};

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getBooking(token);
  if (!booking) notFound();

  return (
    <>
      <Header showCta={false} />
      <PageTransition>
        <main className="container">
          <ManageBooking initialBooking={booking} />
        </main>
      </PageTransition>
    </>
  );
}
