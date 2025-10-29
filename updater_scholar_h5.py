import csv
import argparse
import random
import re
import time
from typing import List, Optional, Tuple
from difflib import SequenceMatcher
import os

import pandas as pd
import requests
from bs4 import BeautifulSoup


SCHOLAR_VENUE_SEARCH = (
    "https://scholar.google.com/citations?view_op=search_venues&hl=en&vq="
)


def detect_delimiter(csv_path: str) -> str:
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        sample = f.read(8192)
    try:
        dialect = csv.Sniffer().sniff(sample)
        return dialect.delimiter
    except Exception:
        return ","


def load_core(path: str = "core.csv") -> Tuple[pd.DataFrame, str]:
    sep = detect_delimiter(path)
    df = pd.read_csv(path, sep=sep, dtype=str, encoding="utf-8")
    return df, sep


def normalize_tokens(title: str) -> List[str]:
    fillers = {
        "of",
        "on",
        "for",
        "and",
        "in",
        "the",
    }
    # Replace punctuation/special characters with whitespace before tokenization
    cleaned_title = re.sub(r"[^A-Za-z0-9']+", " ", title)
    raw_tokens = re.findall(r"[A-Za-z0-9']+", cleaned_title)
    tokens: List[str] = []
    for tok in raw_tokens:
        tok_l = tok.lower()
        if tok_l in fillers:
            continue
        tokens.append(tok_l)
    return tokens


def build_queries(title: str) -> List[str]:
    # Return only the initial cleaned query; fallback handled iteratively elsewhere
    title = (title or "").strip()
    tokens = normalize_tokens(title)
    if not tokens:
        return []
    cleaned = " ".join(tokens)
    return [cleaned]


def extract_acronym(title: str) -> Optional[str]:
    # Look for content in parentheses and prefer the longest uppercase-like group
    parts = re.findall(r"\(([^)]+)\)", title or "")
    best = None
    for p in parts:
        p_stripped = p.strip()
        if not p_stripped:
            continue
        # Accept acronyms with letters, digits, ampersands, slashes, and hyphens
        if re.fullmatch(r"[A-Za-z0-9&/\-]+", p_stripped):
            # Prefer those with at least 2 uppercase letters
            if sum(1 for ch in p_stripped if ch.isupper()) >= 2:
                if best is None or len(p_stripped) > len(best):
                    best = p_stripped
    return best


def _make_request(url: str) -> Optional[str]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }
    try:
        resp = requests.get(url, headers=headers, timeout=20)
        # Rate limiting between all requests
        time.sleep(2.0)
        if resp.status_code != 200:
            return None
        return resp.text
    except Exception:
        return None


def _find_results_table(soup: BeautifulSoup) -> Optional[BeautifulSoup]:
    # Prefer tables whose headers include Publication, h5-index, h5-median
    tables = soup.find_all("table")
    for table in tables:
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        if not headers:
            # Some pages may use role attributes or div-based headers; skip
            continue
        if (
            any("publication" in h for h in headers)
            and any("h5-index" in h for h in headers)
            and any("h5-median" in h for h in headers)
        ):
            return table
    # Try class hints if headers didn't match explicitly
    table = soup.select_one("table.gsc_mvt_table, table:has(th:contains('Publication'))")
    return table


def _parse_all_rows_from_table(table: BeautifulSoup) -> List[Tuple[str, str, str]]:
    # Map header names to column indices
    headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
    try:
        idx_pub = next(i for i, h in enumerate(headers) if "publication" in h)
        idx_h5i = next(i for i, h in enumerate(headers) if "h5-index" in h)
        idx_h5m = next(i for i, h in enumerate(headers) if "h5-median" in h)
    except StopIteration:
        return []

    candidates: List[Tuple[str, str, str]] = []
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if not tds:
            continue
        if max(idx_pub, idx_h5i, idx_h5m) >= len(tds):
            continue
        pub_cell = tds[idx_pub]
        pub_anchor = pub_cell.find("a")
        pub = pub_anchor.get_text(strip=True) if pub_anchor else pub_cell.get_text(strip=True)

        def _extract_numeric(td: BeautifulSoup) -> str:
            num = None
            nnode = td.find(class_=re.compile(r"gsc_mvt_n"))
            if nnode:
                num = re.search(r"\d+", nnode.get_text(strip=True) or "")
            if not num:
                num = re.search(r"\d+", td.get_text(strip=True) or "")
            return num.group(0) if num else "NA"

        h5_index = _extract_numeric(tds[idx_h5i])
        h5_median = _extract_numeric(tds[idx_h5m])
        candidates.append((pub or "NA", h5_index or "NA", h5_median or "NA"))
    return candidates


