const ranks = ['B-', 'B', 'A-', 'A', 'A+', 'A*', 'A++'];
// Indexes in a row of data
let confIdx = 0, titleIdx = 1, rankIdx = 2, rankingIdx = 3, fieldIdx = 4, cfpIdx = 5;
// Indexes in a cfp list
let abstIdx = 0, subIdx = 1, notifIdx = 2, camIdx = 3, startIdx = 4, endIdx = 5, origOffset = 6;
	linkIdx = 12, cfpLinkIdx = 13;

const today = new Date();

const month_name = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let timeline_zero = Date.UTC(today.getFullYear() - 1, 0, 1);
let date_zero = new Date(timeline_zero);

// some global variables
let timeline_max = Date.UTC(today.getFullYear(), 0, 0);
let date_max = new Date(timeline_max);
// % per month: 50px / duration of 1 month
let timeline_scale = 100 / (timeline_max - timeline_zero);
let timeline_scale_px = 0; // pixels per millisecond for precise alignment
let default_timeline_zero = null;
let default_timeline_max = null;
// Default H5 slider lower bounds (used to suppress defaults in URL)
let default_h5index_min = null;
let default_h5median_min = null;

const timeline = document.getElementById('timeline');
const suggestions = document.querySelector('#suggestions');
const form = document.querySelector('form');
const filters = {};
let data = [];
// H5 metrics mapping within Rank arrays
let h5IndexPos = -1;
let h5MedianPos = -1;

// the value we push into the hash
let sethash = '';

// Escape data to pass as regexp
RegExp.escape = s => s.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&')

// timeout id to delay search update
let updateSearchTimeoutId = 0;
// Ensure the CSS --scrollbar-width matches the actual platform scrollbar width
function setScrollbarWidthCSSVar()
{
    const div = document.createElement('div');
    div.style.width = '100px';
    div.style.height = '100px';
    div.style.overflow = 'scroll';
    div.style.position = 'absolute';
    div.style.top = '-9999px';
    document.body.appendChild(div);
    const scrollbarWidth = div.offsetWidth - div.clientWidth;
    document.body.removeChild(div);
    document.documentElement.style.setProperty('--scrollbar-width', scrollbarWidth + 'px');
}

// Initialize and keep in sync on resize (covers overlay scrollbar changes)
setScrollbarWidthCSSVar();
window.addEventListener('resize', setScrollbarWidthCSSVar);



// Template elements that we can clone()
const marker = document.createElement('sup');
marker.className = 'est';
marker.textContent = '†';

const line = document.createElement('p');
line.appendChild(document.createElement('span')).className = 'acronyms';
line.appendChild(document.createElement('span')).className = 'timeblocks';
line.style.display = 'none';

const wikicfp = document.createElement('a').appendChild(document.createElement('img')).parentNode;
wikicfp.firstChild.src = 'wikicfplogo.png';
wikicfp.firstChild.alt = 'Wiki CFP logo';
wikicfp.firstChild.className += 'cfpurl';

const suggestion = document.createElement('li');
suggestion.appendChild(document.createElement('span')).className += 'conf';
suggestion.appendChild(document.createElement('span')).className += 'rank';
suggestion.appendChild(document.createElement('span')).className += 'field';
suggestion.appendChild(document.createElement('span')).className += 'title';
suggestion.style.display = 'none';

// Formatter for dates
const dateFormat = new Intl.DateTimeFormat('en', {
	weekday: 'short',
	year: 'numeric',
	month: 'short',
	day: 'numeric',
});

function ranksort(a, b)
{
	const rank_a = ranks.indexOf(a), rank_b = ranks.indexOf(b);
	// compare using positions
	if (rank_a >= 0 && rank_b >= 0)
		return rank_b - rank_a;
	// compare as strings
	else if(rank_a < 0 && rank_b < 0)
		return a > b;
	// return 1 for the element not negative
	else
		return rank_a < 0 ? 1 : -1;
}

function parseFragment()
{
	const hash_parts = window.location.hash.substr(1).split('&');
	let anchorYOffset = undefined;

	const result = hash_parts.reduce(function (result, item)
	{
		const parts = item.split('=', 2);

		if (parts.length > 1)
		{
			if (!result[parts[0]])
				result[parts[0]] = [];

			result[parts[0]].push(decodeURIComponent(parts[1]));
		}
		else if (item && document.getElementById(item))
			anchorYOffset = window.pageYOffset + document.getElementById(item).getBoundingClientRect().top;

		return result;
	}, {});

	if (result.length && anchorYOffset !== undefined)
		window.scroll(window.pageXOffset, anchorYOffset);

	return result;
}

