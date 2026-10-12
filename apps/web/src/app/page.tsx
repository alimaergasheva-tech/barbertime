import { Barbers } from "@/components/Barbers";
import { Contacts } from "@/components/Contacts";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { PageTransition } from "@/components/PageTransition";
import { Reviews } from "@/components/Reviews";
import { Services } from "@/components/Services";
import { getCatalog, getTodaySlots } from "@/lib/api";

export default async function HomePage() {
  const { services, barbers } = await getCatalog();
  const todaySlots = await getTodaySlots(barbers);

  return (
    <>
      <Header />
      <PageTransition>
        <main>
          <Hero barbers={barbers} todaySlots={todaySlots} />
          <Services services={services} />
          <Barbers barbers={barbers} />
          <Reviews barbers={barbers} />
          <Contacts />
        </main>
        <Footer />
      </PageTransition>
    </>
  );
}
