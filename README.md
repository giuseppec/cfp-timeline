# CFP Timeline

This repository is a fork of [`lucjaulmes/cfp-timeline`](http://github.com/lucjaulmes/cfp-timeline/).

Both this repository and the upstream project display upcoming Computer Science conferences on a timeline, together with important deadlines (abstract registration, submission, notification, camera-ready) and conference dates.

This fork narrows the scope to a subset of research areas (machine learning, AI, NLP, computer vision, data management) and applies some packaging and interface changes for that use case.

The upstream repository remains the general/broader version. This repository should be understood as a specialized view.

## Relationship to the upstream project

This repository started from [`lucjaulmes/cfp-timeline`](http://github.com/lucjaulmes/cfp-timeline/). The following differences are user-visible in this fork:

1. Scope of conferences
   The upstream project includes a broad list of conferences from the CORE and GGS rankings (many fields, many ranks).
   This fork keeps a filtered subset, mainly in Machine Learning, Artificial Intelligence, NLP, Computer Vision, and Data Management / Data Science.
   Lower-ranked or out-of-scope venues are not included here. As a result, `core.csv` / `ggs.csv` and the rendered timeline are shorter and more field-specific.

2. Bundled data
   This fork commits a generated `cfp.json` to the repository.
   You can open `index.html` and immediately see deadlines without first running the scraper.
   In the upstream project, regenerating that data is part of normal usage.

3. Page controls
   The upstream UI exposes a search box (with live suggestions) so you can look up conferences by acronym or name.
   In this fork, the main user control is a date range selector (Start Date / End Date + Apply / Reset).
   The filter block is still present, but text search is not the primary entry point.
   Effect: the interaction style is “show me this window in time” instead of “search by name.”

4. Timeline window and rank display
   The upstream code computes a moving window (roughly past few months → well into the future) and shows a full rank scale, including many rank levels.
   This fork:

   * uses a fixed broad window based on calendar boundaries (roughly from the start of the previous year through the current year),
   * shows only higher-tier ranks.
     This mainly affects which conferences appear and how the horizontal axis is initialized.

5. Styling and layout
   The CSS in this fork applies a different visual style (font stack, spacing, colors, responsive layout).
   The legend, warning boxes, and headings are visually adjusted, and the layout is tuned for smaller screens.
   JavaScript also compensates for the scrollbar width so that the month/year header lines up more consistently with the scrollable body.

6. Deadline recovery / inferred dates
   When a CFP listing on WikiCFP is incomplete, the data-generation process does not rely only on the structured “metadata” fields.
   It also attempts to read dates from the free-text body/description of the CFP and, where possible, fill in missing submission / notification / camera-ready / conference dates.
   If dates still cannot be recovered or are clearly inconsistent (e.g. “submission after the conference starts”), they are recorded in `parsing_errors.txt`, and in the timeline such dates can be marked as inferred or extrapolated.
   Visible effect for the user: fewer conferences appear with “missing” deadlines — instead, deadlines are shown (and flagged as estimated or extrapolated in the legend) rather than being left blank.

---

## License

This repository and the upstream project are licensed under GPLv3 (see `LICENSE.md`).
Credit for the original design, data model, and scraping logic goes to [`lucjaulmes/cfp-timeline`](http://github.com/lucjaulmes/cfp-timeline/).
