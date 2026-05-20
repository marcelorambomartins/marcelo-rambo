import { useState } from "react";

// ─── CONSTANTES ───────────────────────────────────────────────────
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const CORES = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#14B8A6","#F97316","#6366F1","#84CC16","#0EA5E9","#A855F7"];

// ─── HELPERS ──────────────────────────────────────────────────────
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2,"0")}:${String(m % 60).padStart(2,"0")}`;
const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const round1 = (v) => Math.round(v * 10) / 10;

function getDiasAtivos(diasFunc) {
  return diasFunc === "7" ? [0, 1, 2, 3, 4, 5, 6]
    : diasFunc === "6" ? [1, 2, 3, 4, 5, 6]
      : [1, 2, 3, 4, 5];
}

function diaToConfigKey(diaIdx) {
  if (diaIdx === 0) return "dom";
  if (diaIdx === 6) return "sab";
  return "util";
}

function getConfigHorario(empresa, dia) {
  if (dia === "sab" && empresa.sabIgualUtil) return getConfigHorarioRaw(empresa, "util");
  if (dia === "dom" && empresa.domIgualUtil) return getConfigHorarioRaw(empresa, "util");
  return getConfigHorarioRaw(empresa, dia);
}

function getConfigHorarioRaw(empresa, dia) {
  const p = dia === "util" ? "" : dia;
  const k = (name) => empresa[p ? p + name.charAt(0).toUpperCase() + name.slice(1) : name];
  return {
    tipoHorario: empresa.tipoHorario,
    hrInicio: k("hrInicio"),
    hrFim: k("hrFim"),
    intervalo: k("intervalo"),
    t1Inicio: k("t1Inicio"),
    t1Fim: k("t1Fim"),
    t2Inicio: k("t2Inicio"),
    t2Fim: k("t2Fim"),
  };
}

function validarHorario(config) {
  if (config.tipoHorario === "continuo") {
    return config.hrInicio && config.hrFim && toMin(config.hrFim) > toMin(config.hrInicio);
  }
  return config.t1Inicio && config.t1Fim && config.t2Inicio && config.t2Fim;
}

function calcHorasEfetivas(config) {
  if (config.tipoHorario === "continuo") {
    const bruto = (toMin(config.hrFim) - toMin(config.hrInicio)) / 60;
    return Math.max(0, bruto - config.intervalo / 60);
  }
  const t1 = Math.max(0, (toMin(config.t1Fim) - toMin(config.t1Inicio)) / 60);
  const t2 = Math.max(0, (toMin(config.t2Fim) - toMin(config.t2Inicio)) / 60);
  return t1 + t2;
}

function calcHorasEfetivasDia(empresa, diaIdx) {
  return calcHorasEfetivas(getConfigHorario(empresa, diaToConfigKey(diaIdx)));
}

function calcResumoOperacao(empresa) {
  const diasAtivos = getDiasAtivos(empresa.diasFunc);
  const horasPorDia = diasAtivos.map(d => calcHorasEfetivasDia(empresa, d));
  const horasSemanais = horasPorDia.reduce((a, b) => a + b, 0);
  const horasMaxDia = horasPorDia.length ? Math.max(...horasPorDia) : 0;
  const horasMediaDia = diasAtivos.length ? horasSemanais / diasAtivos.length : 0;
  const temHorariosDiferentes = new Set(horasPorDia.map(h => round1(h))).size > 1;
  return {
    diasAtivos,
    horasPorDia,
    horasSemanais,
    horasMaxDia,
    horasMediaDia,
    diasFuncionamento: diasAtivos.length,
    temHorariosDiferentes,
  };
}

function calcTurnos(config, horasPorDiaTrabalho) {
  const horasEfetivas = calcHorasEfetivas(config);
  let turno1Inicio, turno1Fim, turno2Inicio, turno2Fim, temTurno2 = false;

  if (config.tipoHorario === "dois") {
    turno1Inicio = config.t1Inicio;
    turno1Fim = config.t1Fim;
    turno2Inicio = config.t2Inicio;
    turno2Fim = config.t2Fim;
    temTurno2 = true;
  } else {
    turno1Inicio = config.hrInicio;
    turno1Fim = fromMin(toMin(config.hrInicio) + horasPorDiaTrabalho * 60);
    const fimEmpresa = toMin(config.hrFim);
    const fimT1 = toMin(turno1Fim) + (config.intervalo || 0);
    if (horasEfetivas > horasPorDiaTrabalho && fimEmpresa > fimT1) {
      turno2Inicio = fromMin(toMin(turno1Fim) + (config.intervalo || 0));
      turno2Fim = config.hrFim;
      temTurno2 = true;
    }
  }

  return { turno1Inicio, turno1Fim, turno2Inicio, turno2Fim, temTurno2, horasEfetivas };
}

function formatTurnos({ turno1Inicio, turno1Fim, turno2Inicio, turno2Fim, temTurno2 }, config) {
  if (temTurno2) return `Turno 1: ${turno1Inicio}–${turno1Fim} · Turno 2: ${turno2Inicio}–${turno2Fim}`;
  return `${turno1Inicio}–${turno1Fim}${config.intervalo ? ` · ${config.intervalo}min de intervalo` : ""}`;
}

function recomendar(resumo) {
  const { horasMaxDia, horasSemanais, temHorariosDiferentes } = resumo;
  const diaLabel = temHorariosDiferentes
    ? `até ${round1(horasMaxDia)}h efetivas/dia`
    : `${round1(horasMaxDia)}h efetivas/dia`;

  if (horasMaxDia <= 10) {
    return {
      modelo: "5x2",
      motivo: `Sua operação tem ${diaLabel} (${round1(horasSemanais)}h/semana). O modelo 5x2 com 8h/dia cobre bem sem necessidade de sobreposição de turnos.`,
    };
  }
  return {
    modelo: "4x3",
    motivo: `Sua operação tem ${diaLabel} (${round1(horasSemanais)}h/semana). O modelo 4x3 com 10h/dia permite dois grupos sobrepostos para cobrir toda a operação.`,
  };
}

function gerarEscala(numFunc, modelo, empresa) {
  const resumo = calcResumoOperacao(empresa);
  const { diasAtivos } = resumo;
  const horasPorDia = modelo === "4x3" ? 10 : 8;

  const funcionarios = Array.from({ length: numFunc }, (_, i) => ({
    id: i + 1,
    cor: CORES[i % CORES.length],
    grupo: numFunc <= 6 ? (i < Math.ceil(numFunc / 2) ? "A" : "B") : String.fromCharCode(65 + (i % 3)),
  }));

  const escala = DIAS.map(() => []);

  const diasTrabalhadosPorFunc = modelo === "5x2" ? 5 : 4;
  const folgasSemanais = modelo === "5x2" ? 2 : 3;
  // Folgas que caem em dias em que a empresa abre (demais folgas caem nos dias fechados)
  const folgasEntreDiasAtivos = Math.max(0, diasAtivos.length - diasTrabalhadosPorFunc);

  funcionarios.forEach((f, i) => {
    const folgaSet = new Set();
    for (let k = 0; k < folgasEntreDiasAtivos; k++) {
      const idx = (i * folgasEntreDiasAtivos + k) % diasAtivos.length;
      folgaSet.add(diasAtivos[idx]);
    }
    diasAtivos.forEach(d => {
      if (!folgaSet.has(d)) escala[d].push(f);
    });
  });

  const horariosPorGrupo = {};
  const gruposHorario = [
    { key: "util", label: "Seg–Sex", ativo: true },
    { key: "sab", label: "Sábado", ativo: empresa.diasFunc === "6" || empresa.diasFunc === "7" },
    { key: "dom", label: "Domingo", ativo: empresa.diasFunc === "7" },
  ].filter(g => g.ativo);

  gruposHorario.forEach(({ key, label }) => {
    const config = getConfigHorario(empresa, key);
    horariosPorGrupo[key] = { label, ...calcTurnos(config, horasPorDia) };
  });

  const turnoRef = horariosPorGrupo.util || Object.values(horariosPorGrupo)[0];
  const { turno1Inicio, turno1Fim, turno2Inicio, turno2Fim, temTurno2 } = turnoRef;

  const grupos = [...new Set(funcionarios.map(f => f.grupo))];
  const numGrupos = grupos.length;
  const porGrupo = Math.round(numFunc / numGrupos);

  const contagensPorDia = diasAtivos.map(d => (Array.isArray(escala[d]) ? escala[d].length : 0));
  const minFuncPorDia = contagensPorDia.length > 0 ? Math.min(...contagensPorDia) : 0;

  let explicacao = "";
  if (modelo === "5x2") {
    explicacao = `Com ${numFunc} funcionário${numFunc > 1 ? "s" : ""} no modelo 5x2, organizamos em ${numGrupos} grupo${numGrupos > 1 ? "s" : ""} de ~${porGrupo} pessoas. As folgas são distribuídas em dias alternados ao longo da semana, garantindo ao menos ${minFuncPorDia} funcionário${minFuncPorDia !== 1 ? "s" : ""} por dia. Cada colaborador trabalha 8h/dia, totalizando 40h semanais.`;
  } else {
    explicacao = `Com ${numFunc} funcionário${numFunc > 1 ? "s" : ""} no modelo 4x3, organizamos em ${numGrupos} grupo${numGrupos > 1 ? "s" : ""} com folgas escalonadas. Cada grupo tem 3 dias consecutivos de folga distribuídos na semana, garantindo cobertura diária mesmo nos dias de menor movimento. Cada colaborador trabalha 10h/dia, totalizando 40h semanais.`;
  }

  const descricoesHorario = gruposHorario.map(({ key }) => {
    const config = getConfigHorario(empresa, key);
    return `${horariosPorGrupo[key].label}: ${formatTurnos(horariosPorGrupo[key], config)}`;
  });
  if (descricoesHorario.length === 1 && temTurno2) {
    explicacao += ` A operação é coberta em dois turnos: ${turno1Inicio}–${turno1Fim} e ${turno2Inicio}–${turno2Fim}.`;
  } else if (descricoesHorario.length > 0) {
    explicacao += ` Horários de operação: ${descricoesHorario.join(" · ")}.`;
  }

  return {
    escala, funcionarios, horasPorDia, turno1Inicio, turno1Fim, turno2Inicio, turno2Fim, temTurno2,
    explicacao, horariosPorGrupo, resumoOperacao: resumo,
  };
}

// ─── UI ATOMS ─────────────────────────────────────────────────────
function Steps({ atual }) {
  const steps = ["Empresa", "Equipe", "Resultado"];
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 28 }}>
      {steps.map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : "unset" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: i < atual ? "#22C55E" : i === atual ? "#2563EB" : "#E5E7EB",
              color: i <= atual ? "#fff" : "#9CA3AF",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 13,
              boxShadow: i === atual ? "0 0 0 4px #DBEAFE" : "none",
              transition: "all .3s"
            }}>{i < atual ? "✓" : i + 1}</div>
            <span style={{ fontSize: 11, color: i === atual ? "#2563EB" : "#6B7280", fontWeight: i === atual ? 700 : 400 }}>{s}</span>
          </div>
          {i < 2 && <div style={{ flex: 1, height: 2, background: i < atual ? "#22C55E" : "#E5E7EB", margin: "0 8px", marginBottom: 16 }} />}
        </div>
      ))}
    </div>
  );
}

function Label({ children }) {
  return <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>{children}</label>;
}

function Hint({ children }) {
  return <p style={{ fontSize: 11, color: "#9CA3AF", margin: "3px 0 0" }}>{children}</p>;
}

function Field({ label, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginBottom: 16 }}>
      {label && <Label>{label}</Label>}
      {children}
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

const inputSx = {
  padding: "10px 13px", borderRadius: 10, border: "1.5px solid #E5E7EB",
  fontSize: 14, outline: "none", background: "#F9FAFB", width: "100%", boxSizing: "border-box"
};

function TInput(props) {
  return (
    <input
      {...props}
      style={inputSx}
      onFocus={e => e.target.style.border = "1.5px solid #2563EB"}
      onBlur={e => e.target.style.border = "1.5px solid #E5E7EB"}
    />
  );
}

function TSelect({ options, ...props }) {
  return (
    <select {...props} style={{ ...inputSx, cursor: "pointer" }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Row({ children, gap = 12 }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${children.length}, 1fr)`, gap }}>{children}</div>;
}