function updateFragment()
{
    const params = Array.from(form.querySelectorAll('select')).reduce((params, sel) =>
		params.concat(Array.from(sel.selectedOptions).map(opt => `${sel.name}=${encodeURIComponent(opt.value)}`))
	, []).sort().filter((it, pos, arr) => pos === 0 || it !== arr[pos - 1]);

	/* get last part of &-separated fragment that contains no '=' */
	const anchor = window.location.hash.substr(1).split('&').reduce(function (prev, item)
	{
		return item.indexOf('=') < 0 ? item : prev;
	}, null);

    if (anchor)
		params.push(anchor);

    // Append H5 slider minimums if present and not at defaults
    const idxMinEl = document.getElementById('h5index_min');
    const medMinEl = document.getElementById('h5median_min');
    if (idxMinEl) {
        const val = Number(idxMinEl.value);
        if (default_h5index_min != null && val !== Number(default_h5index_min))
            params.push(`h5index=${encodeURIComponent(String(val))}`);
    }
    if (medMinEl) {
        const val = Number(medMinEl.value);
        if (default_h5median_min != null && val !== Number(default_h5median_min))
            params.push(`h5median=${encodeURIComponent(String(val))}`);
    }

    // Append range start/end if present (YYYY-MM-DD) and not at defaults
    const startEl = document.getElementById('range_start');
    const endEl = document.getElementById('range_end');
    const defaultStartStr = (default_timeline_zero != null) ? yyyymmdd(new Date(default_timeline_zero)) : null;
    const defaultEndStr = (default_timeline_max != null) ? yyyymmdd(new Date(default_timeline_max)) : null;
    if (startEl && startEl.value && (defaultStartStr == null || startEl.value !== defaultStartStr))
        params.push(`start=${encodeURIComponent(startEl.value)}`);
    if (endEl && endEl.value && (defaultEndStr == null || endEl.value !== defaultEndStr))
        params.push(`end=${encodeURIComponent(endEl.value)}`);

	sethash = '#' + params.join('&');
	if (window.location.hash !== sethash)
		window.location.hash = sethash;
}

function makeTimelineLegend()
{
	const box = document.getElementById('timeline_header');
	while (box.hasChildNodes())
		box.firstChild.remove();

	// compute pixel scale to keep header aligned with scrollable body
	const container = document.getElementById('timeline_container');
	const usableWidthPx = container.clientWidth - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--scrollbar-width'));
	const totalMs = (timeline_max - timeline_zero);
	timeline_scale_px = usableWidthPx / totalMs; // px per ms

	const months = document.createElement('p');
	months.id = 'months';
	months.appendChild(document.createElement('span')).className += 'acronyms';
	months.appendChild(document.createElement('span')).className += 'timeblocks';

	const year_from = date_zero.getFullYear(), year_diff = date_max.getFullYear() - year_from;

	for (let m = date_zero.getMonth(); m <= date_max.getMonth() + 12 * year_diff; m++)
	{
		const from = Date.UTC(year_from, m, 1);
		const until = Date.UTC(year_from, m + 1, 0);

		const month = months.lastChild.appendChild(document.createElement('span'));
		month.textContent = month_name[m % 12];
		month.style.width = `${(until - from) * timeline_scale}%`
		month.style.left = `${(from - date_zero) * timeline_scale}%`
		if (m % 12 === 0)
			month.className += 'first';
	}
	months.lastChild.firstChild.className += 'first';

	const years = document.createElement('p');
	years.id = 'years';
	years.appendChild(document.createElement('span')).className += 'acronyms';
	years.appendChild(document.createElement('span')).className += 'timeblocks';

	for (let y = year_from; y <= year_from + year_diff; y++)
	{
		const from = Math.max(date_zero, Date.UTC(y, 0, 1));
		const until = Math.min(date_max, Date.UTC(y + 1, 0, 0));

		const year = years.lastChild.appendChild(document.createElement('span'));
		year.textContent = y;
		year.style.width = `calc(${(until - from) * timeline_scale}% - 1px)`;
		year.style.left = `${(from - date_zero) * timeline_scale}%`;
	}

	const now = document.createElement('p');
	now.id = 'now';
	now.appendChild(document.createElement('span')).className += 'acronyms';
	now.appendChild(document.createElement('span')).className += 'timeblocks';

	const day = now.lastChild.appendChild(document.createElement('span'));
	day.className += 'today';
	day.style.left = `${(today.valueOf() - date_zero) * timeline_scale}%`;

	box.appendChild(years);
	box.appendChild(months);
	box.appendChild(now);
}