def fetch_venue_info(query: str) -> Optional[Tuple[str, str, str]]:
    try:
        from urllib.parse import quote_plus

        url = SCHOLAR_VENUE_SEARCH + quote_plus(query)
        html = _make_request(url)
        if not html:
            return None
        if "didn't match any publications" in html:
            return None
        soup = BeautifulSoup(html, "lxml")
        table = _find_results_table(soup)
        if not table:
            return None
        # Keep backward compatibility: if exactly one row, return it; if none or many, return None
        rows = _parse_all_rows_from_table(table)
        if len(rows) == 1:
            return rows[0]
        return None
    except Exception:
        return None


def fetch_venue_candidates(query: str) -> List[Tuple[str, str, str]]:
    try:
        from urllib.parse import quote_plus

        url = SCHOLAR_VENUE_SEARCH + quote_plus(query)
        html = _make_request(url)
        if not html:
            return []
        if "didn't match any publications" in html:
            return []
        soup = BeautifulSoup(html, "lxml")
        table = _find_results_table(soup)
        if not table:
            return []
        return _parse_all_rows_from_table(table)
    except Exception:
        return []


def _normalize_for_similarity(s: str) -> str:
    s = s or ""
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def select_best_candidate(title: str, candidates: List[Tuple[str, str, str]], threshold: float = 0.6) -> Optional[Tuple[str, str, str]]:
    title_n = _normalize_for_similarity(title)
    best = None
    best_score = -1.0
    best_h5i = -1
    for pub, h5i, h5m in candidates:
        pub_n = _normalize_for_similarity(pub)
        score = SequenceMatcher(None, title_n, pub_n).ratio()
        try:
            h5i_num = int(h5i)
        except Exception:
            h5i_num = -1
        if score > best_score or (abs(score - best_score) < 1e-9 and h5i_num > best_h5i):
            best = (pub, h5i, h5m)
            best_score = score
            best_h5i = h5i_num
    if best is not None and best_score >= threshold:
        return best
    return None


