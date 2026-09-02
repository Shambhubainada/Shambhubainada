/*
  LIVE GOOGLE SHEET -> DASHBOARD

  Google Sheet:
  https://docs.google.com/spreadsheets/d/1igJ0rzEp3txMDdhjwjrMB5V9BkJcyjt74g1xWh3YSHo/edit?gid=1314864928

  Dashboard:
  Total Stack
  Wheat Stack
  Rice Stack
  Empty Stack
  Under Cover Stack
  Fumigation Due Stack
  Wheat Priority
  Rice Priority

  Fumigation Due:
  Last Fumigation Date से 30 दिन या उससे अधिक होने पर।
  Last Fumigation Date blank होने पर stack due में नहीं आएगा.

  Priority:
  Receipt Date के आधार पर FIFO — सबसे पुरानी receipt पहले.
*/

const SHEET_ID =
  "1igJ0rzEp3txMDdhjwjrMB5V9BkJcyjt74g1xWh3YSHo";

const SHEET_GID = "1314864928";

// हर 1 मिनट में Google Sheet से नया data
const REFRESH_MS = 60 * 1000;

const GOOGLE_SHEET_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${SHEET_GID}&tqx=out:json`;

let liveRows = [];

const $ = id => document.getElementById(id);


// --------------------------------------------------
// BASIC FUNCTIONS
// --------------------------------------------------

function clean(value) {
  return String(value ?? "").trim();
}

function norm(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function setText(id, value) {
  const element = $(id);

  if (element) {
    element.textContent = value;
  }
}

function escapeHTML(value) {
  return clean(value).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character])
  );
}


// --------------------------------------------------
// FIND COLUMNS
// --------------------------------------------------

function findColumn(headers, aliases) {

  const normalizedHeaders = headers.map(norm);

  for (const alias of aliases) {

    const search = norm(alias);

    const index = normalizedHeaders.findIndex(
      header =>
        header === search ||
        header.includes(search) ||
        search.includes(header)
    );

    if (index >= 0) {
      return index;
    }
  }

  return -1;
}


// --------------------------------------------------
// DATE FUNCTIONS
// --------------------------------------------------

function parseGoogleDate(value) {

  if (!value) {
    return null;
  }

  const text = clean(value);

  // dd.mm.yy
  // dd.mm.yyyy
  // dd/mm/yy
  // dd-mm-yy

  let match = text.match(
    /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/
  );

  if (match) {

    let year = Number(match[3]);

    if (year < 100) {
      year += 2000;
    }

    const date = new Date(
      year,
      Number(match[2]) - 1,
      Number(match[1])
    );

    return isNaN(date.getTime()) ? null : date;
  }


  // Google date(yyyy,m,d)

  match = text.match(
    /^date\((\d{4}),(\d+),(\d+)\)$/i
  );

  if (match) {

    return new Date(
      Number(match[1]),
      Number(match[2]),
      Number(match[3])
    );
  }


  // Normal date

  const date = new Date(text);

  return isNaN(date.getTime()) ? null : date;
}


function formatDate(value) {

  const date = parseGoogleDate(value);

  if (!date) {
    return clean(value);
  }

  return (
    String(date.getDate()).padStart(2, "0") +
    "." +
    String(date.getMonth() + 1).padStart(2, "0") +
    "." +
    String(date.getFullYear()).slice(-2)
  );
}


function daysSince(value) {

  const date = parseGoogleDate(value);

  if (!date) {
    return "";
  }

  const today = new Date();

  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.max(
    0,
    Math.floor(
      (today - date) / 86400000
    )
  );
}


// --------------------------------------------------
// TEXT / COMMODITY DETECTION
// --------------------------------------------------

function rowText(row) {

  return row
    .map(clean)
    .join(" | ")
    .toLowerCase();
}


function isWheat(row, columns) {

  if (columns.commodity < 0) {
    return false;
  }

  return /wheat|geh[uū]|गेहूं|गेहूँ/i.test(
    clean(row[columns.commodity])
  );
}


function isRice(row, columns) {

  if (columns.commodity < 0) {
    return false;
  }

  return /rice|chawal|चावल/i.test(
    clean(row[columns.commodity])
  );
}


function isEmpty(row, columns) {

  const status =
    columns.status >= 0
      ? clean(row[columns.status])
      : "";

  const category =
    columns.category >= 0
      ? clean(row[columns.category])
      : "";

  const text = rowText(row);

  return /empty|vacant|khali|खाली/i.test(
    status + " " +
    category + " " +
    text
  );
}


function isUnderCover(row, columns) {

  const status =
    columns.status >= 0
      ? clean(row[columns.status])
      : "";

  const remarks =
    columns.remarks >= 0
      ? clean(row[columns.remarks])
      : "";

  const text =
    status + " " +
    remarks + " " +
    rowText(row);

  return (
    /under\s*cover|undercover|cover|अंडर कवर/i.test(text) &&
    !/remove.*cover/i.test(text)
  );
}


// --------------------------------------------------
// FUMIGATION DUE
// --------------------------------------------------

function isFumigationDue(row, columns) {

  if (columns.lastFumigation < 0) {
    return false;
  }

  const rawDate =
    clean(row[columns.lastFumigation]);

  // Blank date = NOT due
  if (!rawDate) {
    return false;
  }

  const date =
    parseGoogleDate(rawDate);

  if (!date) {
    return false;
  }

  const today = new Date();

  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const days =
    Math.floor(
      (today - date) / 86400000
    );

  return days >= 30;
}


// --------------------------------------------------
// MAP SHEET COLUMNS
// --------------------------------------------------

function mapColumns(headers) {

  return {

    stack: findColumn(
      headers,
      [
        "Stack No",
        "Stack Number",
        "Stack"
      ]
    ),

    shed: findColumn(
      headers,
      [
        "Shed No",
        "Shed Number",
        "Shed"
      ]
    ),

    receipt: findColumn(
      headers,
      [
        "Receipt Date",
        "RDate",
        "Date of Receipt",
        "R Date"
      ]
    ),

    commodity: findColumn(
      headers,
      [
        "Commodity",
        "Crop",
        "Commodity/Crop"
      ]
    ),

    qty: findColumn(
      headers,
      [
        "Qty (MT)",
        "Qty",
        "Quantity",
        "Quantity MT"
      ]
    ),

    category: findColumn(
      headers,
      [
        "Cat",
        "Category"
      ]
    ),

    status: findColumn(
      headers,
      [
        "Status"
      ]
    ),

    remarks: findColumn(
      headers,
      [
        "Remarks",
        "Remark"
      ]
    ),

    lastFumigation: findColumn(
      headers,
      [
        "Last Fumigation Date",
        "Last Fumigation",
        "Fumigation Date"
      ]
    )
  };
}


// --------------------------------------------------
// LOAD GOOGLE SHEET
// --------------------------------------------------

async function loadGoogleSheet() {

  try {

    const response = await fetch(
      GOOGLE_SHEET_URL +
      "&t=" +
      Date.now(),
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {

      throw new Error(
        "Google Sheet HTTP " +
        response.status
      );
    }


    const text =
      await response.text();


    // Google returns:
    // google.visualization.Query.setResponse(...)

    const jsonText =
      text
        .replace(
          /^\s*google\.visualization\.Query\.setResponse\(/,
          ""
        )
        .replace(
          /\);\s*$/,
          ""
        );


    const data =
      JSON.parse(jsonText);


    const table =
      data.table;


    if (!table || !table.cols) {

      throw new Error(
        "Google Sheet returned no data"
      );
    }


    // Headers

    const headers =
      table.cols.map(
        (column, index) =>
          clean(column.label) ||
          `Column ${index + 1}`
      );


    // Rows

    const rows =
      table.rows.map(row =>
        row.c.map(
          cell =>
            cell
              ? (
                  cell.f ??
                  cell.v ??
                  ""
                )
              : ""
        )
      );


    // Find required columns

    const columns =
      mapColumns(headers);


    if (columns.stack < 0) {

      throw new Error(
        "Stack No column was not found."
      );
    }


    // Remove completely blank stack rows

    liveRows =
      rows.filter(
        row =>
          clean(row[columns.stack])
      );


    // Update dashboard

    renderDashboard(
      liveRows,
      columns
    );


    showError("");

    console.log(
      "Google Sheet data updated:",
      liveRows.length,
      "rows"
    );

  }

  catch (error) {

    console.error(
      "Live Google Sheet error:",
      error
    );

    showError(
      "Google Sheet data load nahi hua. " +
      "Sheet ko 'Anyone with the link → Viewer' karein."
    );
  }
}


// --------------------------------------------------
// DASHBOARD CALCULATION
// --------------------------------------------------

function renderDashboard(
  rows,
  columns
) {

  // Empty stacks अलग रखे जाते हैं

  const empty =
    rows.filter(
      row =>
        isEmpty(row, columns)
    );


  // Working/active stacks

  const active =
    rows.filter(
      row =>
        !isEmpty(row, columns)
    );


  // Wheat

  const wheat =
    active.filter(
      row =>
        isWheat(row, columns)
    );


  // Rice

  const rice =
    active.filter(
      row =>
        isRice(row, columns)
    );


  // Under Cover

  const underCover =
    active.filter(
      row =>
        isUnderCover(row, columns)
    );


  // Fumigation Due

  const fumigationDue =
    active.filter(
      row =>
        isFumigationDue(
          row,
          columns
        )
    );


  // ------------------------------------------------
  // UPDATE CARDS
  // ------------------------------------------------

  setText(
    "totalStack",
    active.length
  );

  setText(
    "wheatStack",
    wheat.length
  );

  setText(
    "riceStack",
    rice.length
  );

  setText(
    "emptyStack",
    empty.length
  );

  setText(
    "coverStack",
    underCover.length
  );

  setText(
    "fumigationStack",
    fumigationDue.length
  );


  // ------------------------------------------------
  // FIFO PRIORITY
  // ------------------------------------------------

  const wheatPriority =
    sortFIFO(
      wheat,
      columns
    ).slice(0, 5);


  const ricePriority =
    sortFIFO(
      rice,
      columns
    ).slice(0, 5);


  fillPriority(
    "wheatPriority",
    wheatPriority,
    columns
  );


  fillPriority(
    "ricePriority",
    ricePriority,
    columns
  );


  // Make data available to buttons

  window.godownLiveData = {

    rows: rows,

    active: active,

    wheat: wheat,

    rice: rice,

    empty: empty,

    cover: underCover,

    fumigation: fumigationDue,

    columns: columns
  };
}


// --------------------------------------------------
// FIFO SORT
// --------------------------------------------------

function sortFIFO(
  rows,
  columns
) {

  return [...rows].sort(
    (a, b) => {

      const dateA =
        columns.receipt >= 0
          ? parseGoogleDate(
              a[columns.receipt]
            )
          : null;


      const dateB =
        columns.receipt >= 0
          ? parseGoogleDate(
              b[columns.receipt]
            )
          : null;


      if (!dateA && !dateB) {
        return 0;
      }

      if (!dateA) {
        return 1;
      }

      if (!dateB) {
        return -1;
      }

      // Oldest first

      return dateA - dateB;
    }
  );
}


// --------------------------------------------------
// PRIORITY TABLE
// --------------------------------------------------

function fillPriority(
  id,
  rows,
  columns
) {

  const body =
    $(id);

  if (!body) {
    return;
  }


  if (!rows.length) {

    body.innerHTML =
      `<tr>
        <td colspan="5">
          No data found
        </td>
      </tr>`;

    return;
  }


  body.innerHTML =
    rows.map(
      (row, index) => {

        const stack =
          columns.stack >= 0
            ? row[columns.stack]
            : "";


        const shed =
          columns.shed >= 0
            ? row[columns.shed]
            : "";


        const receipt =
          columns.receipt >= 0
            ? formatDate(
                row[columns.receipt]
              )
            : "";


        const qty =
          columns.qty >= 0
            ? row[columns.qty]
            : "";


        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHTML(stack)}</td>
            <td>${escapeHTML(shed)}</td>
            <td>${escapeHTML(receipt)}</td>
            <td>${escapeHTML(qty)}</td>
          </tr>
        `;
      }
    ).join("");
}


