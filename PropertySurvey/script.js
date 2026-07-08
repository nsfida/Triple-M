/**
 * Property Survey Application
 * Static frontend with Supabase backend integration.
 * No frameworks — vanilla JavaScript only.
 */

/* ==========================================================================
   CONFIGURATION — paste your Supabase credentials here
   ========================================================================== */

window.__surveyScriptLoaded = true;

const SUPABASE_URL = "https://nqaafehuewmejftqsmjr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xYWFmZWh1ZXdtZWpmdHFzbWpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MjUzMzgsImV4cCI6MjA5OTAwMTMzOH0.JDEB3b-4psn4DMYWDA8XF112xVsyo_aJnuDid1EmbMo";

const DEFAULT_ADMIN_SECRET_KEY = "PropertySurveyAdmin2026!";
const ADMIN_SECRET_KEY = readAdminSecretKey();

function readAdminSecretKey() {
    try {
        const stored = window.localStorage.getItem("property_survey_admin_key");
        if (stored && stored.trim()) return stored.trim();
    } catch (err) {
        console.warn("Could not read stored admin key:", err);
    }
    return DEFAULT_ADMIN_SECRET_KEY;
}

/* ==========================================================================
   CONSTANTS
   ========================================================================== */

const CONDITION_OPTIONS = [
    "Excellent",
    "Good",
    "Fair",
    "Poor",
    "Damaged",
    "Not Applicable"
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const DRAFT_STORAGE_KEY = "property_survey_draft";
const STORAGE_BUCKET = "property-surveys";

/** Inspection section definitions with condition fields */
const INSPECTION_SECTIONS = [
    {
        key: "exterior",
        title: "Exterior Inspection",
        fields: ["roof", "walls", "paint", "driveway", "garden", "fence", "windows", "doors", "garage"]
    },
    {
        key: "living_room",
        title: "Living Room",
        fields: ["floor", "walls", "ceiling", "windows", "doors", "electrical", "lighting", "air_conditioning", "furniture", "smoke_detector"]
    },
    {
        key: "kitchen",
        title: "Kitchen",
        fields: ["floor", "walls", "cabinets", "sink", "water_pressure", "drain", "countertops", "appliances", "electrical", "lighting"]
    },
    {
        key: "bedroom",
        title: "Bedroom",
        fields: ["floor", "walls", "ceiling", "wardrobes", "windows", "doors", "electrical", "lighting"]
    },
    {
        key: "bathroom",
        title: "Bathroom",
        fields: ["floor", "walls", "tiles", "toilet", "sink", "mirror", "shower", "bathtub", "ventilation", "water_pressure", "drainage"]
    },
    {
        key: "laundry",
        title: "Laundry",
        fields: []
    },
    {
        key: "balcony",
        title: "Balcony",
        fields: []
    },
    {
        key: "parking",
        title: "Parking",
        fields: []
    },
    {
        key: "utility_room",
        title: "Utility Room",
        fields: []
    }
];

/** Human-readable labels for condition field keys */
const FIELD_LABELS = {
    roof: "Roof", walls: "Walls", paint: "Paint", driveway: "Driveway",
    garden: "Garden", fence: "Fence", windows: "Windows", doors: "Doors",
    garage: "Garage", floor: "Floor", ceiling: "Ceiling", electrical: "Electrical",
    lighting: "Lighting", air_conditioning: "Air Conditioning", furniture: "Furniture",
    smoke_detector: "Smoke Detector", cabinets: "Cabinets", sink: "Sink",
    water_pressure: "Water Pressure", drain: "Drain", countertops: "Countertops",
    appliances: "Appliances", wardrobes: "Wardrobes", tiles: "Tiles",
    toilet: "Toilet", mirror: "Mirror", shower: "Shower", bathtub: "Bathtub",
    ventilation: "Ventilation", drainage: "Drainage"
};

/* ==========================================================================
   STATE
   ========================================================================== */

let supabaseClient = null;
let isAdminMode = false;
let allSurveys = [];
let currentDetailSurvey = null;

/** Pending photos keyed by section: { sectionKey: [{ file, previewUrl, id }] } */
const pendingPhotos = {};

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */

function init() {
    try {
        const supabaseReady = initSupabase();
        renderInspectionSections();
        bindFormEvents();
        bindAdminEvents();
        bindSignaturePads();
        bindCollapsibleSections();
        setDefaultDate();
        loadDraft();
        startDraftAutoSave();

        if (!supabaseReady) {
            showToast("Running in local-only mode. The admin and photo upload controls are available now.", "info");
        }
    } catch (err) {
        showToast("Failed to initialize application: " + err.message, "error");
        console.error("Init error:", err);
    }
}

function initSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        showToast("Supabase credentials not configured. Please add your URL and Anon Key in script.js.", "error");
        return false;
    }

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
        console.warn("Supabase SDK not available yet; continuing in local-only mode.");
        return false;
    }

    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return true;
    } catch (err) {
        console.error("Failed to initialize Supabase client:", err);
        showToast("Supabase could not be initialized. The app will continue in local-only mode.", "info");
        return false;
    }
}

/* ==========================================================================
   DOM RENDERING — Inspection Sections
   ========================================================================== */

