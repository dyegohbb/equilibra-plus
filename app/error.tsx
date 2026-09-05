"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="welcome-main"><div className="welcome-content"><h1>Vamos tentar de novo?</h1><p className="welcome-description">Não foi possível conectar ao seu espaço agora.</p><button className="primary-button" onClick={reset}>Tentar novamente</button></div></main>;
}
