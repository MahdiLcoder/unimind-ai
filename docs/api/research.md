# Research API

Research routes are authenticated and mounted under `/api/v1/research`.
FastAPI's generated contract is available at `/openapi.json` and Swagger UI at
`/docs`.

- `POST /search` queries Crossref, saves returned papers, and records the
  successful query and result count in the authenticated user's search history.
- `GET /search-history` returns that user's recent persisted searches.
- `GET /papers` and `DELETE /papers/{paper_id}` list and manage the user's
  saved bibliography.
- `POST /compare` accepts two or three saved paper IDs. The API verifies all
  selected records belong to the authenticated user and sends only their saved
  metadata and available abstracts to the research agent. Missing or
  unowned papers return `404`.

Comparison summaries are generated at request time and are not persisted.
They are grounded only in supplied saved-paper metadata/abstracts; conclusions
that require full-text access remain outside the current API.