// --------------------------------------------------
// DETAIL BUTTONS
// --------------------------------------------------

window.showSection =
function(type) {

  const data =
    window.godownLiveData;


  if (!data) {
    return;
  }


  const box =
    $("details");


  const text =
    $("detailText");


  if (!box || !text) {
    return;
  }


  const sections = {

    total: [
      "Total Stack Details",
      data.active
    ],

    wheat: [
      "Wheat Stock Details",
      data.wheat
    ],

    rice: [
      "Rice Stock Details",
      data.rice
    ],

    empty: [
      "Empty Stack Details",
      data.empty
    ],

    cover: [
      "Under Cover Stack Details",
      data.cover
    ],

    fumigation: [
      "Fumigation Due Stack Details",
      data.fumigation
    ]
  };


  const selected =
    sections[type] ||
    [
      "Details",
      []
    ];


  box.classList.remove(
    "hidden"
  );


  text.textContent =
    selected[0] +
    " — " +
    selected[1].length +
    " stack(s).";


  box.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
};


// --------------------------------------------------
// ERROR MESSAGE
// --------------------------------------------------

function showError(message) {

  let box =
    $("liveDataError");


  if (!box) {

    box =
      document.createElement(
        "div"
      );

    box.id =
      "liveDataError";


    box.style.cssText =
      `
      position:fixed;
      bottom:12px;
      left:50%;
      transform:translateX(-50%);
      z-index:9999;
      background:#fff1f1;
      color:#b42318;
      border:1px solid #f2b8b5;
      padding:10px 16px;
      border-radius:8px;
      font:600 13px Arial;
      max-width:92%;
      box-shadow:0 4px 14px #0002;
      `;


    document.body.appendChild(
      box
    );
  }


  box.textContent =
    message;


  box.style.display =
    message
      ? "block"
      : "none";
}


// --------------------------------------------------
// DATE / TIME ON DASHBOARD
// --------------------------------------------------

function updateClock() {

  const now =
    new Date();


  const day =
    String(
      now.getDate()
    ).padStart(2, "0");


  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");


  const year =
    String(
      now.getFullYear()
    ).slice(-2);


  const hour =
    String(
      now.getHours()
    ).padStart(2, "0");


  const minute =
    String(
      now.getMinutes()
    ).padStart(2, "0");


  setText(
    "today",
    `${day}.${month}.${year} | ${hour}:${minute}`
  );
}


// --------------------------------------------------
// START
// --------------------------------------------------

updateClock();

loadGoogleSheet();


// Google Sheet refresh every 1 minute

setInterval(
  loadGoogleSheet,
  REFRESH_MS
);


// Clock refresh every 30 seconds

setInterval(
  updateClock,
  30000
);
