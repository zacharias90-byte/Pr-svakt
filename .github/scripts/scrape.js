name: Scrape oljuprísir

on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Scrape prices
        run: node .github/scripts/scrape.js

      - name: Commit prices
        run: |
          git config user.name "Prísvakt Bot"
          git config user.email "bot@prisvakt.fo"
          git add prices-override.json
          git diff --staged --quiet && echo "Eingi broytingar" && exit 0
          git commit -m "Uppfær prísir $(date '+%d/%m/%Y %H:%M')"
          git pull --rebase origin main
          git push origin main