function parseDate(str)
{
	if (!str)
		return null;

	const date = Date.UTC(str.substring(0, 4), str.substring(4, 6) - 1, str.substring(6, 8));
	return Math.min(timeline_max, Math.max(timeline_zero, date));
}

function makeTimelineDuration(cls, from, until, tooltip_text, from_orig, until_orig)
{
	const span = document.createElement('span');
	span.className = cls;
	span.style.width = (until - from) * timeline_scale + '%';
	span.style.left = (from - timeline_zero) * timeline_scale + '%';

	const tooltip = span.appendChild(document.createElement('span'));
	tooltip.className = 'tooltip';
	tooltip.innerHTML = tooltip_text; /* to put html tags in tooltip_text */

	if ((from + until) < (timeline_zero + timeline_max))
		tooltip.style.left = '0';
	else
		tooltip.style.right = '0';

	if (from_orig === false)
		span.appendChild(marker.cloneNode(true)).style.left = '0';
	if (until_orig === false)
		span.appendChild(marker.cloneNode(true)).style.left = '100%';

	return span;
}


function makeTimelinePunctual(cls, date, content, tooltip_text, date_orig)
{
	const span = document.createElement('span');
	span.className = cls;
	span.style.width = '.5em';
	span.innerHTML = content;
	span.style.left = 'calc(' + (date - timeline_zero) * timeline_scale + '% - .25em)';

	const tooltip = span.appendChild(document.createElement('span'));
	tooltip.className = 'tooltip';
	tooltip.innerHTML = tooltip_text; /* to put html tags in tooltip_text */

	if (date < (timeline_zero + timeline_max) / 2)
		tooltip.style.left = '0';
	else
		tooltip.style.right = '0';

	if (date_orig === false)
		span.appendChild(marker.cloneNode(true)).style.left = '.75em';

	return span;
}

function est(isOrig) {
	return isOrig === false ? 'Estimated ' : '';
}

function objMap(obj, func) {
	return Object.fromEntries(
		Object.entries(obj).map(([key, val], idx) => [key, func(val, key, idx)])
	)
}

function makeTimelineItem(row)
{
	const p = line.cloneNode(true);
	renderAcronym(p.firstChild, row);

	const dateIdx = {abst: abstIdx, sub: subIdx, notif: notifIdx, cam: camIdx, start: startIdx, end: endIdx};
	const blocks = p.lastChild;
	for (const cfp of row.slice(cfpIdx))
	{
		// get the row for this year, with friendly names
		const date = objMap(dateIdx, idx => parseDate(cfp[idx]));
		const orig = objMap(dateIdx, idx => cfp[idx + origOffset]);
		const text = objMap(date, dt => dt && dateFormat.format(dt));
		const acronym = `${row[confIdx]} ${(cfp[startIdx] || cfp[endIdx] || 'last').slice(0, 4)}`;

		if (!date.abst)
			date.abst = date.sub;
		else if (!date.sub)
			date.sub = date.abst;

		if (date.sub && date.notif && date.notif >= date.sub)
		{
			if (date.sub > date.abst)
			{
				const tooltip = `${est(orig.abst)}${acronym} registration ${text.abst}`;
				blocks.appendChild(makeTimelineDuration('abstract', date.abst, date.sub, tooltip, orig.abst));
			}

			const tooltip = [
				`${est(orig.sub)}${acronym} submission ${text.sub},`,
				`${est(orig.notif).toLowerCase()}notification ${text.notif}`,
			].join('<br />');
			blocks.appendChild(makeTimelineDuration('review', date.sub, date.notif, tooltip, orig.sub, orig.notif));
		}
		else if (date.sub)
		{
			const tooltip = `${est(orig.sub)}${acronym} submission ${text.sub}`;
			blocks.appendChild(makeTimelinePunctual('date.sub', date.sub, '<sup>◆</sup>', tooltip, orig.sub));
		}

		if (date.cam)
		{
			const tooltip = `${est(orig.cam)}${acronym} final version ${text.cam}`;
			blocks.appendChild(makeTimelinePunctual('date.cam', date.cam, '<sup>∎</sup>', tooltip, orig.cam));
		}

		if (date.start && date.end && date.end >= date.start)
		{
			const tooltip = `${acronym} ${est(orig.start && orig.end).toLowerCase()}from ${text.start} to ${text.end}`;
			blocks.appendChild(makeTimelineDuration('conf', date.start, date.end, tooltip, undefined, orig.end));
		}
	}

	return timeline.appendChild(p);
}


