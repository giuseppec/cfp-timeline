# ML Conference Deadlines

This repository is a fork of [`lucjaulmes/cfp-timeline`](http://github.com/lucjaulmes/cfp-timeline/).

Both this repository and the upstream project display upcoming Computer Science conferences on a timeline, together with important deadlines (abstract registration, submission, notification, camera-ready) and conference dates.

This fork narrows the scope to a subset of research areas (machine learning, AI, NLP, computer vision, data management) and applies some packaging and interface changes for that use case.

The upstream repository remains the general/broader version. This repository should be understood as a specialized view.

## Differences

This repository started from [`lucjaulmes/cfp-timeline`](http://github.com/lucjaulmes/cfp-timeline/). The following differences are user-visible in this fork:

1. Scope of conferences

* **Upstream:** Broad list from CORE and GGS across many fields and ranks.
* **This fork:** Curated subset focused on ML, AI, NLP, CV, and Data Management / Data Science. Lower-ranked or out-of-scope venues are dropped, so `core.csv` / `ggs.csv` and the rendered timeline are shorter and more field-specific.

2. Filtering and display

* **Conference selection**

  * **Upstream:** Free-text search with live suggestions (by acronym or name).
  * **This fork:** Fixed selectable list of approved conferences.

* **Date window**

  * **Upstream:** Sliding window (past few months to near future).
  * **This fork:** Broad fixed calendar window starting at the beginning of the previous year, plus explicit Start/End date controls (Apply / Reset).

3. Styling and layout

* **Upstream:** Original CSS and layout; no special handling for small screens or scroll alignment.
* **This fork:** Updated font/spacing/color scheme; legend, warnings, and headings restyled; layout tuned for smaller screens. JavaScript also compensates for scrollbar width so the month/year header lines up with the scrollable body.

4. Deadline recovery / inferred dates

* **Upstream:** Uses only structured fields from WikiCFP. If submission / notification / camera-ready / conference dates are missing or inconsistent, they remain blank in the timeline.
* **This fork:** Also scrapes free-text CFP descriptions to infer missing dates. Irrecoverable or contradictory cases are logged in `parsing_errors.txt`. In the timeline, recovered dates are shown and marked as estimated/extrapolated (not left blank), and this is explained in the legend.

---

## License

This repository and the upstream project are licensed under GPLv3 (see `LICENSE.md`).
Credit for the original design, data model, and scraping logic goes to [`lucjaulmes/cfp-timeline`](http://github.com/lucjaulmes/cfp-timeline/).
