# Seed data sources

Downloaded once into `.seed-cache/` (git-ignored) by `bun run db:seed`.

| Data                                   | Source                                                                                 | Pin                                               | Licence  |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- | -------- |
| Indonesia provinces and kota/kabupaten | `cahyadsn/wilayah`, `db/wilayah.sql` (Kepmendagri codes)                               | commit `be9d3e301c962b46e1a5ef2275424cfa0b53a7ef` | MIT      |
| Other countries, states                | `dr5hn/countries-states-cities-database`, `csv/countries.csv`, `csv/states.csv`        | tag `v5.0.0`                                      | ODbL-1.0 |
| Other cities                           | same project, release asset `csv-cities.csv.gz` (`cities.csv` is not in the repo tree) | release `v5.0.0-export.1`                         | ODbL-1.0 |

Both licences allow use in this app. ODbL requires credit: the About page must credit the
countries-states-cities-database project, as the foundation design already says.

Rows for Indonesia in the dr5hn data are skipped; wilayah is the source for Indonesia.