function makeSuggestionItem(row)
{
	const item = suggestion.cloneNode(true);

	item.children[0].textContent = row[confIdx];
	item.children[1].textContent = row[rankIdx].map(
		(val, idx) => `${val || 'unrated'} (${row[rankingIdx][idx]})`
	).join(', ');
	item.children[2].textContent = row[fieldIdx] == '(missing)' ? '': row[fieldIdx];
	item.children[3].textContent = row[titleIdx];

	return suggestions.appendChild(item);
}


function onSuggestionClick()
{
	Array.from(suggestions.children).forEach((item, idx) =>
	{
		const opt = Array.from(form.querySelector('select[name="conf"]').options).find(opt => opt.value === data[idx][confIdx]);
		item.onclick = () =>
		{
			opt.selected = true;
			opt.parentNode.onchange();
			form.querySelector('input[name="search"]').value = '';
		}
	})
}


// Removed makeSelectedItem - no longer showing duplicate selected conferences above the list


function hideSuggestions()
{
	Array.from(suggestions.children).filter(conf => conf.style.display !== 'none')
									.forEach(conf => { conf.style.display = 'none' });
}


function delayedUpdateSearch(value)
{
	const terms = value.split(/[ ;:,.]/).filter(val => val && val.length >= 2);
	const search = terms.map(val => new RegExp(RegExp.escape(val), 'iu'));

	hideSuggestions();

	// -> all(words) -> any(columns)
	if (search.length)
		data.forEach((row, idx) =>
		{
			if (search.every(r => r.test(row[confIdx]) || r.test(row[titleIdx])))
				suggestions.children[idx].style.display = 'block';
		});

	updateSearchTimeoutId = 0;
}

function updateSearch()
{
	if (updateSearchTimeoutId)
		clearTimeout(updateSearchTimeoutId);

	updateSearchTimeoutId = setTimeout(delayedUpdateSearch, 150, this.value)
}


function setColumnFilter(select, col_id)
{
	const val = Array.from(select.selectedOptions).map(opt => RegExp.escape(opt.value));
	const regex = val.length ? `^(${val.join('|')})$` : '';

	if (regex)
		filters[col_id] = new RegExp(regex);
	else
		delete filters[col_id];
}

// this is the select
function updateFilter()
{
	const column_id = this.getAttribute('column_id');
	setColumnFilter(this, column_id);

	filterUpdated().then(updateFragment);
}

async function filterUpdated(search)
{
	Array.from(timeline.children).filter(conf => conf.style.display !== 'none').forEach(conf => {
		conf.style.display = 'none'
	});

	// Every filter needs to match at least one of its values
	data.map((row, idx) =>
		{
			const acc = { index: idx };
			for (const [key, rule] of Object.entries(filters)) {
                if (typeof rule === 'object' && rule && rule.type === 'range') {
                    let ok = true;
                    let val = null;
                    if (typeof rule.pos === 'number' && rule.pos >= 0) {
                        // legacy: fixed position
                        val = (row[rankIdx] || [])[rule.pos];
                    } else if (rule.system) {
                        // preferred: locate by system name per row
                        const systems = row[rankingIdx] || [];
                        const ranksVals = row[rankIdx] || [];
                        const sIdx = systems.indexOf(rule.system);
                        val = sIdx >= 0 ? ranksVals[sIdx] : null;
                    }
                    if (val == null) {
                        ok = !rule.ignoreMissing;
                    } else {
                        const num = Number(val);
                        ok = (num >= rule.min && num <= rule.max);
                    }
                    acc[key] = ok;
				} else {
					const regex = rule;
					acc[key] = Array.isArray(row[key]) ? row[key].some(entry => regex.test(entry)) : regex.test(row[key]);
				}
			}
			return acc;
		}
	).forEach(({ index, ...row_filters }) =>
	{
		const show = Object.values(row_filters).every(val => val);
		const tl_display = show ? 'block' : 'none';

		if (timeline.children[index].style.display !== tl_display)
			timeline.children[index].style.display = tl_display;
	});
}