function renderInspectionSections() {
    const container = document.getElementById("inspection-sections");
    if (!container) return;

    container.innerHTML = INSPECTION_SECTIONS.map(section => {
        const fieldsHtml = section.fields.length
            ? `<div class="field-grid">${section.fields.map(f => buildConditionField(section.key, f)).join("")}</div>`
            : "";

        return `
            <section class="form-section" data-section="${section.key}">
                <button type="button" class="section-toggle" aria-expanded="true">
                    <span class="section-title">${section.title}</span>
                    <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="section-body">
                    ${fieldsHtml}
                    <div class="field-group field-full" style="margin-top:${section.fields.length ? "16px" : "0"}">
                        <label for="${section.key}_comments">Comments</label>
                        <textarea id="${section.key}_comments" name="${section.key}_comments" rows="3"></textarea>
                    </div>
                    <div class="field-group field-full" style="margin-top:16px">
                        <label>Photo Upload</label>
                        ${buildPhotoUpload(section.key)}
                    </div>
                </div>
            </section>`;
    }).join("");

    bindCollapsibleSections();
    bindPhotoUploads();
}

function buildConditionField(sectionKey, fieldKey) {
    const name = `${sectionKey}_${fieldKey}`;
    const label = FIELD_LABELS[fieldKey] || formatLabel(fieldKey);
    const options = CONDITION_OPTIONS.map(o => `<option value="${o}">${o}</option>`).join("");
    return `
        <div class="field-group">
            <label for="${name}">${label}</label>
            <select id="${name}" name="${name}">
                <option value="">Select…</option>
                ${options}
            </select>
        </div>`;
}

function buildPhotoUpload(sectionKey) {
    return `
        <div class="photo-upload-area" data-section="${sectionKey}" tabindex="0" role="button" aria-label="Upload photos for ${sectionKey}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
            </svg>
            <p>Drag &amp; drop photos here or click to browse</p>
            <p style="font-size:0.75rem">JPG, PNG, WEBP — max 10 MB each</p>
            <button type="button" class="btn btn-outline btn-sm">Choose Photos</button>
            <input type="file" accept=".jpg,.jpeg,.png,.webp" multiple data-section="${sectionKey}">
        </div>
        <div class="photo-previews" id="previews-${sectionKey}"></div>`;
}

function formatLabel(key) {
    return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/* ==========================================================================
   COLLAPSIBLE SECTIONS
   ========================================================================== */

function bindCollapsibleSections() {
    document.querySelectorAll(".section-toggle").forEach(toggle => {
        toggle.removeEventListener("click", handleSectionToggle);
        toggle.addEventListener("click", handleSectionToggle);
    });
}

function handleSectionToggle(e) {
    const btn = e.currentTarget;
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!expanded));
}

/* ==========================================================================
   PHOTO UPLOAD — Drag & Drop, Preview, Compression
   ========================================================================== */

function bindPhotoUploads() {
    document.querySelectorAll(".photo-upload-area").forEach(area => {
        const sectionKey = area.dataset.section;
        const input = area.querySelector('input[type="file"]');

        const triggerUpload = () => input.click();

        area.addEventListener("click", triggerUpload);
        area.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); triggerUpload(); } });

        const button = area.querySelector("button");
        if (button) {
            button.addEventListener("click", e => {
                e.stopPropagation();
                triggerUpload();
            });
        }

        area.addEventListener("dragover", e => { e.preventDefault(); area.classList.add("drag-over"); });
        area.addEventListener("dragleave", () => area.classList.remove("drag-over"));
        area.addEventListener("drop", e => {
            e.preventDefault();
            area.classList.remove("drag-over");
            handlePhotoFiles(sectionKey, e.dataTransfer.files);
        });

        input.addEventListener("change", () => {
            handlePhotoFiles(sectionKey, input.files);
            input.value = "";
        });
    });
}

async function handlePhotoFiles(sectionKey, fileList) {
    if (!fileList || !fileList.length) return;

    if (!pendingPhotos[sectionKey]) pendingPhotos[sectionKey] = [];

    for (const file of fileList) {
        const validation = validatePhotoFile(file);
        if (!validation.valid) {
            showToast(validation.error, "error");
            continue;
        }

        try {
            const compressed = await compressImage(file);
            const id = crypto.randomUUID();
            const previewUrl = URL.createObjectURL(compressed);

            pendingPhotos[sectionKey].push({ id, file: compressed, previewUrl, originalName: file.name });
            renderPhotoPreview(sectionKey);
        } catch (err) {
            showToast(`Failed to process ${file.name}: ${err.message}`, "error");
        }
    }
}

function validatePhotoFile(file) {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return { valid: false, error: `"${file.name}" is not an allowed format. Use JPG, PNG, or WEBP.` };
    }
    if (file.size > MAX_FILE_SIZE) {
        return { valid: false, error: `"${file.name}" exceeds the 10 MB limit.` };
    }
    return { valid: true };
}

/**
 * Compress image using canvas.
 * Resizes to max 1920px on longest side and converts to JPEG at 0.82 quality.
 */
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const MAX_DIM = 1920;
                let { width, height } = img;
                if (width > MAX_DIM || height > MAX_DIM) {
                    const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    blob => {
                        if (!blob) { reject(new Error("Compression failed")); return; }
                        const ext = file.type === "image/png" ? "png" : "jpg";
                        const compressed = new File([blob], file.name.replace(/\.\w+$/, `.${ext}`), {
                            type: blob.type,
                            lastModified: Date.now()
                        });
                        resolve(compressed);
                    },
                    file.type === "image/png" ? "image/png" : "image/jpeg",
                    0.82
                );
            };
            img.onerror = () => reject(new Error("Could not load image"));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
    });
}