function Btn({ children, variant = "primary", onClick, disabled, full }) {
  const variants = {
    primary: { background: disabled ? "#93C5FD" : "#2563EB", color: "#fff" },
    secondary: { background: "#F3F4F6", color: "#374151" },
  };
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        padding: "13px 24px", borderRadius: 12, border: "none",
        fontWeight: 700, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer",
        width: full ? "100%" : "auto", transition: "all .2s",
        ...variants[variant]
      }}
    >{children}</button>
  );
}

function Card({ title, children, accent }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, padding: "18px 20px",
      boxShadow: "0 1px 6px rgba(0,0,0,.07)", border: "1px solid #F3F4F6",
      borderTop: accent ? `3px solid ${accent}` : undefined, marginBottom: 14
    }}>
      {title && <p style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 14px" }}>{title}</p>}
      {children}
    </div>
  );
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "9px 16px", borderRadius: 10, border: "none",
      background: active ? "#2563EB" : "#F3F4F6",
      color: active ? "#fff" : "#374151",
      fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all .2s"
    }}>{children}</button>
  );
}

function HorarioFields({ data, onChange, prefix = "", titulo }) {
  const p = prefix;
  const g = (name) => p ? `${p}${name.charAt(0).toUpperCase()}${name.slice(1)}` : name;

  return (
    <div style={{
      background: "#F9FAFB", borderRadius: 12, padding: "14px 14px 2px",
      border: "1px solid #E5E7EB", marginBottom: 14
    }}>
      {titulo && (
        <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", margin: "0 0 12px" }}>{titulo}</p>
      )}
      {data.tipoHorario === "continuo" ? (
        <>
          <Row>
            <Field label="Abre às"><TInput type="time" value={data[g("hrInicio")]} onChange={e => onChange(g("hrInicio"), e.target.value)} /></Field>
            <Field label="Fecha às"><TInput type="time" value={data[g("hrFim")]} onChange={e => onChange(g("hrFim"), e.target.value)} /></Field>
          </Row>
          <Field label="Intervalo de manhã/tarde (minutos)" hint="Tempo não trabalhado descontado da jornada">
            <TSelect
              value={data[g("intervalo")]}
              onChange={e => onChange(g("intervalo"), Number(e.target.value))}
              options={[
                { value: 0, label: "Sem intervalo fixo" },
                { value: 30, label: "30 minutos" },
                { value: 60, label: "1 hora" },
                { value: 90, label: "1h30" },
              ]}
            />
          </Field>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", margin: "0 0 8px" }}>1º turno (ex: manhã)</p>
          <Row>
            <Field label="Início"><TInput type="time" value={data[g("t1Inicio")]} onChange={e => onChange(g("t1Inicio"), e.target.value)} /></Field>
            <Field label="Fim"><TInput type="time" value={data[g("t1Fim")]} onChange={e => onChange(g("t1Fim"), e.target.value)} /></Field>
          </Row>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", margin: "8px 0 8px" }}>2º turno (ex: tarde)</p>
          <Row>
            <Field label="Início"><TInput type="time" value={data[g("t2Inicio")]} onChange={e => onChange(g("t2Inicio"), e.target.value)} /></Field>
            <Field label="Fim"><TInput type="time" value={data[g("t2Fim")]} onChange={e => onChange(g("t2Fim"), e.target.value)} /></Field>
          </Row>
        </>
      )}
    </div>
  );
}