function makeFilter(colIdx, name, sortfunction)
{
	let values = data.map(row => row[colIdx]);
	if (name === 'rank')
	{
		// Exclude H5 numeric entries from the Rank filter; keep only CORE/GGS/etc.
		values = data.map(row =>
			(row[rankIdx] || []).filter((val, idx) =>
				(row[rankingIdx] || [])[idx] !== 'H5Index2024' && (row[rankingIdx] || [])[idx] !== 'H5Median2024'
			).map(v => v || '(unranked)')
		);
		values = [].concat(...values);
	}
	values = values.sort(sortfunction).filter((val, idx, arr) => idx === 0 || val !== arr[idx - 1]);

	const p = document.createElement('p');
	p.className += 'filter_' + name

	const select = p.appendChild(document.createElement('select'));
	select.multiple = true;
	select.name = name;
	// Limit Conference filter to show max 10 options for better UX
	select.size = Math.min(values.length, name === 'conf' ? 10 : values.length);
	select.setAttribute('column_id', colIdx);

	const clear = p.appendChild(document.createElement('button'));
	clear.textContent = 'clear';

	values.forEach(t =>
	{
		const option = select.appendChild(document.createElement('option'));
		option.textContent = t;
		option.value = t === '(unranked)' ? null : t;
	});

	select.onchange = updateFilter
	clear.onclick = () =>
	{
		select.selectedIndex = -1;
		delete filters[colIdx];
		updateFilter.call(select);
	};

	return p;
}

function filterFromFragment()
{
	const selects = Array.from(form.querySelectorAll('select'));
	const selectedValues = parseFragment();

	selects.forEach(sel =>
	{
		sel.selectedIndex = -1;
		const values = selectedValues[sel.name] || (sel.name == 'scope' ? ['0'] : []);
		if (!values.length)
			return;
		Array.from(sel.options).forEach(opt => { opt.selected = values.indexOf(opt.value) >= 0 });
	});

	selects.forEach(sel => sel.onchange());
}

function renderAcronym(p, row)
{
	let conf = document.createElement('span');

	for (const cfp of row.slice(cfpIdx).toReversed())
		if (cfp[linkIdx] && cfp[linkIdx] != '(missing)')
		{
			conf = document.createElement('a');
			conf.href = cfp[linkIdx]
			break;
		}

	conf.textContent = row[confIdx];
	conf.title = row[titleIdx];

	p.appendChild(conf);
	p.innerHTML += '&nbsp;'

	let rating = document.createElement('span');
	rating.textContent = row[rankIdx].filter(rank => rank).join(',');
	rating.title = row[rankIdx].map((val, idx) => `${val || 'unrated'} (${row[rankingIdx][idx]})`).join(', ');
	rating.className = 'ratingsys';

	p.appendChild(rating);
	p.innerHTML += '&nbsp;'

	for (const cfp of row.slice(cfpIdx).toReversed())
		if (cfp[cfpLinkIdx] && cfp[cfpLinkIdx] != '(missing)')
		{
			const cfpLink = p.appendChild(wikicfp.cloneNode(true));
			cfpLink.href = cfp[cfpLinkIdx];
			cfpLink.title = `Latest ${row[confIdx]} CFP on WikiCFP`;
			break;
		}

	return p;
}

function markExtrapolated(td, data, rowdata, row, col)
{
	if (data && rowdata[col + origOffset] === false)
		td.className += 'extrapolated';
}

function notNull(val, idx)
{
	return val != null
}

function sortConferences(sortIdx = [subIdx, abstIdx, startIdx, endIdx], after = today)
{
	// sort the data per upcoming deadline date
	if (after) {
		const refdate = [
			after.getFullYear(),
			after.getMonth() + 1,
			after.getDate(),
		].map(num => String(num).padStart(2, '0')).join('');
		// Find the best cfp: first after ref date (usually today)
		date2sortInfo = cfpdate => [cfpdate <= refdate, cfpdate]
	} else {
		// Just sort on date
		date2sortInfo = cfpdate => cfpdate
	}

	const sortdates = data.map(row => row.slice(cfpIdx)
		// Find one non-null date per cfp using sortIdx preference
		.map(cfp => sortIdx.map(idx => cfp[idx]).find(date => date !== null))
		// Find the cfp we want to consider
		.map(date2sortInfo).sort()[0]
	// Now sort and keep original indexes
	).map((info, idx) => [info, idx]).sort().map(([date, idx]) => idx);

	// Apply sort to data array
	data = sortdates.map(idx => data[idx]);

	// Apply sort to timeline rows
	const rowList = [...timeline.children];
	sortdates.map(idx => rowList[idx]).forEach(row => timeline.appendChild(row));
}