function renderPhotoPreview(sectionKey) {
    const container = document.getElementById(`previews-${sectionKey}`);
    if (!container) return;
    const photos = pendingPhotos[sectionKey] || [];

    container.innerHTML = photos.map(p => `
        <div class="photo-preview-item" data-id="${p.id}">
            <img src="${p.previewUrl}" alt="${p.originalName}">
            <button type="button" class="photo-remove" data-section="${sectionKey}" data-id="${p.id}" aria-label="Remove photo">&times;</button>
            <span class="photo-size">${formatFileSize(p.file.size)}</span>
        </div>`).join("");

    container.querySelectorAll(".photo-remove").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            removePendingPhoto(btn.dataset.section, btn.dataset.id);
        });
    });
}

function removePendingPhoto(sectionKey, photoId) {
    const photos = pendingPhotos[sectionKey];
    if (!photos) return;
    const idx = photos.findIndex(p => p.id === photoId);
    if (idx === -1) return;
    URL.revokeObjectURL(photos[idx].previewUrl);
    photos.splice(idx, 1);
    renderPhotoPreview(sectionKey);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
}

function getAllPendingPhotos() {
    const all = [];
    for (const [sectionKey, photos] of Object.entries(pendingPhotos)) {
        for (const photo of photos) {
            all.push({ sectionKey, ...photo });
        }
    }
    return all;
}

function clearAllPendingPhotos() {
    for (const sectionKey of Object.keys(pendingPhotos)) {
        for (const photo of pendingPhotos[sectionKey]) {
            URL.revokeObjectURL(photo.previewUrl);
        }
        pendingPhotos[sectionKey] = [];
        renderPhotoPreview(sectionKey);
    }
}

/* ==========================================================================
   SIGNATURE PADS
   ========================================================================== */

const signaturePads = {};

function bindSignaturePads() {
    ["customer_signature", "inspector_signature"].forEach(id => {
        const canvas = document.getElementById(id);
        if (!canvas) return;
        signaturePads[id] = initSignaturePad(canvas);
    });

    document.querySelectorAll(".sig-clear").forEach(btn => {
        btn.addEventListener("click", () => {
            const pad = signaturePads[btn.dataset.target];
            if (pad) pad.clear();
        });
    });
}

function initSignaturePad(canvas) {
    const ctx = canvas.getContext("2d");
    let drawing = false;
    let hasContent = false;

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    }

    function start(e) { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
    function draw(e) {
        if (!drawing) return;
        e.preventDefault();
        const p = getPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        hasContent = true;
    }
    function stop() { drawing = false; }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", stop);
    canvas.addEventListener("mouseleave", stop);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    canvas.addEventListener("touchend", stop);

    return {
        clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); hasContent = false; },
        isEmpty() { return !hasContent; },
        toDataURL() { return hasContent ? canvas.toDataURL("image/png") : "" }
    };
}

/* ==========================================================================
   FORM — Validation, Draft, Submission
   ========================================================================== */

function bindFormEvents() {
    const form = document.getElementById("survey-form");
    form.addEventListener("submit", handleSubmit);
    form.addEventListener("input", debounce(saveDraft, 800));
    form.addEventListener("change", debounce(saveDraft, 800));
}

function setDefaultDate() {
    const dateInput = document.getElementById("survey_date");
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split("T")[0];
    }
}

function getRequiredFields() {
    return ["customer_name", "property_address", "survey_date", "inspector_name", "property_type", "overall_condition"];
}

function validateForm() {
    let valid = true;
    const required = getRequiredFields();

    required.forEach(name => {
        const el = document.getElementById(name);
        if (!el) return;
        if (!el.value.trim()) {
            el.classList.add("invalid");
            valid = false;
        } else {
            el.classList.remove("invalid");
        }
    });

    if (!valid) {
        showToast("Please fill in all required fields.", "error");
        const firstInvalid = document.querySelector(".invalid");
        if (firstInvalid) {
            firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
            firstInvalid.focus();
        }
    }
    return valid;
}

function collectFormData() {
    const form = document.getElementById("survey-form");
    const fd = new FormData(form);
    const data = {};

    for (const [key, value] of fd.entries()) {
        data[key] = value;
    }

    data.customer_signature = signaturePads["customer_signature"]?.toDataURL() || "";
    data.inspector_signature = signaturePads["inspector_signature"]?.toDataURL() || "";

    return data;
}

function collectSectionData() {
    return INSPECTION_SECTIONS.map(section => {
        const conditions = {};
        for (const field of section.fields) {
            const el = document.getElementById(`${section.key}_${field}`);
            if (el) conditions[field] = el.value;
        }
        const commentsEl = document.getElementById(`${section.key}_comments`);
        return {
            section_key: section.key,
            comments: commentsEl ? commentsEl.value : "",
            conditions
        };
    });
}

