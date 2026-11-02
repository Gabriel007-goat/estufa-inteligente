import { useEffect, useRef, useState } from "react";
import { ref, onValue, set, update } from "firebase/database";
import { db } from "./firebase";
import "./App.css";

const DEVICE = "dispositivos/esp32_01";
const PADRAO = { modo_automatico: true, temp_max: 30, umid_min: 40 };
const LIMITE_SEM_DADOS_S = 30;

function formatar(valor, casas) {
  const n = Number(valor);
  if (
    valor === null ||
    valor === undefined ||
    valor === "" ||
    !Number.isFinite(n)
  ) {
    return "--";
  }
  return n.toFixed(casas);
}

export default function App() {
  const [conectado, setConectado] = useState(false);
  const [sensores, setSensores] = useState({});
  const [atuadores, setAtuadores] = useState({});
  const [config, setConfig] = useState({});
  const [agora, setAgora] = useState(() => Date.now());
  const [tempMax, setTempMax] = useState(String(PADRAO.temp_max));
  const [umidMin, setUmidMin] = useState(String(PADRAO.umid_min));
  const [aviso, setAviso] = useState(null);
  const editandoRef = useRef(false);

  useEffect(() => {
    const erroLeitura = (err) =>
      setAviso({
        tipo: "erro",
        texto: `Erro ao ler o banco: ${err.message}`,
      });

    const offs = [
      onValue(ref(db, ".info/connected"), (s) =>
        setConectado(s.val() === true),
      ),
      onValue(
        ref(db, `${DEVICE}/sensores`),
        (s) => setSensores(s.val() || {}),
        erroLeitura,
      ),
      onValue(
        ref(db, `${DEVICE}/atuadores`),
        (s) => setAtuadores(s.val() || {}),
        erroLeitura,
      ),
      onValue(
        ref(db, `${DEVICE}/config`),
        (s) => {
          const c = s.val() || {};
          setConfig(c);
          if (!editandoRef.current) {
            setTempMax(String(c.temp_max ?? PADRAO.temp_max));
            setUmidMin(String(c.umid_min ?? PADRAO.umid_min));
          }
        },
        erroLeitura,
      ),
    ];
    const relogio = setInterval(() => setAgora(Date.now()), 5000);

    return () => {
      offs.forEach((off) => off());
      clearInterval(relogio);
    };
  }, []);

  useEffect(() => {
    if (aviso?.tipo !== "ok") return undefined;
    const t = setTimeout(() => setAviso(null), 3000);
    return () => clearTimeout(t);
  }, [aviso]);

  const modoAuto = config.modo_automatico ?? PADRAO.modo_automatico;
  const bomba = atuadores.bomba === true;
  const cooler = atuadores.cooler === true;

  const ts = Number(sensores.ultima_atualizacao);
  const ultima = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : null;
  const semDados =
    !ultima || (agora - ultima.getTime()) / 1000 > LIMITE_SEM_DADOS_S;

  const gravar = async (caminho, valor) => {
    try {
      await set(ref(db, `${DEVICE}/${caminho}`), valor);
      setAviso(null);
    } catch {
      setAviso({
        tipo: "erro",
        texto:
          "Não foi possível enviar ao Firebase. Verifique a conexão e as regras do banco.",
      });
    }
  };

  const alternarModo = () => gravar("config/modo_automatico", !modoAuto);

  const alternarAtuador = (nome, atual) => {
    if (modoAuto) return;
    gravar(`atuadores/${nome}`, !atual);
  };

  const salvarLimites = async (e) => {
    e.preventDefault();
    const t = Number(tempMax);
    const u = Number(umidMin);
    if (
      tempMax.trim() === "" ||
      umidMin.trim() === "" ||
      !Number.isFinite(t) ||
      !Number.isFinite(u)
    ) {
      setAviso({
        tipo: "erro",
        texto: "Informe valores numéricos nos dois limites.",
      });
      return;
    }
    if (u < 0 || u > 100) {
      setAviso({ tipo: "erro", texto: "A umidade deve estar entre 0 e 100%." });
      return;
    }
    try {
      await update(ref(db, `${DEVICE}/config`), { temp_max: t, umid_min: u });
      editandoRef.current = false;
      setAviso({ tipo: "ok", texto: "Limites salvos." });
    } catch {
      setAviso({
        tipo: "erro",
        texto:
          "Não foi possível salvar os limites. Verifique a conexão e as regras do banco.",
      });
    }
  };

  return (
    <main className="pagina">
      <header className="topo">
        <h1>Controlador da Estufa Inteligente</h1>
        <p className="subtitulo">
          ESP32 · Firebase Realtime Database · FMM · Projeto de DSE
        </p>
        <p className={`status ${conectado ? "on" : "off"}`} role="status">
          <span className="ponto" />
          {conectado ? "conectado ao Firebase" : "conectando ao Firebase…"}
        </p>
      </header>

      <section className="cartao">
        <h2 className="rotulo">Leituras dos sensores</h2>
        <div className="leituras">
          <div className="leitura">
            <span className="valor">{formatar(sensores.temperatura, 1)}</span>
            <span className="legenda">temperatura (°C)</span>
          </div>
          <div className="leitura">
            <span className="valor">{formatar(sensores.umidade, 0)}</span>
            <span className="legenda">umidade (%)</span>
          </div>
        </div>
        <p className={`ultima ${semDados ? "alerta" : ""}`}>
          {ultima
            ? `última leitura: ${ultima.toLocaleTimeString("pt-BR")}`
            : "aguardando a primeira leitura do ESP32"}
          {ultima && semDados ? " · sem dados recentes" : ""}
        </p>
      </section>

      <section className="cartao">
        <h2 className="rotulo">Modo de operação</h2>
        <div className="modo">
          <p className="texto-modo">
            {modoAuto
              ? "Automático: o ESP32 decide sozinho, seguindo os limites abaixo. Desligue para assumir o controle manual pelos botões."
              : "Manual: você controla a bomba e o cooler pelos botões abaixo. Ligue para voltar ao modo automático."}
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={modoAuto}
            aria-label="Modo automático"
            className={`interruptor ${modoAuto ? "on" : ""}`}
            onClick={alternarModo}
          >
            <span className="bolinha" />
          </button>
        </div>
      </section>

      <section className="cartao">
        <h2 className="rotulo">Atuadores</h2>
        <div className="atuadores">
          <div className="atuador">
            <span className="nome">Bomba d'água</span>
            <button
              type="button"
              className={`botao-atuador ${bomba ? "on" : ""}`}
              aria-pressed={bomba}
              disabled={modoAuto}
              title={
                modoAuto
                  ? "Desligue o modo automático para controlar manualmente"
                  : undefined
              }
              onClick={() => alternarAtuador("bomba", bomba)}
            >
              {bomba ? "LIGADA" : "DESLIGADA"}
            </button>
          </div>
          <div className="atuador">
            <span className="nome">Cooler</span>
            <button
              type="button"
              className={`botao-atuador ${cooler ? "on" : ""}`}
              aria-pressed={cooler}
              disabled={modoAuto}
              title={
                modoAuto
                  ? "Desligue o modo automático para controlar manualmente"
                  : undefined
              }
              onClick={() => alternarAtuador("cooler", cooler)}
            >
              {cooler ? "LIGADO" : "DESLIGADO"}
            </button>
          </div>
        </div>
      </section>

      <section className="cartao">
        <h2 className="rotulo">Limites do modo automático</h2>
        <form className="limites" onSubmit={salvarLimites}>
          <label className="campo">
            <span>Cooler liga quando temperatura maior que (°C)</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={tempMax}
              onChange={(e) => {
                editandoRef.current = true;
                setTempMax(e.target.value);
              }}
            />
          </label>
          <label className="campo">
            <span>Bomba liga quando umidade menor que (%)</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={umidMin}
              onChange={(e) => {
                editandoRef.current = true;
                setUmidMin(e.target.value);
              }}
            />
          </label>
          <button type="submit" className="botao-salvar">
            Salvar limites
          </button>
        </form>
        {aviso && (
          <p className={`aviso ${aviso.tipo}`} role="alert">
            {aviso.texto}
          </p>
        )}
      </section>

      <footer className="rodape">Fundação Matias Machline - 2026</footer>
    </main>
  );
}
