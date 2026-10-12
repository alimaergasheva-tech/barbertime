import Link from "next/link";
import { Header } from "@/components/Header";

export default function BookingNotFound() {
  return (
    <>
      <Header showCta={false} />
      <main className="container section">
        <h1 className="section-title">Запись не найдена</h1>
        <p className="section-lead">
          Проверьте ссылку из сообщения о записи — возможно, она скопировалась не полностью.
        </p>
        <Link href="/book" className="btn btn-primary" transitionTypes={["nav-forward"]}>
          Записаться
        </Link>
      </main>
    </>
  );
}