def update_row(row: pd.Series) -> pd.Series:
    title = row.get("title", "") if isinstance(row, pd.Series) else ""
    queries = build_queries(title)
    pub = "NA"
    h5_index = "NA"
    h5_median = "NA"
    query_used = "NA"
    match_stage = "NO MATCH"
    tried_any = False
    for q in queries:
        tried_any = True
        cands = fetch_venue_candidates(q)
        chosen = select_best_candidate(title, cands)
        if chosen is not None:
            pub, h5_index, h5_median = chosen
            query_used = q
            match_stage = "MATCH"
            print(
                f"[MATCH] title='{title}' query='{q}' pub='{pub}' h5-index={h5_index} h5-median={h5_median}"
            )
            break
        else:
            print(f"[NOT FOUND] query='{q}' h5-index=NA h5-median=NA")
    # Try acronym query from CSV column before fallback if no match yet
    if (pub, h5_index, h5_median) == ("NA", "NA", "NA"):
        acr_raw = row.get("acronym", "") if isinstance(row, pd.Series) else ""
        acr = str(acr_raw).strip()
        if acr and acr.upper() != "NA" and acr.lower() != "nan":
            q = acr
            cands = fetch_venue_candidates(q)
            chosen = select_best_candidate(title, cands)
            if chosen is not None:
                pub, h5_index, h5_median = chosen
                query_used = q
                match_stage = "ACRONYM MATCH"
                print(
                    f"[ACRONYM MATCH] title='{title}' query='{q}' pub='{pub}' h5-index={h5_index} h5-median={h5_median}"
                )
            else:
                print(f"[ACRONYM NOT FOUND] query='{q}' h5-index=NA h5-median=NA")
    # Fallback: deterministic contiguous n-gram sliding windows
    if (pub, h5_index, h5_median) == ("NA", "NA", "NA"):
        tokens = normalize_tokens(title)
        L = len(tokens)
        # Distinguishing words threshold: exclude common words from the count
        def distinguishing_count(toks: List[str]) -> int:
            common = {"international", "conference"}
            return sum(1 for t in toks if t not in common)

        # Try windows by removing 1, then 2 words max, never below 3 tokens
        max_removed = min(2, max(0, L - 3))
        fallback_failed_sim = False
        for removed in range(1, max_removed + 1):
            win = L - removed
            if win < 3:
                continue
            for start in range(0, max(0, L - win + 1)):
                q = " ".join(tokens[start : start + win])
                # Skip queries that do not have at least 3 distinguishing words
                if distinguishing_count(tokens[start : start + win]) < 3:
                    print(
                        f"[FALLBACK SKIP] query='{q}' reason='insufficient distinguishing words'"
                    )
                    continue
                cands = fetch_venue_candidates(q)
                chosen = select_best_candidate(title, cands)
                if chosen is not None:
                    cand_pub = chosen[0]
                    title_n = _normalize_for_similarity(title)
                    pub_n = _normalize_for_similarity(cand_pub)
                    sim = SequenceMatcher(None, title_n, pub_n).ratio()
                    if sim >= 0.70:
                        pub, h5_index, h5_median = chosen
                        query_used = q
                        match_stage = (
                            "FALLBACK 1 WORD REMOVED MATCH" if removed == 1 else "FALLBACK 2 WORDS REMOVED MATCH"
                        )
                        print(
                            f"[FALLBACK MATCH] title='{title}' query='{q}' pub='{pub}' sim={sim:.3f} h5-index={h5_index} h5-median={h5_median}"
                        )
                        break
                    else:
                        fallback_failed_sim = True
                        print(
                            f"[FALLBACK SIMILARITY CHECK FAILED] title='{title}' query='{q}' cand_pub='{cand_pub}' sim={sim:.3f}"
                        )
                else:
                    print(
                        f"[FALLBACK NOT FOUND] query='{q}' h5-index=NA h5-median=NA"
                    )
            if (pub, h5_index, h5_median) != ("NA", "NA", "NA"):
                break
        if (pub, h5_index, h5_median) == ("NA", "NA", "NA") and fallback_failed_sim:
            match_stage = "FALLBACK SIMILARITY CHECK FAILED"
    # Fallback mode 3: remove common words and all-uppercase words
    if (pub, h5_index, h5_median) == ("NA", "NA", "NA"):
        words_to_remove = {"conference", "joint", "workshop", "symposium"}
        # Split title into words preserving original case for uppercase detection
        title_words = re.findall(r"\b[A-Za-z0-9]+\b", title or "")
        filtered_words = []
        for word in title_words:
            word_lower = word.lower()
            # Skip words in removal list
            if word_lower in words_to_remove:
                continue
            # Skip all-uppercase words (likely acronyms, e.g., "ICML", "NIPS")
            if word.isupper() and len(word) > 1:
                continue
            filtered_words.append(word_lower)
        if len(filtered_words) >= 3:  # Require at least 3 words
            q = " ".join(filtered_words)
            cands = fetch_venue_candidates(q)
            chosen = select_best_candidate(title, cands)
            fallback3_failed_sim = False
            if chosen is not None:
                cand_pub = chosen[0]
                title_n = _normalize_for_similarity(title)
                pub_n = _normalize_for_similarity(cand_pub)
                sim = SequenceMatcher(None, title_n, pub_n).ratio()
                if sim >= 0.70:
                    pub, h5_index, h5_median = chosen
                    query_used = q
                    match_stage = "FALLBACK MODE 3 MATCH"
                    print(
                        f"[FALLBACK MODE 3 MATCH] title='{title}' query='{q}' pub='{pub}' sim={sim:.3f} h5-index={h5_index} h5-median={h5_median}"
                    )
                else:
                    fallback3_failed_sim = True
                    print(
                        f"[FALLBACK MODE 3 SIMILARITY CHECK FAILED] title='{title}' query='{q}' cand_pub='{cand_pub}' sim={sim:.3f}"
                    )
            else:
                print(
                    f"[FALLBACK MODE 3 NOT FOUND] title='{title}' query='{q}' h5-index=NA h5-median=NA"
                )
            if (pub, h5_index, h5_median) == ("NA", "NA", "NA") and fallback3_failed_sim:
                match_stage = "FALLBACK MODE 3 SIMILARITY CHECK FAILED"
    # Substring mode: split title on "and" and try each part with >= 4 words
    if (pub, h5_index, h5_median) == ("NA", "NA", "NA"):
        title_lower = (title or "").lower()
        if " and " in title_lower:
            # Find the first occurrence of " and " (with spaces)
            idx = title_lower.find(" and ")
            if idx >= 0:
                before = title[:idx].strip()
                after = title[idx + 5:].strip()  # 5 = len(" and ")
                parts = []
                if before:
                    parts.append(before)
                if after:
                    parts.append(after)
                
                substring_failed_sim = False
                for part in parts:
                    part_tokens = normalize_tokens(part)
                    if len(part_tokens) >= 4:
                        q = " ".join(part_tokens)
                        cands = fetch_venue_candidates(q)
                        chosen = select_best_candidate(title, cands)
                        if chosen is not None:
                            cand_pub = chosen[0]
                            title_n = _normalize_for_similarity(title)
                            pub_n = _normalize_for_similarity(cand_pub)
                            sim = SequenceMatcher(None, title_n, pub_n).ratio()
                            if sim >= 0.65:
                                pub, h5_index, h5_median = chosen
                                query_used = q
                                match_stage = "SUBSTRING MODE MATCH"
                                print(
                                    f"[SUBSTRING MODE MATCH] title='{title}' part='{part}' query='{q}' pub='{pub}' sim={sim:.3f} h5-index={h5_index} h5-median={h5_median}"
                                )
                                break
                            else:
                                substring_failed_sim = True
                                print(
                                    f"[SUBSTRING MODE SIMILARITY CHECK FAILED] title='{title}' part='{part}' query='{q}' cand_pub='{cand_pub}' sim={sim:.3f}"
                                )
                        else:
                            print(
                                f"[SUBSTRING MODE NOT FOUND] title='{title}' part='{part}' query='{q}' h5-index=NA h5-median=NA"
                            )
                        if (pub, h5_index, h5_median) != ("NA", "NA", "NA"):
                            break
                if (pub, h5_index, h5_median) == ("NA", "NA", "NA") and substring_failed_sim:
                    match_stage = "SUBSTRING MODE SIMILARITY CHECK FAILED"
    row["gs_publication"] = pub
    row["gs_query_used"] = query_used
    row["gs_match_stage"] = match_stage
    # Convert numeric strings to ints where possible; else keep "NA"
    def _to_int_or_na(val: str) -> str:
        if isinstance(val, str) and val.isdigit():
            return str(int(val))
        return "NA"

    row["h5_index"] = _to_int_or_na(h5_index)
    row["h5_median"] = _to_int_or_na(h5_median)
    return row


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch h5 metrics from Google Scholar venues")
    parser.add_argument("--sample", type=int, default=None, help="Process a deterministic sample of N rows")
    parser.add_argument(
        "--rows",
        type=str,
        default=None,
        help=(
            "Comma-separated list of 1-based line numbers and/or ranges to update, "
            "e.g. '5,7,10-12'. Only these lines in core.csv will be scraped and updated."
        ),
    )
    parser.add_argument(
        "--nomatch",
        action="store_true",
        help=(
            "Select rows where gs_match_stage == 'NO MATCH' and update them (like --rows)."
        ),
    )
    args = parser.parse_args()

    random.seed(0)
    df, sep = load_core("core.csv")
    def _safe_write(out_df: pd.DataFrame, path: str) -> None:
        try:
            out_df.to_csv(path, index=False, sep=sep, encoding="utf-8")
        except PermissionError:
            alt = os.path.splitext(path)[0] + "_partial" + os.path.splitext(path)[1]
            print(f"[WARN] Could not write {path} (locked). Writing to {alt} instead.")
            out_df.to_csv(alt, index=False, sep=sep, encoding="utf-8")

    def _compute_similarity_column(out_df: pd.DataFrame) -> pd.DataFrame:
        # Add gs_smilarity column comparing title and gs_publication
        sims: List[str] = []
        for _, r in out_df.iterrows():
            title = r.get("title", "")
            pub = r.get("gs_publication", "")
            if pd.isna(pub) or str(pub).strip().upper() == "NA":
                sims.append("NA")
                continue
            t_norm = _normalize_for_similarity(str(title))
            p_norm = _normalize_for_similarity(str(pub))
            score = SequenceMatcher(None, t_norm, p_norm).ratio()
            sims.append(f"{score:.6f}")
        out_df["gs_smilarity"] = sims
        return out_df
    # Ensure new columns exist and are NA initially
    for col in ["gs_publication", "gs_query_used", "gs_match_stage", "h5_index", "h5_median"]:
        if col not in df.columns:
            df[col] = "NA"

    # Helper to parse 1-based rows/ranges like "3,5,10-12" into 0-based integer indices
    def _parse_rows_spec(spec: Optional[str], max_len: int) -> List[int]:
        if not spec:
            return []
        indices: List[int] = []
        parts = [p.strip() for p in spec.split(",") if p.strip()]
        for p in parts:
            if "-" in p:
                a, b = p.split("-", 1)
                try:
                    start = int(a)
                    end = int(b)
                except ValueError:
                    continue
                if end < start:
                    start, end = end, start
                # Convert to 0-based, clamp to [1, max_len]
                start0 = max(1, start)
                end0 = min(max_len, end)
                for one_based in range(start0, end0 + 1):
                    indices.append(one_based - 1)
            else:
                try:
                    one_based = int(p)
                except ValueError:
                    continue
                if 1 <= one_based <= max_len:
                    indices.append(one_based - 1)
        # Deduplicate while preserving order
        seen = set()
        out: List[int] = []
        for i in indices:
            if i not in seen:
                seen.add(i)
                out.append(i)
        return out

    # Enforce mutual exclusivity of --sample, --rows, and --nomatch
    specified = sum(bool(x) for x in [args.sample, args.rows, args.nomatch])
    if specified > 1:
        raise SystemExit("Specify only one of --sample, --rows, or --nomatch.")

    rows_to_update = _parse_rows_spec(args.rows, len(df)) if args.rows else []
    if args.nomatch:
        try:
            mask = (df.get("gs_match_stage", "NA").fillna("NA").astype(str).str.upper() == "NO MATCH")
            rows_to_update = [int(i) for i in df.index[mask].tolist()]
        except Exception:
            rows_to_update = []

    if rows_to_update:
        df_out = df.copy()
        for idx in rows_to_update:
            row = df.iloc[idx]
            print(f"Processing row {idx + 1} (1-based), title='{row.get('title', '')}'")
            updated = update_row(row.copy())
            df_out.loc[idx, [
                "gs_publication",
                "gs_query_used",
                "gs_match_stage",
                "h5_index",
                "h5_median",
            ]] = [
                updated.get("gs_publication", "NA"),
                updated.get("gs_query_used", "NA"),
                updated.get("gs_match_stage", "NA"),
                updated.get("h5_index", "NA"),
                updated.get("h5_median", "NA"),
            ]
        df_out = _compute_similarity_column(df_out)
        _safe_write(df_out, "core_with_h5.csv")
    elif args.rows is not None:
        # --rows was provided but resolved to no valid indices; still emit current CSV
        df_out = _compute_similarity_column(df.copy())
        _safe_write(df_out, "core_with_h5.csv")
    elif args.sample is not None and args.sample > 0:
        n = min(args.sample, len(df))
        sampled = df.sample(n=n, random_state=0)
        sampled = sampled.sort_index()  # preserve original relative order
        df_out = df.copy()
        for idx, row in sampled.iterrows():
            print(f"Processing row index {idx} title='{row.get('title', '')}'")
            updated = update_row(row.copy())
            df_out.loc[idx, ["gs_publication", "gs_query_used", "gs_match_stage", "h5_index", "h5_median"]] = [
                updated.get("gs_publication", "NA"),
                updated.get("gs_query_used", "NA"),
                updated.get("gs_match_stage", "NA"),
                updated.get("h5_index", "NA"),
                updated.get("h5_median", "NA"),
            ]
        df_out = _compute_similarity_column(df_out)
        _safe_write(df_out, "core_with_h5.csv")
    else:
        # Update rows in place without changing order
        df = df.apply(update_row, axis=1)
        # Write output preserving delimiter and encoding
        df = _compute_similarity_column(df)
        _safe_write(df, "core_with_h5.csv")


if __name__ == "__main__":
    main()