async function handleSubmit(e) {
    e.preventDefault();
    if (!validateForm()) return;
    if (!supabaseClient) {
        showToast("Supabase is not configured. Add your credentials in script.js.", "error");
        return;
    }

    const submitBtn = document.getElementById("btn-submit");
    submitBtn.disabled = true;

    const surveyId = crypto.randomUUID();
    const formData = collectFormData();
    const sections = collectSectionData();
    const photos = getAllPendingPhotos();

    try {
        showLoading("Preparing submission…");

        // Step 1: Upload all photos first
        const uploadedPhotos = [];
        if (photos.length > 0) {
            showProgress(0, photos.length, "Uploading photographs…");
            for (let i = 0; i < photos.length; i++) {
                const photo = photos[i];
                const ext = photo.file.name.split(".").pop();
                const storagePath = `${surveyId}/${photo.sectionKey}/${crypto.randomUUID()}.${ext}`;

                const { error: uploadError } = await supabaseClient.storage
                    .from(STORAGE_BUCKET)
                    .upload(storagePath, photo.file, {
                        contentType: photo.file.type,
                        upsert: false
                    });

                if (uploadError) {
                    throw new Error(`Photo upload failed (${photo.originalName}): ${uploadError.message}`);
                }

                const { data: urlData } = supabaseClient.storage
                    .from(STORAGE_BUCKET)
                    .getPublicUrl(storagePath);

                uploadedPhotos.push({
                    section_key: photo.sectionKey,
                    storage_path: storagePath,
                    public_url: urlData.publicUrl,
                    file_name: photo.originalName,
                    file_size: photo.file.size,
                    mime_type: photo.file.type
                });

                showProgress(i + 1, photos.length, `Uploaded ${i + 1} of ${photos.length} photos…`);
            }
        }

        // Step 2: Insert survey record
        showLoading("Saving survey data…");

        const surveyRecord = {
            id: surveyId,
            customer_name: formData.customer_name,
            customer_phone: formData.customer_phone || null,
            customer_email: formData.customer_email || null,
            property_address: formData.property_address,
            survey_date: formData.survey_date,
            inspection_time: formData.inspection_time || null,
            inspector_name: formData.inspector_name,
            property_type: formData.property_type,
            num_bedrooms: parseInt(formData.num_bedrooms) || 0,
            num_bathrooms: parseInt(formData.num_bathrooms) || 0,
            occupancy_status: formData.occupancy_status || null,
            general_notes: formData.general_notes || null,
            overall_condition: formData.overall_condition,
            major_issues: formData.major_issues || null,
            recommendations: formData.recommendations || null,
            additional_notes: formData.additional_notes || null,
            customer_signature: formData.customer_signature || null,
            inspector_signature: formData.inspector_signature || null
        };

        const { error: surveyError } = await supabaseClient
            .from("surveys")
            .insert(surveyRecord);

        if (surveyError) {
            // Rollback uploaded photos on failure
            await rollbackPhotos(uploadedPhotos);
            throw new Error("Failed to save survey: " + surveyError.message);
        }

        // Step 3: Insert section records
        const sectionRecords = sections.map(s => ({
            survey_id: surveyId,
            section_key: s.section_key,
            comments: s.comments || null,
            conditions: s.conditions
        }));

        const { error: sectionError } = await supabaseClient
            .from("survey_sections")
            .insert(sectionRecords);

        if (sectionError) {
            await rollbackSurvey(surveyId, uploadedPhotos);
            throw new Error("Failed to save inspection sections: " + sectionError.message);
        }

        // Step 4: Insert photo records
        if (uploadedPhotos.length > 0) {
            const photoRecords = uploadedPhotos.map(p => ({
                survey_id: surveyId,
                section_key: p.section_key,
                storage_path: p.storage_path,
                public_url: p.public_url,
                file_name: p.file_name,
                file_size: p.file_size,
                mime_type: p.mime_type
            }));

            const { error: photoError } = await supabaseClient
                .from("survey_photos")
                .insert(photoRecords);

            if (photoError) {
                await rollbackSurvey(surveyId, uploadedPhotos);
                throw new Error("Failed to save photo records: " + photoError.message);
            }
        }

        hideLoading();
        showToast("Survey submitted successfully!", "success");
        resetForm();
        clearDraft();

    } catch (err) {
        hideLoading();
        showToast(err.message, "error");
        console.error("Submission error:", err);
    } finally {
        submitBtn.disabled = false;
    }
}

/** Delete uploaded storage files on rollback */
async function rollbackPhotos(uploadedPhotos) {
    if (!uploadedPhotos.length || !supabaseClient) return;
    const paths = uploadedPhotos.map(p => p.storage_path);
    await supabaseClient.storage.from(STORAGE_BUCKET).remove(paths);
}

/** Delete survey and photos on rollback */
async function rollbackSurvey(surveyId, uploadedPhotos) {
    await rollbackPhotos(uploadedPhotos);
    if (supabaseClient) {
        await supabaseClient.from("surveys").delete().eq("id", surveyId);
    }
}

function resetForm() {
    document.getElementById("survey-form").reset();
    setDefaultDate();
    Object.values(signaturePads).forEach(pad => pad.clear());
    clearAllPendingPhotos();

    INSPECTION_SECTIONS.forEach(section => {
        for (const field of section.fields) {
            const el = document.getElementById(`${section.key}_${field}`);
            if (el) el.value = "";
        }
        const commentsEl = document.getElementById(`${section.key}_comments`);
        if (commentsEl) commentsEl.value = "";
    });

    document.querySelectorAll(".invalid").forEach(el => el.classList.remove("invalid"));
}

/* ==========================================================================
   DRAFT — localStorage (temporary only)
   ========================================================================== */