function HorarioFimDeSemana({ data, onChange, dia, titulo }) {
  const flag = dia === "sab" ? "sabIgualUtil" : "domIgualUtil";
  const prefix = dia;

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", margin: 0 }}>{titulo}</p>
        <ToggleBtn active={data[flag]} onClick={() => onChange(flag, !data[flag])}>
          {data[flag] ? "Igual dias úteis" : "Horário próprio"}
        </ToggleBtn>
      </div>
      {!data[flag] && <HorarioFields data={data} onChange={onChange} prefix={prefix} />}
    </div>
  );
}

// ─── STEP 1 ───────────────────────────────────────────────────────
function Step1({ data, onChange, onNext }) {
  const incluiSab = data.diasFunc === "6" || data.diasFunc === "7";
  const incluiDom = data.diasFunc === "7";
  const ok = data.setor && validarHorario(getConfigHorario(data, "util"))
    && (!incluiSab || data.sabIgualUtil || validarHorario(getConfigHorario(data, "sab")))
    && (!incluiDom || data.domIgualUtil || validarHorario(getConfigHorario(data, "dom")));

  const resumo = ok ? calcResumoOperacao(data) : null;

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: "0 0 4px" }}>Sobre sua empresa</h2>
      <p style={{ color: "#6B7280", fontSize: 14, margin: "0 0 22px" }}>Vamos calcular as horas de operação e montar a escala ideal.</p>

      <Field label="Nome do negócio (opcional)">
        <TInput placeholder="Ex: Restaurante do João" value={data.nome} onChange={e => onChange("nome", e.target.value)} />
      </Field>

      <Field label="Setor">
        <TSelect
          value={data.setor}
          onChange={e => onChange("setor", e.target.value)}
          options={[
            { value: "", label: "Selecione..." },
            { value: "restaurante", label: "🍽️ Restaurante / Bar" },
            { value: "farmacia", label: "💊 Farmácia" },
            { value: "varejo", label: "🛒 Varejo / Loja" },
            { value: "saude", label: "🏥 Saúde / Clínica" },
            { value: "outro", label: "📦 Outro" },
          ]}
        />
      </Field>

      <Field label="Dias de funcionamento">
        <TSelect
          value={data.diasFunc}
          onChange={e => onChange("diasFunc", e.target.value)}
          options={[
            { value: "7", label: "7 dias por semana" },
            { value: "6", label: "Segunda a Sábado" },
            { value: "5", label: "Segunda a Sexta" },
          ]}
        />
      </Field>

      <Field label="Tipo de horário">
        <div style={{ display: "flex", gap: 8 }}>
          <ToggleBtn active={data.tipoHorario === "continuo"} onClick={() => onChange("tipoHorario", "continuo")}>Turno contínuo</ToggleBtn>
          <ToggleBtn active={data.tipoHorario === "dois"} onClick={() => onChange("tipoHorario", "dois")}>Dois turnos</ToggleBtn>
        </div>
        <Hint>{data.tipoHorario === "continuo" ? "Ex: restaurante self-service, farmácia, varejo" : "Ex: restaurante com manhã e tarde separados"}</Hint>
      </Field>

      <HorarioFields
        data={data}
        onChange={onChange}
        titulo={incluiSab || incluiDom ? "Segunda a Sexta" : undefined}
      />

      {incluiSab && (
        <HorarioFimDeSemana data={data} onChange={onChange} dia="sab" titulo="Sábado" />
      )}

      {incluiDom && (
        <HorarioFimDeSemana data={data} onChange={onChange} dia="dom" titulo="Domingo" />
      )}

      {resumo && (
        <div style={{ background: "#EFF6FF", borderRadius: 10, padding: "12px 14px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 20 }}>📊</span>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#1D4ED8" }}>
              {resumo.temHorariosDiferentes
                ? `${round1(resumo.horasMediaDia)}h média/dia · ${round1(resumo.horasSemanais)}h/semana`
                : `${round1(resumo.horasMaxDia)}h efetivas/dia · ${round1(resumo.horasSemanais)}h/semana`}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "#3B82F6" }}>
              {resumo.temHorariosDiferentes
                ? "Horários diferentes no fim de semana — cálculo pela média semanal"
                : "Horas de operação calculadas automaticamente"}
            </p>
          </div>
        </div>
      )}

      <Btn onClick={onNext} disabled={!ok} full>Continuar →</Btn>
    </div>
  );
}

