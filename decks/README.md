# Deck files

Each `*.json` file here is one deck (one module). They are bundled into the app and merged into the
cards on every device when the app opens, so adding cards = edit a file here, run `npm test`, commit, push.

```json
{
  "id": "ma4801",
  "name": "MA4801 Mathematical Foundations of ML",
  "cards": [
    { "id": "l01-svd-def", "front": "What is the SVD of $A \\in \\mathbb{R}^{m\\times n}$?", "back": "$A = U\\Sigma V^\\top$ with ..." }
  ]
}
```

- `id` (deck and card): letters, digits, `-`, `_`. **Never change or reuse a card id**: it links the card to its
  review progress. Editing `front`/`back` keeps the progress; a card removed from the file is deleted in the app
  (with its history), and a new id is a new card.
- Card order is the order new cards are studied in.
- `front`/`back` use the card text format (LaTeX, embedded images) described in `project.md`, "Card text format".
  In JSON, backslashes are doubled.
- `npm test` validates every file here; CI runs it before deploying, so an invalid file blocks the deploy.
- A deck deleted in the app stays deleted until its file changes. Cards I add in the app to such a deck are kept.