function saveDraft() {
    try {
        const draft = {
            formData: collectFormData(),
            sections: collectSectionData(),
            savedAt: new Date().toISOString()
        };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
        const notice = document.getElementById("draft-notice");
        if (notice) {
            notice.classList.add("visible");
            setTimeout(() => notice.classList.remove("visible"), 2000);
        }
    } catch (err) {
        console.warn("Could not save draft:", err);
    }
}

function loadDraft() {
    try {
        const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (!draft.formData) return;

        const form = document.getElementById("survey-form");
        for (const [key, value] of Object.entries(draft.formData)) {
            if (key.endsWith("_signature")) continue;
            const el = form.elements[key];
            if (el) el.value = value;
        }

        if (draft.sections) {
            for (const section of draft.sections) {
                for (const [field, value] of Object.entries(section.conditions || {})) {
                    const el = document.getElementById(`${section.section_key}_${field}`);
                    if (el) el.value = value;
                }
                const commentsEl = document.getElementById(`${section.section_key}_comments`);
                if (commentsEl) commentsEl.value = section.comments || "";
            }
        }
    } catch (err) {
        console.warn("Could not load draft:", err);
    }
}

function clearDraft() {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
}

function startDraftAutoSave() {
    setInterval(saveDraft, 30000);
}

/* ==========================================================================
   ADMIN — Authentication, Dashboard, CRUD
   ========================================================================== */

function bindAdminEvents() {
    document.getElementById("btn-admin").addEventListener("click", () => openModal("admin-modal"));
    document.getElementById("admin-modal-cancel").addEventListener("click", () => closeModal("admin-modal"));
    document.getElementById("admin-modal-backdrop").addEventListener("click", () => closeModal("admin-modal"));
    document.getElementById("admin-modal-submit").addEventListener("click", handleAdminLogin);
    document.getElementById("admin-key-input").addEventListener("keydown", e => {
        if (e.key === "Enter") handleAdminLogin();
    });

    document.getElementById("btn-new-survey").addEventListener("click", showSurveyView);
    document.getElementById("btn-export-csv").addEventListener("click", exportCSV);
    document.getElementById("btn-clear-search").addEventListener("click", clearSearch);

    ["search-customer", "search-address", "search-inspector"].forEach(id => {
        document.getElementById(id).addEventListener("input", debounce(filterSurveys, 300));
    });
    document.getElementById("search-date").addEventListener("change", filterSurveys);
    document.getElementById("search-type").addEventListener("change", filterSurveys);

    document.getElementById("detail-modal-close").addEventListener("click", () => closeModal("detail-modal"));
    document.getElementById("detail-modal-backdrop").addEventListener("click", () => closeModal("detail-modal"));
    document.getElementById("btn-print-survey").addEventListener("click", () => window.print());
    document.getElementById("btn-download-json").addEventListener("click", downloadSurveyJSON);
    document.getElementById("btn-download-pdf").addEventListener("click", downloadSurveyPDF);
    document.getElementById("btn-delete-survey").addEventListener("click", handleDeleteSurvey);
}

function handleAdminLogin() {
    const input = document.getElementById("admin-key-input");
    const errorEl = document.getElementById("admin-key-error");
    const enteredKey = input.value.trim();

    if (enteredKey && (enteredKey === ADMIN_SECRET_KEY || enteredKey === DEFAULT_ADMIN_SECRET_KEY)) {
        try {
            window.localStorage.setItem("property_survey_admin_key", enteredKey);
        } catch (err) {
            console.warn("Could not persist admin key:", err);
        }
        errorEl.classList.add("hidden");
        closeModal("admin-modal");
        input.value = "";
        enterAdminMode();
    } else {
        errorEl.classList.remove("hidden");
        input.value = "";
        input.focus();
    }
}

async function enterAdminMode() {
    isAdminMode = true;
    document.body.classList.add("admin-mode");
    showAdminView();
    await loadSurveys();
}

function showAdminView() {
    document.getElementById("survey-view").classList.add("hidden");
    document.getElementById("admin-view").classList.remove("hidden");
    document.getElementById("btn-new-survey").classList.remove("hidden");
    document.querySelector(".submit-bar").classList.add("hidden");
}

function showSurveyView() {
    isAdminMode = false;
    document.body.classList.remove("admin-mode");
    document.getElementById("admin-view").classList.add("hidden");
    document.getElementById("survey-view").classList.remove("hidden");
    document.getElementById("btn-new-survey").classList.add("hidden");
    document.querySelector(".submit-bar").classList.remove("hidden");
}

async function loadSurveys() {
    if (!supabaseClient) {
        showToast("Supabase is not configured.", "error");
        return;
    }

    try {
        showLoading("Loading surveys…");

        const { data: surveys, error: surveyError } = await supabaseClient
            .from("surveys")
            .select("*")
            .order("created_at", { ascending: false });

        if (surveyError) throw new Error(surveyError.message);

        const { data: sections, error: sectionError } = await supabaseClient
            .from("survey_sections")
            .select("*");

        if (sectionError) throw new Error(sectionError.message);

        const { data: photos, error: photoError } = await supabaseClient
            .from("survey_photos")
            .select("*");

        if (photoError) throw new Error(photoError.message);

        allSurveys = (surveys || []).map(s => ({
            ...s,
            sections: (sections || []).filter(sec => sec.survey_id === s.id),
            photos: (photos || []).filter(p => p.survey_id === s.id)
        }));

        hideLoading();
        renderSurveyList(allSurveys);

    } catch (err) {
        hideLoading();
        showToast("Failed to load surveys: " + err.message, "error");
        console.error("Load error:", err);
    }
}