// ─── STEP 2 ───────────────────────────────────────────────────────
function Step2({ data, empresa, onChange, onNext, onBack }) {
  const resumo = calcResumoOperacao(empresa);
  const recomendacao = recomendar(resumo);

  const ok = data.numFunc > 0 && data.salario > 0;
  const modeloAtivo = data.modeloOverride || recomendacao.modelo;

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: "0 0 4px" }}>Sua equipe</h2>
      <p style={{ color: "#6B7280", fontSize: 14, margin: "0 0 22px" }}>Informe os dados para calcular impacto e montar a grade.</p>

      <Field label="Quantos funcionários?">
        <TInput type="number" min="1" max="50" value={data.numFunc} onChange={e => onChange("numFunc", Number(e.target.value))} />
      </Field>

      <Field label="Salário médio mensal (R$)" hint="Usado para estimar o impacto financeiro da mudança">
        <TInput type="number" min="0" value={data.salario} onChange={e => onChange("salario", Number(e.target.value))} />
      </Field>

      <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
        <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 13, color: "#166534" }}>✨ Recomendação para seu negócio</p>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{recomendacao.motivo}</p>
        <div style={{ display: "flex", gap: 8 }}>
          {["5x2", "4x3"].map(m => (
            <button
              key={m}
              onClick={() => onChange("modeloOverride", m)}
              style={{
                padding: "8px 16px", borderRadius: 9, border: "none",
                background: modeloAtivo === m ? "#2563EB" : "#E5E7EB",
                color: modeloAtivo === m ? "#fff" : "#374151",
                fontWeight: 700, fontSize: 13, cursor: "pointer"
              }}
            >
              {m === recomendacao.modelo ? `⭐ ${m}` : m}
            </button>
          ))}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#6B7280" }}>
          {modeloAtivo === "5x2" ? "5 dias trabalhados / 2 folgas — 8h/dia" : "4 dias trabalhados / 3 folgas — 10h/dia"} · 40h semanais
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <Btn variant="secondary" onClick={onBack}>← Voltar</Btn>
        <Btn onClick={onNext} disabled={!ok}>Ver resultado →</Btn>
      </div>
    </div>
  );
}

