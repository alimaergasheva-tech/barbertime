import { useState } from "react";
import { api, errorMessage } from "./api";
import { BookFlow } from "./BookFlow";
import { MyBookings } from "./MyBookings";
import { isInTelegram } from "./telegram";
import { useAsync } from "./useAsync";

type Tab = "book" | "mine";

const loadCatalog = () => Promise.all([api.services(), api.barbers()]);

export function App() {
  const [tab, setTab] = useState<Tab>("book");
  const [flowKey, setFlowKey] = useState(0);
  const catalog = useAsync("catalog", loadCatalog);

  function openBook() {
    setFlowKey((value) => value + 1);
    setTab("book");
  }

  return (
    <div className="app">
      <header className="top">
        <p className="brand">
          Barber <span>Time</span>
        </p>
        <nav className="tabs" aria-label="Разделы">
          <button type="button" aria-pressed={tab === "book"} onClick={openBook}>
            Записаться
          </button>
          <button type="button" aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>
            Мои записи
          </button>
        </nav>
      </header>

      {!isInTelegram && (
        <p className="banner">Откройте приложение через бота в Telegram, чтобы видеть свои записи и получать напоминания.</p>
      )}

      <main>
        {tab === "mine" ? (
          <MyBookings onBook={openBook} />
        ) : catalog.status === "ready" ? (
          <BookFlow key={flowKey} services={catalog.data[0]} barbers={catalog.data[1]} onShowMine={() => setTab("mine")} />
        ) : catalog.status === "error" ? (
          <div className="message" role="alert">
            <p>{errorMessage(catalog.error)}</p>
            <button type="button" className="button secondary" onClick={catalog.reload}>
              Повторить
            </button>
          </div>
        ) : (
          <div aria-busy="true">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="card skeleton" />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