function renderSurveyList(surveys) {
    const container = document.getElementById("admin-survey-list");

    if (!surveys.length) {
        container.innerHTML = `
            <div class="empty-state" id="admin-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <p>No surveys found.</p>
            </div>`;
        return;
    }

    container.innerHTML = surveys.map(s => `
        <div class="survey-card" data-id="${s.id}" tabindex="0" role="button">
            <div class="survey-card-info">
                <h3>${escapeHtml(s.customer_name)}</h3>
                <p>${escapeHtml(s.property_address)}</p>
                <p>Inspector: ${escapeHtml(s.inspector_name)}</p>
            </div>
            <div class="survey-card-meta">
                <span class="badge badge-type">${escapeHtml(s.property_type)}</span>
                <span class="badge badge-condition-${(s.overall_condition || "").toLowerCase()}">${escapeHtml(s.overall_condition || "N/A")}</span>
                <span class="survey-card-date">${formatDate(s.survey_date)} · ${s.photos.length} photo${s.photos.length !== 1 ? "s" : ""}</span>
            </div>
        </div>`).join("");

    container.querySelectorAll(".survey-card").forEach(card => {
        const open = () => openSurveyDetail(card.dataset.id);
        card.addEventListener("click", open);
        card.addEventListener("keydown", e => { if (e.key === "Enter") open(); });
    });
}

function filterSurveys() {
    const customer = document.getElementById("search-customer").value.toLowerCase();
    const address = document.getElementById("search-address").value.toLowerCase();
    const date = document.getElementById("search-date").value;
    const inspector = document.getElementById("search-inspector").value.toLowerCase();
    const type = document.getElementById("search-type").value;

    const filtered = allSurveys.filter(s => {
        if (customer && !s.customer_name.toLowerCase().includes(customer)) return false;
        if (address && !s.property_address.toLowerCase().includes(address)) return false;
        if (date && s.survey_date !== date) return false;
        if (inspector && !s.inspector_name.toLowerCase().includes(inspector)) return false;
        if (type && s.property_type !== type) return false;
        return true;
    });

    renderSurveyList(filtered);
}

function clearSearch() {
    document.getElementById("search-customer").value = "";
    document.getElementById("search-address").value = "";
    document.getElementById("search-date").value = "";
    document.getElementById("search-inspector").value = "";
    document.getElementById("search-type").value = "";
    renderSurveyList(allSurveys);
}

function openSurveyDetail(surveyId) {
    currentDetailSurvey = allSurveys.find(s => s.id === surveyId);
    if (!currentDetailSurvey) return;

    const body = document.getElementById("detail-modal-body");
    const s = currentDetailSurvey;

    let html = `
        <div class="detail-section">
            <h3>General Information</h3>
            <div class="detail-grid">
                ${detailItem("Customer Name", s.customer_name)}
                ${detailItem("Phone", s.customer_phone)}
                ${detailItem("Email", s.customer_email)}
                ${detailItem("Address", s.property_address)}
                ${detailItem("Survey Date", formatDate(s.survey_date))}
                ${detailItem("Inspection Time", s.inspection_time)}
                ${detailItem("Inspector", s.inspector_name)}
                ${detailItem("Property Type", s.property_type)}
                ${detailItem("Bedrooms", s.num_bedrooms)}
                ${detailItem("Bathrooms", s.num_bathrooms)}
                ${detailItem("Occupancy", s.occupancy_status)}
                ${detailItem("Notes", s.general_notes)}
            </div>
        </div>`;

    for (const sectionDef of INSPECTION_SECTIONS) {
        const sectionData = s.sections.find(sec => sec.section_key === sectionDef.key);
        if (!sectionData) continue;

        html += `<div class="detail-section"><h3>${sectionDef.title}</h3>`;

        if (sectionDef.fields.length && sectionData.conditions) {
            html += `<div class="detail-conditions">`;
            for (const field of sectionDef.fields) {
                const val = sectionData.conditions[field] || "—";
                html += `<div class="condition-item"><span class="cond-label">${FIELD_LABELS[field] || formatLabel(field)}</span><span class="cond-value">${escapeHtml(val)}</span></div>`;
            }
            html += `</div>`;
        }

        if (sectionData.comments) {
            html += `<p style="margin-top:12px;font-size:0.875rem"><strong>Comments:</strong> ${escapeHtml(sectionData.comments)}</p>`;
        }

        const sectionPhotos = s.photos.filter(p => p.section_key === sectionDef.key);
        if (sectionPhotos.length) {
            html += `<div class="detail-photos">${sectionPhotos.map(p =>
                `<a href="${p.public_url}" target="_blank" rel="noopener"><img src="${p.public_url}" alt="${escapeHtml(p.file_name)}" loading="lazy"></a>`
            ).join("")}</div>`;
        }

        html += `</div>`;
    }

    html += `
        <div class="detail-section">
            <h3>Final Summary</h3>
            <div class="detail-grid">
                ${detailItem("Overall Condition", s.overall_condition)}
                ${detailItem("Major Issues", s.major_issues)}
                ${detailItem("Recommendations", s.recommendations)}
                ${detailItem("Additional Notes", s.additional_notes)}
            </div>
            ${s.customer_signature ? `<div style="margin-top:12px"><label style="font-size:0.75rem;color:var(--color-text-muted)">Customer Signature</label><img class="detail-signature" src="${s.customer_signature}" alt="Customer signature"></div>` : ""}
            ${s.inspector_signature ? `<div style="margin-top:12px"><label style="font-size:0.75rem;color:var(--color-text-muted)">Inspector Signature</label><img class="detail-signature" src="${s.inspector_signature}" alt="Inspector signature"></div>` : ""}
            <div class="detail-delete-box" style="margin-top:16px;padding:12px 14px;border:1px solid #fecaca;border-radius:10px;background:#fef2f2;">
                <strong>Permanent delete</strong>
                <p style="margin-top:4px;font-size:0.9rem;color:#991b1b;">This removes the survey, sections, photos, and attached files from the admin view.</p>
            </div>
        </div>`;

    body.innerHTML = html;
    document.getElementById("detail-modal-title").textContent = `${s.customer_name} — ${s.property_address}`;
    openModal("detail-modal");
}

