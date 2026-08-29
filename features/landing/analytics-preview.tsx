const bars = [26, 35, 31, 46, 43, 59, 52, 69, 62, 78, 71, 88] as const;

function TrendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="m3 14 4-4 3 2 6-7m-4 0h4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AnalyticsPreview() {
  return (
    <div className="analytics-card">
      <div className="preview-label">Vista demo · datos ilustrativos</div>

      <div className="match-header">
        <div>
          <span>Premier League · En vivo</span>
          <h2>North London FC</h2>
          <h2>Westbridge United</h2>
        </div>
        <div className="match-score">
          <span>67&apos;</span>
          <strong>1—0</strong>
        </div>
      </div>

      <div className="signal-panel">
        <div className="signal-title">
          <div className="signal-icon"><TrendIcon /></div>
          <div>
            <span>Señal detectada</span>
            <strong>Más de 1.5 goles</strong>
          </div>
          <span className="qualified-badge">CALIFICADA</span>
        </div>

        <div className="metrics-row">
          <div>
            <span>Probabilidad</span>
            <strong>78%</strong>
          </div>
          <div>
            <span>Edge</span>
            <strong className="positive">+9.4%</strong>
          </div>
          <div>
            <span>Cuota</span>
            <strong>1.46</strong>
          </div>
        </div>

        <div className="score-row">
          <div className="score-ring" aria-label="Smart Score demo: 82 de 100">
            <span>82</span>
            <small>SMART<br />SCORE</small>
          </div>
          <div className="pressure-chart">
            <div className="chart-heading">
              <span>Presión en vivo</span>
              <strong>Alta</strong>
            </div>
            <div className="bars" aria-hidden="true">
              {bars.map((height, index) => (
                <span key={`${height}-${index}`} style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="chart-axis"><span>52&apos;</span><span>Ahora</span></div>
          </div>
        </div>

        <div className="reason-row">
          <span><i /> 6 remates últimos 10 min</span>
          <span><i /> Datos completos</span>
          <span><i /> Movimiento favorable</span>
        </div>
      </div>
    </div>
  );
}