// ─── STEP 3 ───────────────────────────────────────────────────────
function Step3({ empresa, equipe, onBack }) {
  const resumo = calcResumoOperacao(empresa);
  const modeloFinal = equipe.modeloOverride || recomendar(resumo).modelo;
  const { escala, funcionarios, horasPorDia, horariosPorGrupo, explicacao } = gerarEscala(equipe.numFunc, modeloFinal, empresa);

  const custoAtual = equipe.numFunc * equipe.salario;
  const custoNovo = custoAtual * (40 / 44);
  const diferenca = custoNovo - custoAtual;
  const pct = ((diferenca / custoAtual) * 100).toFixed(1);

  const diasAtivosIdx = resumo.diasAtivos;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111827", margin: 0 }}>{empresa.nome || "Sua empresa"}</h2>
          <p style={{ color: "#6B7280", fontSize: 12, margin: "2px 0 0" }}>Modelo {modeloFinal} · 40h semanais</p>
        </div>
        <button onClick={() => window.print()} style={{
          padding: "8px 13px", borderRadius: 8, border: "1.5px solid #E5E7EB",
          background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#374151"
        }}>🖨️ Exportar</button>
      </div>

      <Card title="Operação atual" accent="#3B82F6">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            {
              label: resumo.temHorariosDiferentes ? "Horas/dia (média)" : "Horas/dia",
              value: `${round1(resumo.temHorariosDiferentes ? resumo.horasMediaDia : resumo.horasMaxDia)}h`,
            },
            { label: "Dias/semana", value: resumo.diasFuncionamento },
            { label: "Horas/semana", value: `${round1(resumo.horasSemanais)}h` },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1D4ED8" }}>{value}</p>
              <p style={{ margin: 0, fontSize: 11, color: "#6B7280" }}>{label}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          {Object.values(horariosPorGrupo).map((grupo) => {
            const config = getConfigHorario(
              empresa,
              grupo.label === "Sábado" ? "sab" : grupo.label === "Domingo" ? "dom" : "util"
            );
            return (
              <p key={grupo.label} style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>
                🕐 {grupo.label}: {formatTurnos(grupo, config)}
              </p>
            );
          })}
        </div>
      </Card>

      <Card title="Impacto financeiro / mês" accent="#10B981">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 14px" }}>
            <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, color: "#EF4444" }}>ATUAL — 6x1 (44h)</p>
            <p style={{ margin: 0, fontSize: 19, fontWeight: 800, color: "#111827" }}>{fmt(custoAtual)}</p>
          </div>
          <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 14px" }}>
            <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, color: "#22C55E" }}>NOVO — {modeloFinal} (40h)</p>
            <p style={{ margin: 0, fontSize: 19, fontWeight: 800, color: "#111827" }}>{fmt(custoNovo)}</p>
          </div>
        </div>
        <div style={{
          background: diferenca < 0 ? "#F0FDF4" : "#FFF7ED",
          border: `1px solid ${diferenca < 0 ? "#BBF7D0" : "#FED7AA"}`,
          borderRadius: 10, padding: "10px 14px",
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
            {diferenca < 0 ? "💰 Economia estimada" : "📈 Custo adicional"}
          </span>
          <span style={{ fontWeight: 800, fontSize: 15, color: diferenca < 0 ? "#16A34A" : "#EA580C" }}>
            {fmt(Math.abs(diferenca))} ({Math.abs(Number(pct))}%)
          </span>
        </div>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "8px 0 0" }}>* Estimativa proporcional. Consulte seu contador para cálculo exato.</p>
      </Card>

      <Card title="Grade semanal sugerida" accent="#F59E0B">
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#92400E", lineHeight: 1.6 }}>
            💡 <strong>Como organizamos:</strong> {explicacao}
          </p>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "2px 2px", minWidth: 360 }}>
            <thead>
              <tr>
                {DIAS.map(d => (
                  <th key={d} style={{ padding: "5px 2px", fontSize: 10, fontWeight: 700, color: "#6B7280", textAlign: "center" }}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.ceil(equipe.numFunc / 2) }, (_, row) => (
                <tr key={row}>
                  {DIAS.map((_, d) => {
                    const ativo = diasAtivosIdx.includes(d);
                    const funcs = ativo ? (escala[d] || []).slice(row * 2, row * 2 + 2) : [];
                    return (
                      <td key={d} style={{
                        padding: "2px 1px", verticalAlign: "top",
                        background: !ativo ? "#F9FAFB" : "transparent",
                        borderRadius: 4,
                        opacity: !ativo ? 0.4 : 1,
                      }}>
                        {ativo ? funcs.map(f => (
                          <div key={f.id} style={{
                            background: f.cor, color: "#fff", borderRadius: 5,
                            padding: "3px 2px", fontSize: 9, fontWeight: 700,
                            textAlign: "center", marginBottom: 2
                          }}>F{f.id}</div>
                        )) : (
                          row === 0
                            ? <div style={{ fontSize: 9, color: "#D1D5DB", textAlign: "center", paddingTop: 4 }}>—</div>
                            : null
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {funcionarios.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: f.cor }} />
              <span style={{ color: "#374151" }}>F{f.id} · Grupo {f.grupo}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "8px 0 0" }}>
          {horasPorDia}h/dia · {modeloFinal === "5x2" ? "5 dias trabalhados" : "4 dias trabalhados"} = 40h semanais
        </p>
      </Card>

      <Card title="Checklist CLT" accent="#8B5CF6">
        {[
          [true, "Limite de 40h semanais respeitado"],
          [true, "Descanso mínimo de 11h entre jornadas"],
          [true, "Intervalo intrajornada (mín. 1h para jornadas > 6h)"],
          [true, "Descanso Semanal Remunerado (DSR) incluído"],
          [null, "Verifique adicional noturno se houver turno após 22h"],
          [null, "Confirme encargos da nova jornada com seu contador"],
        ].map(([ok, texto], i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 9, alignItems: "flex-start" }}>
            <span style={{ fontSize: 15 }}>{ok ? "✅" : "⚠️"}</span>
            <span style={{ fontSize: 13, color: ok ? "#374151" : "#92400E", lineHeight: 1.4 }}>{texto}</span>
          </div>
        ))}
      </Card>

      <Btn variant="secondary" onClick={onBack} full>← Recalcular</Btn>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState(0);
  const [empresa, setEmpresa] = useState({
    nome: "", setor: "", diasFunc: "7",
    tipoHorario: "continuo",
    hrInicio: "08:00", hrFim: "22:00", intervalo: 60,
    t1Inicio: "11:00", t1Fim: "15:00",
    t2Inicio: "18:00", t2Fim: "23:00",
    sabIgualUtil: true,
    sabHrInicio: "09:00", sabHrFim: "18:00", sabIntervalo: 60,
    sabT1Inicio: "11:00", sabT1Fim: "15:00",
    sabT2Inicio: "18:00", sabT2Fim: "22:00",
    domIgualUtil: true,
    domHrInicio: "10:00", domHrFim: "16:00", domIntervalo: 60,
    domT1Inicio: "11:00", domT1Fim: "14:00",
    domT2Inicio: "17:00", domT2Fim: "21:00",
  });
  const [equipe, setEquipe] = useState({ numFunc: "", salario: "", modeloOverride: null });

  const updE = (k, v) => setEmpresa(p => ({ ...p, [k]: v }));
  const updQ = (k, v) => setEquipe(p => ({ ...p, [k]: v }));

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 100%)",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "28px 16px",
      fontFamily: "'Segoe UI', system-ui, sans-serif"
    }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "#fff", borderRadius: 12, padding: "8px 18px",
            boxShadow: "0 1px 6px rgba(0,0,0,.09)", marginBottom: 6
          }}>
            <span style={{ fontSize: 20 }}>📅</span>
            <span style={{ fontWeight: 800, fontSize: 18, color: "#1D4ED8" }}>EscalaFácil</span>
          </div>
          <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>Adapte sua empresa ao fim da escala 6x1</p>
        </div>

        <div style={{ background: "#fff", borderRadius: 20, padding: "26px 22px", boxShadow: "0 4px 24px rgba(0,0,0,.08)" }}>
          {step < 2 && <Steps atual={step} />}
          {step === 0 && <Step1 data={empresa} onChange={updE} onNext={() => setStep(1)} />}
          {step === 1 && <Step2 data={equipe} empresa={empresa} onChange={updQ} onNext={() => setStep(2)} onBack={() => setStep(0)} />}
          {step === 2 && <Step3 empresa={empresa} equipe={equipe} onBack={() => setStep(1)} />}
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: "#9CA3AF", marginTop: 14 }}>
          Baseado na PEC 8/25 em tramitação no Congresso Nacional
        </p>
      </div>
      <style>{`* { box-sizing: border-box; } @media print { body > * { display: none; } #root { display: block !important; background: white !important; } }`}</style>
    </div>
  );
}