function detailItem(label, value) {
    return `<div class="detail-item"><label>${label}</label><span>${escapeHtml(value || "—")}</span></div>`;
}

async function handleDeleteSurvey() {
    if (!currentDetailSurvey) return;
    const name = currentDetailSurvey.customer_name;
    if (!confirm(`Delete survey for "${name}"? This cannot be undone.`)) return;

    try {
        showLoading("Deleting survey…");

        const paths = (currentDetailSurvey.photos || []).map(p => p.storage_path);
        if (paths.length && supabaseClient) {
            await supabaseClient.storage.from(STORAGE_BUCKET).remove(paths);
        }

        const { error } = await supabaseClient
            .from("surveys")
            .delete()
            .eq("id", currentDetailSurvey.id);

        if (error) throw new Error(error.message);

        hideLoading();
        closeModal("detail-modal");
        showToast("Survey deleted permanently.", "success");
        currentDetailSurvey = null;
        await loadSurveys();

    } catch (err) {
        hideLoading();
        showToast("Delete failed: " + err.message, "error");
    }
}

function downloadSurveyJSON() {
    if (!currentDetailSurvey) return;
    const blob = new Blob([JSON.stringify(currentDetailSurvey, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `survey-${currentDetailSurvey.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function downloadSurveyPDF() {
    if (!currentDetailSurvey) return;

    if (typeof window.jspdf === "undefined") {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.async = true;
        await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const lineHeight = 16;
    const primaryColor = [37, 99, 235];
    const darkColor = [15, 23, 42];

    const survey = currentDetailSurvey;
    const title = `${survey.customer_name || "Survey"}`;
    const subtitle = survey.property_address || "Property Survey";

    function addText(text, x, y, opts = {}) {
        doc.setFont("helvetica", opts.bold ? "bold" : "normal");
        doc.setFontSize(opts.size || 11);
        doc.setTextColor(opts.color || darkColor[0], opts.color ? darkColor[1] : darkColor[0], opts.color ? darkColor[2] : darkColor[0]);
        doc.text(String(text ?? "—"), x, y);
    }

    function addSectionTitle(text, y) {
        doc.setFillColor(...primaryColor);
        doc.roundedRect(margin, y, pageWidth - margin * 2, 24, 6, 6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(255, 255, 255);
        doc.text(text, margin + 12, y + 15);
    }

    function addDivider(y) {
        doc.setDrawColor(203, 213, 225);
        doc.line(margin, y, pageWidth - margin, y);
    }

    let y = 54;
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, pageWidth, 180, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(...primaryColor);
    doc.text("Property Inspection Report", margin, 70);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.setTextColor(...darkColor);
    doc.text("Professional survey export", margin, 96);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(title, margin, 128);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(subtitle, margin, 148);
    doc.text(`Survey Date: ${formatDate(survey.survey_date)}`, margin, 168);
    doc.text(`Inspector: ${survey.inspector_name || "—"}`, margin, 186);
    doc.text(`Property Type: ${survey.property_type || "—"}`, margin, 204);

    y = 240;
    addSectionTitle("General Information", y);
    y += 36;
    const generalRows = [
        ["Customer Name", survey.customer_name],
        ["Phone", survey.customer_phone],
        ["Email", survey.customer_email],
        ["Address", survey.property_address],
        ["Inspection Time", survey.inspection_time],
        ["Bedrooms", survey.num_bedrooms],
        ["Bathrooms", survey.num_bathrooms],
        ["Occupancy", survey.occupancy_status],
        ["Overall Condition", survey.overall_condition],
        ["Notes", survey.general_notes]
    ];

    generalRows.forEach(([label, value]) => {
        if (y > pageHeight - 90) {
            doc.addPage();
            y = 50;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...darkColor);
        doc.text(label, margin, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(71, 85, 105);
        const wrapped = doc.splitTextToSize(String(value ?? "—"), pageWidth - margin * 2 - 140);
        doc.text(wrapped, margin + 140, y);
        y += Math.max(16, wrapped.length * 11 + 2);
    });

    y += 8;
    addDivider(y);
    y += 20;

    for (const sectionDef of INSPECTION_SECTIONS) {
        const sectionData = (survey.sections || []).find(sec => sec.section_key === sectionDef.key);
        if (!sectionData) continue;

        if (y > pageHeight - 130) {
            doc.addPage();
            y = 50;
        }

        addSectionTitle(sectionDef.title, y);
        y += 38;

        if (sectionDef.fields.length) {
            const conditions = [];
            sectionDef.fields.forEach(field => {
                const value = sectionData.conditions?.[field] || "—";
                conditions.push([FIELD_LABELS[field] || formatLabel(field), value]);
            });
            conditions.forEach(([label, value]) => {
                if (y > pageHeight - 70) {
                    doc.addPage();
                    y = 50;
                }
                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.setTextColor(...darkColor);
                doc.text(label, margin + 10, y);
                doc.setFont("helvetica", "normal");
                doc.setFontSize(10);
                doc.setTextColor(71, 85, 105);
                doc.text(String(value), margin + 160, y);
                y += 15;
            });
        }

        if (sectionData.comments) {
            if (y > pageHeight - 90) {
                doc.addPage();
                y = 50;
            }
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(...darkColor);
            doc.text("Comments", margin + 10, y);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.setTextColor(71, 85, 105);
            const wrapped = doc.splitTextToSize(sectionData.comments, pageWidth - margin * 2 - 180);
            doc.text(wrapped, margin + 160, y);
            y += wrapped.length * 12 + 6;
        }

        y += 8;
        addDivider(y);
        y += 18;
    }

    const sectionPhotos = (survey.photos || []).filter(p => p.section_key);
    if (sectionPhotos.length) {
        doc.addPage();
        y = 50;
        addSectionTitle("Photographic Evidence", y);
        y += 34;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(71, 85, 105);
        doc.text("Attached photographs are included as dedicated full-page pages for clarity.", margin, y);
        y += 22;

        for (const photo of sectionPhotos) {
            if (!photo.public_url) continue;
            try {
                if (y > pageHeight - 120) {
                    doc.addPage();
                    y = 48;
                }
                doc.addPage();
                doc.setFillColor(248, 250, 252);
                doc.rect(0, 0, pageWidth, pageHeight, "F");
                doc.setFont("helvetica", "bold");
                doc.setFontSize(16);
                doc.setTextColor(...primaryColor);
                doc.text(`${sectionDefTitle(photo.section_key)} Photo`, margin, 46);
                doc.setFont("helvetica", "normal");
                doc.setFontSize(10);
                doc.setTextColor(71, 85, 105);
                doc.text(`Survey: ${title}`, margin, 68);
                doc.text(`Filename: ${photo.file_name || "attachment"}`, margin, 84);

                await addImageToPdf(doc, photo.public_url, margin, 108, pageWidth - margin * 2, pageHeight - 160);
                y = 50;
            } catch (err) {
                console.warn("Could not include photo in PDF", err);
            }
        }
    }

    doc.save(`survey-${survey.id || "report"}.pdf`);
}

async function addImageToPdf(doc, url, x, y, width, height) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const dataUrl = await blobToDataUrl(blob);
        doc.addImage(dataUrl, "JPEG", x, y, width, height, undefined, "FAST");
    } catch (err) {
        console.warn("Image fetch failed", err);
    }
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function sectionDefTitle(sectionKey) {
    return (INSPECTION_SECTIONS.find(item => item.key === sectionKey)?.title || formatLabel(sectionKey));
}

function exportCSV() {
    if (!allSurveys.length) {
        showToast("No surveys to export.", "info");
        return;
    }

    const headers = [
        "ID", "Created At", "Customer Name", "Phone", "Email", "Address",
        "Survey Date", "Inspection Time", "Inspector", "Property Type",
        "Bedrooms", "Bathrooms", "Occupancy", "Overall Condition",
        "Major Issues", "Recommendations", "Photo Count"
    ];

    const rows = allSurveys.map(s => [
        s.id, s.created_at, s.customer_name, s.customer_phone, s.customer_email,
        s.property_address, s.survey_date, s.inspection_time, s.inspector_name,
        s.property_type, s.num_bedrooms, s.num_bathrooms, s.occupancy_status,
        s.overall_condition, s.major_issues, s.recommendations, s.photos.length
    ]);

    const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `surveys-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV exported.", "success");
}

/* ==========================================================================
   UI HELPERS
   ========================================================================== */

function openModal(id) {
    document.getElementById(id).classList.remove("hidden");
    const input = document.getElementById("admin-key-input");
    if (id === "admin-modal" && input) setTimeout(() => input.focus(), 100);
}

function closeModal(id) {
    document.getElementById(id).classList.add("hidden");
}

function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 300ms";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function showLoading(message) {
    const overlay = document.getElementById("loading-overlay");
    document.getElementById("loading-message").textContent = message;
    document.getElementById("progress-container").classList.add("hidden");
    document.getElementById("progress-text").textContent = "";
    overlay.classList.remove("hidden");
}

function showProgress(current, total, message) {
    const overlay = document.getElementById("loading-overlay");
    overlay.classList.remove("hidden");
    document.getElementById("loading-message").textContent = message;
    document.getElementById("progress-container").classList.remove("hidden");
    const pct = Math.round((current / total) * 100);
    document.getElementById("progress-bar").style.width = pct + "%";
    document.getElementById("progress-text").textContent = `${current} / ${total} (${pct}%)`;
}

function hideLoading() {
    document.getElementById("loading-overlay").classList.add("hidden");
}

function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return "—";
    try {
        return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
            year: "numeric", month: "short", day: "numeric"
        });
    } catch { return dateStr; }
}

function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
    setTimeout(init, 0);
}

window.init = init;
window.renderInspectionSections = renderInspectionSections;
window.bindPhotoUploads = bindPhotoUploads;
