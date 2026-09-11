<div align="center">

# Thesys

[![GitHub stars](https://img.shields.io/github/stars/Sreehari05055/thesys-core?style=flat)](https://github.com/Sreehari05055/thesys-core/stargazers)
[![License: AGPL-3.0](https://img.shields.io/github/license/Sreehari05055/thesys-core?style=flat)](LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/Sreehari05055/thesys-core?style=flat)](https://github.com/Sreehari05055/thesys-core/commits)
[![Issues](https://img.shields.io/github/issues/Sreehari05055/thesys-core?style=flat)](https://github.com/Sreehari05055/thesys-core/issues)

</div>

Local research workspace: search open-access papers, upload PDFs, ask questions with on-page highlights, and export citations.

![On-PDF highlights from cited passages](screenshots/visual_highlights.png)

## Features

**Chat over your research papers.** Answers cite sources in the document. Click a citation to jump the preview. **Full** highlights the whole retrieved passage; **Focused** (default) paints a tighter highlight on the same passage. Toggle in the PDF header.

![Focused line highlights vs Full passage](screenshots/precise_highlights.png)

**Reader mode.** Open a paper full-width, select text, and ask about that span.

![Reader mode](screenshots/reader_mode.png)

**Document summaries.** Follows a general format of problem statement, methodology, key findings, limitations, and metrics. Citations still jump to the highlighted passage.

![Document summary](screenshots/summary.png)

**Discover papers.** Search the web (OpenAlex) from the chat, preview a record, open the link, or add it to the library.

![Paper search](screenshots/search_papers.png)

**Library and export.** Session files in one place. Bibliography export as BibTeX, RIS, EndNote, or CSV.

![My Library](screenshots/my_library.png)

![Citation export](screenshots/exports.png)

## How it runs

- **Frontend:** React (Vite) on port `5000`
- **Backend:** FastAPI on port `8000`
- **Local RAG:** Docling ingest → Chroma + BGE embeddings → BGE reranker
- **Chat:** OpenAI via LangChain
- **Paper search:** OpenAlex (optional API key)
- **Citations:** CiteAs (uses `EMAIL`)

PDFs, vectors, and chat history stay on disk under `backend/data/`. First ingest downloads embedding/rerank weights (Hugging Face). GPU helps; CPU works and is slower.

## Requirements

- Python 3.11+ and Node.js 20+ (local run), **or** Docker
- An OpenAI API key

## Setup

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Set at least `OPENAI_API_KEY` and `EMAIL` in `backend/.env`. `HF_TOKEN` is optional (Hugging Face rate limits). `OPENALEX_API_KEY` is optional.

```bash
cd backend
python main.py
```

```bash
cd frontend
npm install
npm run dev
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000). The UI talks to `VITE_API_BASE_URL` (default `http://127.0.0.1:8000`).

## Docker

Copy `backend/.env.example` to `backend/.env` and set `OPENAI_API_KEY` and `EMAIL`. Then:

```bash
docker compose up --build
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000). First build is large (CPU PyTorch, Docling). First ingest still downloads Hugging Face weights inside the container.

Stop without deleting papers or chat history:

```bash
docker compose down
```

That keeps the `thesys-data` volume. `docker compose down -v` deletes it.

## Later

- [ ] Optional Cohere embeddings and reranker for users who want higher retrieval quality. Local BGE stays the default.
- [ ] Per-chat settings: saved title, selected model, and reasoning effort.

## License

[AGPL-3.0](LICENSE)
