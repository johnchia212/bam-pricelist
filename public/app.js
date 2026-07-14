(() => {
  const loginView = document.getElementById("login-view");
  const appView = document.getElementById("app-view");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const whoami = document.getElementById("whoami");
  const logoutBtn = document.getElementById("logout-btn");
  const adminToggle = document.getElementById("admin-toggle");
  const adminPanel = document.getElementById("admin-panel");
  const loadFileBtn = document.getElementById("load-file-btn");
  const uploadFile = document.getElementById("upload-file");
  const uploadStatus = document.getElementById("upload-status");
  const saveBtn = document.getElementById("save-btn");
  const saveStatus = document.getElementById("save-status");
  const dataMeta = document.getElementById("data-meta");
  const searchBox = document.getElementById("search-box");
  const categoryTabs = document.getElementById("category-tabs");
  const resultCount = document.getElementById("result-count");
  const resultsEl = document.getElementById("results");
  const addItemForm = document.getElementById("add-item-form");
  const addItemStatus = document.getElementById("add-item-status");
  const aiCategory = document.getElementById("ai-category");
  const aiCategoryNew = document.getElementById("ai-category-new");

  let pricelist = null;
  let sortState = { key: null, dir: 1 };
  let activeCategory = "";
  let editingKey = null; // `${category}::${index}` of row currently being edited
  let dirty = false;

  const COLUMNS = [
    { key: "model", label: "Model", editable: true },
    { key: "sap_pn", label: "SAP P/N", editable: true },
    { key: "capacity", label: "Capacity (kg) / Load Centre (mm)", editable: true },
    { key: "dimensions", label: "Dimensions (mm)", editable: true },
    { key: "range", label: "Range (mm)", editable: true },
    { key: "weight_kg", label: "Weight (kg)", editable: true, numeric: true },
    { key: "et_mm", label: "E.T (mm)", editable: true, numeric: true },
    { key: "hcg_mm", label: "HCG (mm)", editable: true },
    { key: "mounting_class", label: "Mounting Class", editable: true },
    { key: "price_rmb", label: "EXW Wuxi (RMB)", editable: true, numeric: true },
    { key: "remarks", label: "Remarks", editable: true },
  ];

  function fmtPrice(v) {
    if (v === null || v === undefined || v === "") return "—";
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " ¥";
  }

  function markDirty() {
    dirty = true;
    saveStatus.textContent = "Unsaved changes";
    saveStatus.className = "upload-status err";
  }

  function markClean() {
    dirty = false;
    saveStatus.textContent = "All changes saved";
    saveStatus.className = "upload-status ok";
  }

  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  async function checkAuth() {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (data.authenticated) {
      showApp(data.username);
    } else {
      showLogin();
    }
  }

  function showLogin() {
    loginView.hidden = false;
    appView.hidden = true;
  }

  async function showApp(username) {
    loginView.hidden = true;
    appView.hidden = false;
    whoami.textContent = username ? `Signed in as ${username}` : "";
    await loadPricelist();
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      loginForm.reset();
      showApp(data.username);
    } else {
      loginError.textContent = data.error || "Login failed";
      loginError.hidden = false;
    }
  });

  logoutBtn.addEventListener("click", async () => {
    if (dirty && !confirm("You have unsaved changes that will be lost. Log out anyway?")) return;
    await fetch("/api/logout", { method: "POST" });
    showLogin();
  });

  adminToggle.addEventListener("click", () => {
    adminPanel.hidden = !adminPanel.hidden;
  });

  // ---------- Load File (local only, does not touch R2) ----------
  loadFileBtn.addEventListener("click", async () => {
    const file = uploadFile.files[0];
    if (!file) {
      setUploadStatus("Choose a file first.", "err");
      return;
    }
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setUploadStatus("Only .xlsx or .xls files are supported", "err");
      return;
    }
    loadFileBtn.disabled = true;
    setUploadStatus("Reading & parsing workbook...", "");
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const data = parseWorkbookToPricelist(wb, file.name);
      if (!data.total_items) {
        setUploadStatus("Parsed workbook contained no price rows", "err");
        return;
      }
      pricelist = data;
      tagItemIndexes();
      if (!pricelist.categories.some((c) => c.category === activeCategory)) activeCategory = "";
      renderTabs();
      populateAddItemCategories();
      updateDataMeta();
      render();
      setUploadStatus(`Loaded ${data.total_items} items — not yet saved.`, "ok");
      markDirty();
    } catch (err) {
      setUploadStatus("Failed to read file: " + err.message, "err");
    } finally {
      loadFileBtn.disabled = false;
    }
  });

  // ---------- Save (publishes current in-browser state to R2) ----------
  saveBtn.addEventListener("click", async () => {
    if (!pricelist) return;
    saveBtn.disabled = true;
    saveStatus.textContent = "Saving...";
    saveStatus.className = "upload-status";
    try {
      pricelist.generated_at = new Date().toISOString();
      pricelist.total_items = pricelist.categories.reduce((sum, c) => sum + c.items.length, 0);
      pricelist.categories.forEach((c) => (c.count = c.items.length));
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pricelist),
      });
      const result = await res.json();
      if (res.ok && result.ok) {
        markClean();
        updateDataMeta();
      } else {
        dirty = true;
        saveStatus.textContent = result.error || "Save failed";
        saveStatus.className = "upload-status err";
      }
    } catch (err) {
      dirty = true;
      saveStatus.textContent = "Save failed: " + err.message;
      saveStatus.className = "upload-status err";
    } finally {
      saveBtn.disabled = false;
    }
  });

  const UPLOAD_HEADERS = [
    "series", "model", "sap_pn", "capacity", "dimensions", "range",
    "weight_kg", "et_mm", "hcg_mm", "mounting_class", "price_rmb",
    "updated", "remarks",
  ];

  function cleanUploadValue(v) {
    if (v === undefined || v === null) return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "string") {
      const t = v.replace(/ /g, " ").trim().replace(/^'+|'+$/g, "");
      return t === "" ? null : t;
    }
    return v;
  }

  function parseWorkbookToPricelist(wb, sourceFileName) {
    const categories = [];
    let total = 0;
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, range: 1 });
      const items = [];
      for (const row of rows) {
        const cleaned = row.slice(0, 13).map(cleanUploadValue);
        if (cleaned.every((v) => v === null)) continue;
        const rec = {};
        UPLOAD_HEADERS.forEach((h, i) => (rec[h] = cleaned[i] ?? null));
        if (typeof rec.price_rmb === "string") {
          const n = parseFloat(rec.price_rmb.replace(/[^\d.]/g, ""));
          if (!Number.isNaN(n)) rec.price_rmb = n;
        }
        rec.category = sheetName;
        items.push(rec);
      }
      total += items.length;
      categories.push({ category: sheetName, count: items.length, items });
    }
    return {
      generated_at: new Date().toISOString(),
      source_file: sourceFileName || "uploaded.xlsx",
      total_items: total,
      categories,
    };
  }

  function setUploadStatus(msg, cls) {
    uploadStatus.textContent = msg;
    uploadStatus.className = "upload-status" + (cls ? " " + cls : "");
  }

  function updateDataMeta() {
    dataMeta.textContent = `Source: ${pricelist.source_file || "—"} · ${pricelist.total_items} items · Updated ${pricelist.generated_at ? new Date(pricelist.generated_at).toLocaleString() : "—"}`;
  }

  function tagItemIndexes() {
    // Tag each item with its stable position within its category array so
    // edits can be applied to the right record even after sorting.
    pricelist.categories.forEach((c) => {
      c.items.forEach((it, i) => (it._idx = i));
    });
  }

  async function loadPricelist() {
    const res = await fetch("/api/pricelist");
    if (res.status === 401) {
      showLogin();
      return;
    }
    pricelist = await res.json();
    tagItemIndexes();
    if (!activeCategory || !pricelist.categories.some((c) => c.category === activeCategory)) {
      activeCategory = "";
    }
    renderTabs();
    populateAddItemCategories();
    updateDataMeta();
    markClean();
    render();
  }

  function populateAddItemCategories() {
    const current = aiCategory.value;
    aiCategory.innerHTML = "";
    pricelist.categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.category;
      opt.textContent = c.category;
      aiCategory.appendChild(opt);
    });
    const newOpt = document.createElement("option");
    newOpt.value = "__new__";
    newOpt.textContent = "+ New category...";
    aiCategory.appendChild(newOpt);
    if ([...aiCategory.options].some((o) => o.value === current)) {
      aiCategory.value = current;
    }
  }

  aiCategory.addEventListener("change", () => {
    const isNew = aiCategory.value === "__new__";
    aiCategoryNew.hidden = !isNew;
    if (isNew) aiCategoryNew.focus();
  });

  // ---------- Add New Item (local only, does not touch R2) ----------
  addItemForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const category = aiCategory.value === "__new__" ? aiCategoryNew.value.trim() : aiCategory.value;
    if (!category) {
      setAddItemStatus("Choose or enter a category.", "err");
      return;
    }
    const model = document.getElementById("ai-model").value.trim();
    if (!model) {
      setAddItemStatus("Model is required.", "err");
      return;
    }

    const numOrNull = (id) => {
      const v = document.getElementById(id).value.trim();
      return v === "" ? null : Number(v);
    };
    const strOrNull = (id) => {
      const v = document.getElementById(id).value.trim();
      return v === "" ? null : v;
    };

    const item = {
      series: strOrNull("ai-series"),
      model,
      sap_pn: strOrNull("ai-sap-pn"),
      capacity: strOrNull("ai-capacity"),
      dimensions: strOrNull("ai-dimensions"),
      range: strOrNull("ai-range"),
      weight_kg: numOrNull("ai-weight"),
      et_mm: numOrNull("ai-et"),
      hcg_mm: strOrNull("ai-hcg"),
      mounting_class: strOrNull("ai-mounting"),
      price_rmb: numOrNull("ai-price"),
      remarks: strOrNull("ai-remarks"),
      category,
      updated: new Date().toISOString().slice(0, 10),
    };

    let cat = pricelist.categories.find((c) => c.category === category);
    if (!cat) {
      cat = { category, count: 0, items: [] };
      pricelist.categories.push(cat);
    }
    item._idx = cat.items.length;
    cat.items.push(item);
    cat.count = cat.items.length;
    pricelist.total_items = pricelist.categories.reduce((sum, c) => sum + c.items.length, 0);

    addItemForm.reset();
    aiCategoryNew.hidden = true;
    activeCategory = category;
    renderTabs();
    populateAddItemCategories();
    aiCategory.value = category;
    render();
    setAddItemStatus(`Added to "${category}" — not yet saved.`, "ok");
    markDirty();
  });

  function setAddItemStatus(msg, cls) {
    addItemStatus.textContent = msg;
    addItemStatus.className = "upload-status" + (cls ? " " + cls : "");
  }

  function renderTabs() {
    categoryTabs.innerHTML = "";
    const allBtn = document.createElement("button");
    allBtn.className = "tab" + (activeCategory === "" ? " active" : "");
    allBtn.textContent = "All";
    allBtn.addEventListener("click", () => {
      activeCategory = "";
      editingKey = null;
      renderTabs();
      render();
    });
    categoryTabs.appendChild(allBtn);

    pricelist.categories.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "tab" + (activeCategory === c.category ? " active" : "");
      btn.textContent = `${c.category} (${c.count})`;
      btn.addEventListener("click", () => {
        activeCategory = c.category;
        editingKey = null;
        renderTabs();
        render();
      });
      categoryTabs.appendChild(btn);
    });
  }

  searchBox.addEventListener("input", render);

  function getFilteredCategories() {
    const q = searchBox.value.trim().toLowerCase();
    let cats = pricelist.categories;
    if (activeCategory) cats = cats.filter((c) => c.category === activeCategory);

    return cats
      .map((c) => {
        let items = c.items;
        if (q) {
          items = items.filter((it) =>
            [it.model, it.sap_pn, it.remarks, it.series]
              .filter(Boolean)
              .some((f) => String(f).toLowerCase().includes(q))
          );
        }
        if (sortState.key) {
          items = [...items].sort((a, b) => {
            const av = a[sortState.key];
            const bv = b[sortState.key];
            if (av === null || av === undefined) return 1;
            if (bv === null || bv === undefined) return -1;
            if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortState.dir;
            return String(av).localeCompare(String(bv)) * sortState.dir;
          });
        }
        return { category: c.category, items };
      })
      .filter((c) => c.items.length > 0);
  }

  function render() {
    if (!pricelist) return;
    const cats = getFilteredCategories();
    const total = cats.reduce((sum, c) => sum + c.items.length, 0);
    resultCount.textContent = `${total} item${total === 1 ? "" : "s"}`;

    if (total === 0) {
      resultsEl.innerHTML = '<p class="empty-state">No matching items.</p>';
      return;
    }

    resultsEl.innerHTML = "";
    cats.forEach((c) => {
      const block = document.createElement("div");
      block.className = "category-block";

      const h3 = document.createElement("h3");
      h3.innerHTML = `<span>${c.category}</span><span class="cat-count">${c.items.length} item${c.items.length === 1 ? "" : "s"}</span>`;
      block.appendChild(h3);

      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      COLUMNS.forEach((col) => {
        const th = document.createElement("th");
        th.textContent = col.label + (sortState.key === col.key ? (sortState.dir === 1 ? " ▲" : " ▼") : "");
        th.addEventListener("click", () => {
          sortState = { key: col.key, dir: sortState.key === col.key ? -sortState.dir : 1 };
          render();
        });
        headRow.appendChild(th);
      });
      const actionsTh = document.createElement("th");
      actionsTh.textContent = "";
      headRow.appendChild(actionsTh);
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      c.items.forEach((it) => {
        const rowKey = `${c.category}::${it._idx}`;
        const isEditing = editingKey === rowKey;
        const tr = document.createElement("tr");
        if (isEditing) tr.className = "editing-row";

        COLUMNS.forEach((col) => {
          const td = document.createElement("td");
          td.setAttribute("data-label", col.label);
          if (isEditing && col.editable) {
            const input = document.createElement("input");
            input.type = col.numeric ? "number" : "text";
            input.step = "any";
            input.className = "edit-input";
            input.dataset.field = col.key;
            input.value = it[col.key] ?? "";
            td.appendChild(input);
          } else if (col.key === "price_rmb") {
            td.className = "price-cell";
            td.textContent = fmtPrice(it.price_rmb);
          } else if (col.key === "remarks") {
            td.className = "remarks-cell";
            td.textContent = it.remarks || "—";
          } else {
            td.textContent = it[col.key] ?? "—";
          }
          tr.appendChild(td);
        });

        const actionsTd = document.createElement("td");
        actionsTd.className = "actions-cell";
        if (isEditing) {
          const updateBtn = document.createElement("button");
          updateBtn.className = "btn-tiny btn-tiny-primary";
          updateBtn.textContent = "Update";
          updateBtn.addEventListener("click", () => {
            const inputs = tr.querySelectorAll(".edit-input");
            inputs.forEach((inp) => {
              const col = COLUMNS.find((c2) => c2.key === inp.dataset.field);
              let v = inp.value.trim();
              if (col && col.numeric) {
                v = v === "" ? null : Number(v);
              } else {
                v = v === "" ? null : v;
              }
              it[inp.dataset.field] = v;
            });
            it.updated = new Date().toISOString().slice(0, 10);
            editingKey = null;
            render();
            markDirty();
          });
          const cancelBtn = document.createElement("button");
          cancelBtn.className = "btn-tiny";
          cancelBtn.textContent = "Cancel";
          cancelBtn.addEventListener("click", () => {
            editingKey = null;
            render();
          });
          actionsTd.appendChild(updateBtn);
          actionsTd.appendChild(cancelBtn);
        } else {
          const editBtn = document.createElement("button");
          editBtn.className = "btn-tiny";
          editBtn.textContent = "Edit";
          editBtn.addEventListener("click", () => {
            editingKey = rowKey;
            render();
          });
          actionsTd.appendChild(editBtn);
        }
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      block.appendChild(table);
      resultsEl.appendChild(block);
    });
  }

  checkAuth();
})();
