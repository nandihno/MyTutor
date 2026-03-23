function handleModeClick(mode) {
  console.log(`${mode} selected`)
}

export default function App() {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Assessment support</p>
        <h1>MyTutor</h1>
        <p className="subtitle">AI Assessment Assistant</p>
        <div className="actions">
          <button type="button" onClick={() => handleModeClick('Teacher Mode')}>
            Teacher Mode
          </button>
          <button type="button" onClick={() => handleModeClick('Word Count Mode')}>
            Word Count Mode
          </button>
        </div>
      </section>
    </main>
  )
}
