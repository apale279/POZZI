from pathlib import Path

p = Path(__file__).resolve().parents[1] / "src/components/SheetEditorWindow.tsx"
text = p.read_text(encoding="utf-8")
start_marker = '      <section className="sheet-editor-ingest">'
end_marker = '      <section className="sheet-editor-table-section">'
start = text.index(start_marker)
end = text.index(end_marker)
replacement = """      <SheetIngestPanel
        textItems={textItems}
        onTextItemsChange={setTextItems}
        imageItems={imageItems}
        onImageItemsChange={setImageItems}
        documentItems={documentItems}
        onDocumentItemsChange={setDocumentItems}
        onAnalyzeText={runTextAnalysis}
        onAnalyzeImages={runImageAnalysis}
        onAnalyzeDocuments={runDocumentAnalysis}
        loading={loading}
      />

      <div className="calc-row sheet-editor-tools">
        <button type="button" className="btn-secondary" onClick={refreshCalculated}>
          Ottimizza record (P.O.Z.Z.I.)
        </button>
        {calcHints.length > 0 && (
          <p className="hint ok-inline">
            Applicati {calcHints.length} campi: ANNO, identità, BMI, P/F, CI, età, GCS… (solo celle
            vuote).
          </p>
        )}
        {error && <p className="error-msg">{error}</p>}
      </div>

"""
p.write_text(text[:start] + replacement + text[end:], encoding="utf-8")
print("patched")
