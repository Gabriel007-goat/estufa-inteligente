import { useEffect, useState } from "react";
import { ref, onValue, set } from "firebase/database";
import { db } from "./firebase";
import "./App.css";

const DEVICE = "dispositivos/esp32_01";

function Card({ titulo, valor, unidade }) {
  return (
    <div className="card">
      <span className="card-titulo">{titulo}</span>
      <span className="card-valor">
        {valor ?? "--"}
        {valor != null && <small> {unidade}</small>}
      </span>
    </div>
  );
}

export default function App() {
  const [online, setOnline] = useState(false);
  const [sensores, setSensores] = useState({});
  const [atuadores, setAtuadores] = useState({ bomba: false, cooler: false });

  useEffect(() => {
    const offConn = onValue(ref(db, ".info/connected"), (s) =>
      setOnline(s.val() === true),
    );
    const offSens = onValue(ref(db, `${DEVICE}/sensores`), (s) =>
      setSensores(s.val() || {}),
    );
    const offAtu = onValue(ref(db, `${DEVICE}/atuadores`), (s) =>
      setAtuadores((prev) => ({ ...prev, ...(s.val() || {}) })),
    );
    return () => {
      offConn();
      offSens();
      offAtu();
    };
  }, []);

  const alternar = (nome) =>
    set(ref(db, `${DEVICE}/atuadores/${nome}`), !atuadores[nome]);

  const atualizado = sensores.ultima_atualizacao
    ? new Date(sensores.ultima_atualizacao * 1000).toLocaleTimeString()
    : "--";

  return (
    <div className="app">
      <header>
        <h1>Estufa Inteligente</h1>
        <span className={`status ${online ? "on" : "off"}`}>
          {online ? "Conectado ao Firebase" : "Desconectado"}
        </span>
      </header>

      <section className="grid">
        <Card titulo="Temperatura" valor={sensores.temperatura} unidade="°C" />
        <Card titulo="Umidade do ar" valor={sensores.umidade} unidade="%" />
        <Card
          titulo="Umidade do solo"
          valor={sensores.umidade_solo}
          unidade="%"
        />
      </section>
      <p className="atualizado">Última atualização: {atualizado}</p>

      <section className="controles">
        {["bomba", "cooler"].map((nome) => (
          <label key={nome} className="controle">
            <span>{nome === "bomba" ? "Bomba d'água" : "Cooler"}</span>
            <input
              type="checkbox"
              checked={!!atuadores[nome]}
              onChange={() => alternar(nome)}
            />
          </label>
        ))}
      </section>
    </div>
  );
}