function populatePage(json)
{
	// First update global variables from fetched data
	data = json['data'];

	confIdx    = json['columns'].indexOf('Acronym')
	titleIdx   = json['columns'].indexOf('Title')
	rankingIdx = json['columns'].indexOf('Rank system')
	rankIdx    = json['columns'].indexOf('Rank')
	fieldIdx   = json['columns'].indexOf('Field')
	cfpIdx     = json['columns'].length

	abstIdx    = json['cfp_columns'].indexOf('Abstract Registration Due')
	subIdx     = json['cfp_columns'].indexOf('Submission Deadline')
	notifIdx   = json['cfp_columns'].indexOf('Notification Due')
	camIdx     = json['cfp_columns'].indexOf('Final Version Due')
	startIdx   = json['cfp_columns'].indexOf('startDate')
	endIdx     = json['cfp_columns'].indexOf('endDate')
	linkIdx    = json['cfp_columns'].indexOf('Link')
	cfpLinkIdx = json['cfp_columns'].indexOf('CFP url')

	origOffset = json['cfp_columns'].indexOf('orig_abstract')

	// Determine H5 positions by inspecting Rank system of first row
	if (data.length > 0) {
		const systems = data[0][rankingIdx] || [];
		h5IndexPos = systems.indexOf('H5Index2024');
		h5MedianPos = systems.indexOf('H5Median2024');
	}

	// Use lexicographic sort for dates, in format YYYYMMDD. NB: some dates are null.
	const mindate = [
		date_zero.getFullYear(),
		date_zero.getMonth() + 1,
		date_zero.getDate(),
	].map(num => String(num).padStart(2, '0')).join('');

	const maxdate = data.reduce((curmax, row) => Math.max(
		curmax,
		...row.slice(cfpIdx).map(cfp => cfp[endIdx] || cfp[startIdx] || cfp[subIdx])
	), mindate);

	// get last day of the same month as maxdate (month is 0-based for Date.UTC)
	// previously used day=0 of the same month which resolves to the last day of previous month
	// compute year and month from maxdate (YYYYMMDD), then request month+1 with day=0
	const maxYear = Math.floor(maxdate / 10000);
	const maxMonthOneBased = Math.floor(maxdate / 100) % 100; // 1..12
	const maxMonthZero = maxMonthOneBased - 1; // 0..11
	// Last day of the same month = next month with day 0
	timeline_max = Date.UTC(maxYear, maxMonthZero + 1, 0);
	// The above is equivalent to Date.UTC(maxYear, maxMonthZeroBased, 1) - 1, but avoids DST issues
	// Save defaults for Reset
	default_timeline_zero = timeline_zero;
	default_timeline_max = timeline_max;
	// Percentage scale used by existing layout; px scale computed in legend
	timeline_scale = 100 / (timeline_max - timeline_zero);
	date_max = new Date(timeline_max);

	makeTimelineLegend();

	document.getElementById('head').appendChild(
		document.createTextNode(` The last scraping took place on ${json['date']}.`)
	);

	const filters = document.getElementById('filters');
	filters.appendChild(makeFilter(confIdx, "conf"));
	filters.appendChild(makeFilter(rankIdx, "rank", ranksort));
	filters.appendChild(makeFilter(fieldIdx, "field"));

	data.forEach((row, idx) =>
	{
		makeTimelineItem(row);
	});

	sortConferences();

	// Initial fragment
	filterFromFragment();

	window.addEventListener('hashchange', filterFromFragment);

	// add data to Timeline, but only filtered
	filterUpdated();

	document.getElementById('loading').style.display = 'none';

	// Initialize range controls
	setupRangeControls();
	setupH5Controls();
}

function parsingErrors(content)
{
	const table = document.getElementById('error_log');
	for (const error of content.split('\n'))
	{
		if (!error.trim().length)
			continue;

		const [conf, errmsg, url, fixed] = error.replace(/ -- /g, ' – ').split(';');
		const err = document.createElement('tr');
		const link = err.appendChild(document.createElement('td')).appendChild(document.createElement('a'));
		link.textContent = conf;
		link.href = url;
		err.appendChild(document.createElement('td')).textContent = errmsg;

		table.appendChild(err).className = fixed;
	}

	const label = document.querySelector('label[for=collapse_errors]');
	label.textContent = (table.children.length - 1) + ' ' + label.textContent;
}

function fetchData(page, result_handler)
{
	req = new XMLHttpRequest();
	req.overrideMimeType('application/json; charset="UTF-8"');
	req.addEventListener('load', evt => result_handler(evt.target.responseText));
	req.open('get', page);
	req.send();
}

function yyyymmdd(date)
{
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function setupRangeControls()
{
    const startInput = document.getElementById('range_start');
    const endInput = document.getElementById('range_end');
    const applyBtn = document.getElementById('range_apply');
    const resetBtn = document.getElementById('range_reset');

    if (!startInput || !endInput || !applyBtn || !resetBtn)
        return;

    // Prefill inputs with current range
    startInput.value = yyyymmdd(new Date(timeline_zero));
    endInput.value = yyyymmdd(new Date(timeline_max));

    function applyRangeFromFragment() {
        const selectedValues = parseFragment();
        let changed = false;
        if (selectedValues['start'] && selectedValues['start'][0]) {
            const v = selectedValues['start'][0];
            startInput.value = v;
            changed = true;
        }
        if (selectedValues['end'] && selectedValues['end'][0]) {
            const v = selectedValues['end'][0];
            endInput.value = v;
            changed = true;
        }
        if (changed) applyBtn.onclick();
    }

    applyBtn.onclick = () => {
        // parse input dates; allow partial update
        const startVal = startInput.value;
        const endVal = endInput.value;

        let newZero = timeline_zero;
        let newMax = timeline_max;

        if (startVal) {
            const d = new Date(startVal + 'T00:00:00Z');
            if (!isNaN(d)) newZero = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        }
        if (endVal) {
            const d = new Date(endVal + 'T00:00:00Z');
            if (!isNaN(d)) newMax = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        }

		if (newMax <= newZero)
            return; // ignore invalid range silently

		timeline_zero = newZero;
		timeline_max = newMax;
		date_zero = new Date(timeline_zero);
		date_max = new Date(timeline_max);
		timeline_scale = 100 / (timeline_max - timeline_zero);

        // Re-render header and reposition items without changing DOM order
		makeTimelineLegend();
        Array.from(timeline.children).forEach(row => {
            const blocks = row.querySelector('.timeblocks');
            Array.from(blocks.children).forEach(span => {
                // reposition using data from inline styles where possible
                // We cannot recover original epoch dates from styles; instead, rebuild row via data
            });
        });
		// Full re-render of timeline items to ensure precise placement
		timeline.textContent = '';
		data.forEach(row => makeTimelineItem(row));
        filterUpdated();
        updateFragment();
    };

    resetBtn.onclick = () => {
		if (default_timeline_zero != null && default_timeline_max != null) {
            timeline_zero = default_timeline_zero;
            timeline_max = default_timeline_max;
			date_zero = new Date(timeline_zero);
			date_max = new Date(timeline_max);
            timeline_scale = 100 / (timeline_max - timeline_zero);
            startInput.value = yyyymmdd(new Date(timeline_zero));
            endInput.value = yyyymmdd(new Date(timeline_max));
			makeTimelineLegend();
			timeline.textContent = '';
			data.forEach(row => makeTimelineItem(row));
            filterUpdated();
            updateFragment();
        }
    };

    // Initialize from fragment if present and keep in sync
    applyRangeFromFragment();
    window.addEventListener('hashchange', applyRangeFromFragment);
}

function getH5Bounds()
{
    const valsIndex = [];
    const valsMedian = [];
    data.forEach(row => {
        const systems = row[rankingIdx] || [];
        const ranksVals = row[rankIdx] || [];
        const idxI = systems.indexOf('H5Index2024');
        const idxM = systems.indexOf('H5Median2024');
        if (idxI >= 0) {
            const v = ranksVals[idxI];
            if (v != null) valsIndex.push(Number(v));
        }
        if (idxM >= 0) {
            const v = ranksVals[idxM];
            if (v != null) valsMedian.push(Number(v));
        }
    });
    const minI = valsIndex.length ? Math.min(...valsIndex) : 0;
    const maxI = valsIndex.length ? Math.max(...valsIndex) : 0;
    const minM = valsMedian.length ? Math.min(...valsMedian) : 0;
    const maxM = valsMedian.length ? Math.max(...valsMedian) : 0;
    return { minI, maxI, minM, maxM };
}

function setupH5Controls()
{
    const indexMin = document.getElementById('h5index_min');
    let indexMinVal = document.getElementById('h5index_min_value');
    const indexRangeInfo = document.getElementById('h5index_range_info');
    const indexSlider = document.getElementById('h5index_slider');

    const medianMin = document.getElementById('h5median_min');
    let medianMinVal = document.getElementById('h5median_min_value');
    const medianRangeInfo = document.getElementById('h5median_range_info');
    const medianSlider = document.getElementById('h5median_slider');

    // Single checkbox for both H5 metrics
    const h5ShowMissing = document.getElementById('h5_show_missing');

    if (!indexMin || !medianMin) return;

    const { minI, maxI, minM, maxM } = getH5Bounds();
    // Record global defaults so URL can omit default values
    default_h5index_min = minI;
    default_h5median_min = minM;

    [indexMin].forEach(inp => { inp.min = String(minI); inp.max = String(maxI); });
    indexMin.value = String(minI);

    [medianMin].forEach(inp => { inp.min = String(minM); inp.max = String(maxM); });
    medianMin.value = String(minM);

    // Set range info
    indexRangeInfo.textContent = `${minI} - ${maxI}`;
    medianRangeInfo.textContent = `${minM} - ${maxM}`;

    function clamp(val, lo, hi) { return Math.max(lo, Math.min(hi, val)); }

    // Turn display bubbles into editable number inputs, committing on Enter
    function makeEditableHandle(handleEl, min, max, onCommit) {
        if (!handleEl || handleEl.tagName === 'INPUT') return handleEl;
        const input = document.createElement('input');
        input.type = 'number';
        input.className = handleEl.className; // preserve .handle-value and position class
        input.id = handleEl.id;
        input.min = String(min);
        input.max = String(max);
        input.step = '1';
        input.inputMode = 'numeric';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.value = handleEl.textContent || '';
        handleEl.replaceWith(input);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const num = Number(input.value);
                if (!Number.isNaN(num)) onCommit(clamp(num, Number(input.min), Number(input.max)));
            }
        });
        return input;
    }

    function applyH5FragmentDefaults() {
        const selectedValues = parseFragment();
        if (selectedValues['h5index'] && selectedValues['h5index'][0] != null) {
            const v = Number(selectedValues['h5index'][0]);
            if (!Number.isNaN(v)) indexMin.value = String(v);
        }
        if (selectedValues['h5median'] && selectedValues['h5median'][0] != null) {
            const v = Number(selectedValues['h5median'][0]);
            if (!Number.isNaN(v)) medianMin.value = String(v);
        }
    }

    function applyH5Filter() {
        let mi = clamp(Number(indexMin.value), minI, maxI);
        const xi = maxI; // fixed to dataset maximum
        indexMin.value = String(mi);
        if (indexMinVal.tagName === 'INPUT') indexMinVal.value = String(mi); else indexMinVal.textContent = String(mi);

        let mm = clamp(Number(medianMin.value), minM, maxM);
        const xm = maxM; // fixed to dataset maximum
        medianMin.value = String(mm);
        if (medianMinVal.tagName === 'INPUT') medianMinVal.value = String(mm); else medianMinVal.textContent = String(mm);

        // Update filters: checkbox checked means show missing, so ignoreMissing should be false
        // Single checkbox controls both metrics; look up by system name per row
        const showMissing = h5ShowMissing && h5ShowMissing.checked;
        filters['h5index'] = { type: 'range', system: 'H5Index2024', min: mi, max: xi, ignoreMissing: !showMissing };
        filters['h5median'] = { type: 'range', system: 'H5Median2024', min: mm, max: xm, ignoreMissing: !showMissing };

        filterUpdated();
        updateFragment();
    }

    [indexMin, medianMin].forEach(inp => {
        inp.oninput = applyH5Filter;
        inp.onchange = applyH5Filter;
    });
    h5ShowMissing && (h5ShowMissing.onchange = applyH5Filter);

    // Initial render
    applyH5FragmentDefaults();
    // Replace bubbles with editable inputs and wire commit handlers
    indexMinVal = makeEditableHandle(indexMinVal, minI, maxI, (val) => { indexMin.value = String(val); applyH5Filter(); });
    medianMinVal = makeEditableHandle(medianMinVal, minM, maxM, (val) => { medianMin.value = String(val); applyH5Filter(); });
    applyH5Filter();

    // Sync on hash changes (in addition to select filters)
    window.addEventListener('hashchange', () => {
        applyH5FragmentDefaults();
        applyH5Filter();
    });
}
