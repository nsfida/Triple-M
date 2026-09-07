/* Triplem VIP Live Chat semantic AI — local neural intent understanding.
 *
 * Uses a quantized sentence-transformer in the visitor's browser via
 * Transformers.js. No API key, paid inference endpoint, or private Triplem VIP
 * data is sent to an LLM service. The model only classifies the visitor's own
 * support question into an allowlisted public-product intent; the server remains
 * authoritative for the final grounded answer and all security/handoff policy.
 */
(() => {
  "use strict";

  const LIB_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";
  const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
  const MODEL_REVISION = "main";
  const MAX_CONTEXT_CHARS = 320;

  const INTENT_EXAMPLES = [
    ["overview", "What is Triplem VIP and what is it used for?"],
    ["overview", "How does Triplem VIP work?"],
    ["overview", "What can this software do for me?"],
    ["overview", "What is this for?"],
    ["overview", "What does this do?"],
    ["business_value", "Is Triplem VIP suitable for my business?"],
    ["business_value", "Why should I use Triplem VIP instead of spreadsheets?"],
    ["business_value", "Who is Triplem VIP for?"],
    ["setup", "How do I get started and set up my Triplem VIP workspace?"],
    ["dashboard", "What does the Triplem VIP dashboard show?"],
    ["pricing", "What are the Triplem VIP plans and prices?"],
    ["pricing", "How much is Pro Monthly or Pro Yearly?"],
    ["pricing", "What does the subscription cost?"],
    ["payment_method", "How do I subscribe to a Triplem VIP Pro plan?"],
    ["payment_method", "How can I pay for Pro Monthly or Pro Yearly?"],
    ["payment_method", "Where do I activate or renew my subscription?"],
    ["payment_method", "How do I get the monthly plan?"],
    ["payment_method", "I want Pro Monthly. How can I get it?"],
    ["payment_security", "How is my Pro payment kept safe?"],
    ["payment_security", "What is the security of my payment or receipt?"],
    ["payment_security", "Is the bank transfer and receipt process secure?"],
    ["trial_signup", "How do I start the free trial or create an account?"],
    ["trial_signup", "Can I try Triplem VIP before paying?"],
    ["wallets", "How do wallets, cash accounts and bank balances work?"],
    ["expenses", "How do I record and track expenses or spending?"],
    ["income", "How do I track income or money received?"],
    ["currency", "Does Triplem VIP support multiple currencies?"],
    ["inventory", "Can I manage inventory, stock, products and barcodes?"],
    ["sales", "How do I record product sales and selling activity?"],
    ["customers", "Can I manage customer balances and customer history?"],
    ["invoices", "Can I create invoices and receipts?"],
    ["reports", "What reports, statements and PDF exports are available?"],
    ["loans", "Can I track loans, lending and repayments?"],
    ["installments", "How do installment plans, dues and payment schedules work?"],
    ["assets", "Can I manage assets, depreciation, revenue and disposal?"],
    ["notes", "Can I keep notes and reminders?"],
    ["bitcoin", "What Bitcoin or BTC tools does Triplem VIP have?"],
    ["company_team", "Can my company add team members, staff and permissions?"],
    ["platforms", "Does Triplem VIP work on mobile, iPhone, Android and desktop?"],
    ["personalization", "Can I change themes, branding, logos and appearance?"],
    ["security", "How does Triplem VIP protect privacy and account data?"],
    ["continuity", "What happens offline and what backup or export options exist?"],
    ["demo", "Can I see a demo or walkthrough before signing up?"],
    ["smart_pin", "How does Smart PIN work?"],
    ["import_backup", "Can I import, export or restore my data?"],
    ["support", "When is live support available and how do I contact an agent?"],
    ["founder", "Who created Triplem VIP and who is the founder?"],
  ];

  const ALLOWED_INTENTS = new Set(INTENT_EXAMPLES.map(row => row[0]));
  let extractorPromise = null;
  let prototypePromise = null;
  let browserLanguageModelPromise = null;
  let browserLanguageModelReady = false;
  let lastError = "";
  let ready = false;

  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function clamp01(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  }

  function dot(a, b) {
    const len = Math.min(a?.length || 0, b?.length || 0);
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(a[i] || 0) * Number(b[i] || 0);
    return sum;
  }

  function normalizeRows(output) {
    if (!output) return [];
    const raw = typeof output.tolist === "function" ? output.tolist() : output;
    if (!Array.isArray(raw)) return [];
    if (raw.length && Array.isArray(raw[0]) && raw[0].length && Array.isArray(raw[0][0])) {
      return raw.map(item => item[0]);
    }
    return raw;
  }

  function lexicalBoosts(question) {
    const q = ` ${clean(question).toLowerCase().replace(/[^a-z0-9+./' -]+/g, " ")} `;
    const boosts = new Map();
    const add = (intent, amount) => boosts.set(intent, (boosts.get(intent) || 0) + amount);

    if (/\b(plan|plans|pricing|price|cost|monthly|yearly|annual|subscription fee|how much)\b/.test(q)) add("pricing", 0.14);
    if (/\b(subscribe|subscription|renew|activate pro|upgrade|payment|pay|bank transfer|receipt|get the plan|get a plan|buy the plan|buy a plan|want a monthly|want the monthly|want a yearly|want the yearly|choose monthly|choose yearly)\b/.test(q)) add("payment_method", 0.20);
    if (/\b(payment security|security of (my |the )?payment|safe payment|payment safe|secure payment|receipt security|receipt safe|bank transfer safe|bank transfer secure|protect.*payment)\b/.test(q)) add("payment_security", 0.27);
    if (/\b(free trial|trial|sign up|signup|register|create account|try before)\b/.test(q)) add("trial_signup", 0.16);
    if (/\b(for my business|for business|for a company|suitable|useful|benefit|replace spreadsheet|replace excel|small business|merchant|shop|service business)\b/.test(q)) add("business_value", 0.15);
    if (/\b(what is (it|this|triplem( vip)?) for|what does (it|this|triplem( vip)?) do|what is triplem|how does.*works?|how.*triplem.*works?|what can.*do|what can.*manage|purpose|used for|features?)\b/.test(q)) add("overview", 0.22);
    if (/\b(inventory|stock|product|barcode|brand|variant)\b/.test(q)) add("inventory", 0.14);
    if (/\b(invoices?|receipts?)\b/.test(q)) add("invoices", 0.14);
    if (/\b(wallet|cash account|bank account|balance)\b/.test(q)) add("wallets", 0.13);
    if (/\b(expense|spending|transaction history)\b/.test(q)) add("expenses", 0.13);
    if (/\b(report|statement|pdf|export)\b/.test(q)) add("reports", 0.12);
    if (/\b(loan|repayment|borrow|lend)\b/.test(q)) add("loans", 0.13);
    if (/\b(installment|instalment|payment schedule|due)\b/.test(q)) add("installments", 0.13);
    if (/\b(asset|depreciation|property|vehicle|equipment)\b/.test(q)) add("assets", 0.13);
    if (/\b(team|staff|employee|permission|company workspace)\b/.test(q)) add("company_team", 0.12);
    if (/\b(security|privacy|safe|protect.*data)\b/.test(q)) add("security", 0.12);
    if (/\b(demo|walkthrough|preview)\b/.test(q)) add("demo", 0.12);
    if (/\b(mobile|iphone|android|desktop|browser|tablet)\b/.test(q)) add("platforms", 0.11);

    return boosts;
  }

  function fallbackAnalysis(question, messages = []) {
    const contextual = lexicalBoosts(question);
    const q = clean(question).toLowerCase();
    const context = recentVisitorContext(messages).toLowerCase();
    const add = (intent, amount) => contextual.set(intent, (contextual.get(intent) || 0) + amount);
    if (/^(are you sure|sure|really|is that right|is that correct|correct|right)[ ?!.]*$/.test(q)) {
      if (/payment|receipt|bank transfer|security/.test(context)) add("payment_security", 0.24);
      else if (/monthly|yearly|price|aed|sar|pkr|usd|plan/.test(context)) add("pricing", 0.22);
    }
    if (/^(aed|sar|pkr|usd)\s*[0-9,.]+[ ?!.]*$/i.test(clean(question))) {
      if (/monthly|yearly|price|plan|subscription/.test(context)) add("pricing", 0.24);
    }
    if (/^(what is (this|it) for|what does (this|it) do)[ ?!.]*$/.test(q)) add("overview", 0.20);
    const boosts = [...contextual.entries()]
      .filter(([intent]) => ALLOWED_INTENTS.has(intent))
      .sort((a, b) => b[1] - a[1]);
    const intents = boosts.slice(0, 3).map(([intent, score], index) => ({
      intent,
      score: Math.min(0.79, 0.53 + score - index * 0.035),
    }));
    return {
      engine: "grounded_fallback",
      model: null,
      neural: false,
      confidence: intents[0]?.score || 0,
      intents,
      question_kind: detectQuestionKind(question),
    };
  }

  function detectQuestionKind(question) {
    const q = clean(question).toLowerCase();
    if (/^(are you sure|sure|really|is that right|is that correct|correct|right)[ ?!.]*$/.test(q) || /^(aed|sar|pkr|usd)\s*[0-9,.]+[ ?!.]*$/i.test(clean(question))) return "confirmation";
    if (/\b(how do i|how can i|how to|steps|set up|setup|get started|subscribe|renew|get (the |a )?plan|buy (the |a )?plan)\b/.test(q)) return "howto";
    if (/\b(how much|price|pricing|cost|monthly|yearly|annual)\b/.test(q)) return "pricing";
    if (/\b(can i|can we|does it|do you have|is there|support)\b/.test(q)) return "capability";
    if (/\b(why|benefit|worth|suitable|good for|fit)\b/.test(q)) return "benefit";
    if (/\b(what is|what does|what are|explain|tell me about|what is it for)\b/.test(q)) return "explain";
    return "direct";
  }

  function browserLanguageModelOptions() {
    return {
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    };
  }

  function extractJsonObject(value) {
    const text = clean(value);
    if (!text) return null;
    const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(unfenced.slice(start, end + 1)); } catch (_) { return null; }
  }

  async function getBrowserLanguageModel() {
    const LM = typeof globalThis !== "undefined" ? globalThis.LanguageModel : null;
    if (!LM || typeof LM.availability !== "function" || typeof LM.create !== "function") return null;
    if (browserLanguageModelPromise) return browserLanguageModelPromise;
    browserLanguageModelPromise = (async () => {
      try {
        const options = browserLanguageModelOptions();
        const availability = await LM.availability(options);
        // Never trigger a multi-hundred-MB browser model download merely because
        // somebody opened support. Use the built-in model only when already ready.
        if (availability !== "available") return null;
        const session = await LM.create({
          ...options,
          initialPrompts: [{
            role: "system",
            content: "You are a private on-device intent parser for Triplem VIP Live Support. Never answer the visitor. Return JSON only. Choose up to two intents from the supplied allowlist and infer question_kind, plan_period and currency. Do not invent product facts, credentials, private data, security internals or capabilities."
          }],
        });
        browserLanguageModelReady = Boolean(session);
        return session;
      } catch (error) {
        browserLanguageModelReady = false;
        browserLanguageModelPromise = null;
        return null;
      }
    })();
    return browserLanguageModelPromise;
  }

  async function analyzeWithBrowserLanguageModel(question, messages) {
    const session = await getBrowserLanguageModel();
    if (!session || typeof session.prompt !== "function") return null;
    const context = recentVisitorContext(messages);
    const allowlist = [...ALLOWED_INTENTS].join(", ");
    const prompt = [
      `Allowed intents: ${allowlist}.`,
      `Recent visitor context: ${context || "none"}.`,
      `Current visitor message: ${clean(question)}.`,
      'Return exactly one JSON object: {"intents":[{"intent":"...","score":0.0}],"question_kind":"explain|howto|pricing|capability|benefit|confirmation|direct","plan_period":"monthly|yearly|unknown","currency":"AED|SAR|PKR|USD|unknown","confidence":0.0}.',
      "Interpret pronouns and short confirmations from recent context. A request to get, buy, choose or activate a plan is payment_method, not merely pricing. Payment safety or receipt safety is payment_security."
    ].join("\n");
    const result = await session.prompt(prompt);
    const parsed = extractJsonObject(result);
    if (!parsed || !Array.isArray(parsed.intents)) return null;
    const intents = parsed.intents
      .map(row => ({ intent: clean(row?.intent).toLowerCase(), score: clamp01(row?.score) }))
      .filter(row => ALLOWED_INTENTS.has(row.intent))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    if (!intents.length) return null;
    const plan = ["monthly", "yearly"].includes(clean(parsed.plan_period).toLowerCase()) ? clean(parsed.plan_period).toLowerCase() : "unknown";
    const currency = ["AED", "SAR", "PKR", "USD"].includes(clean(parsed.currency).toUpperCase()) ? clean(parsed.currency).toUpperCase() : "unknown";
    return {
      engine: "browser_language_model",
      model: "browser-provided-on-device",
      neural: true,
      confidence: clamp01(parsed.confidence || intents[0].score || 0.8),
      intents,
      question_kind: clean(parsed.question_kind) || detectQuestionKind(question),
      plan_period: plan,
      currency,
    };
  }

  async function getExtractor() {
    if (extractorPromise) return extractorPromise;
    extractorPromise = (async () => {
      try {
        const mod = await import(LIB_URL);
        if (!mod?.pipeline) throw new Error("Transformers.js pipeline unavailable");
        if (mod.env) {
          mod.env.allowLocalModels = false;
          mod.env.useBrowserCache = true;
        }
        let pipe;
        try {
          pipe = await mod.pipeline("feature-extraction", MODEL_ID, {
            revision: MODEL_REVISION,
            dtype: "q8",
          });
        } catch (_) {
          pipe = await mod.pipeline("feature-extraction", MODEL_ID, {
            revision: MODEL_REVISION,
          });
        }
        return pipe;
      } catch (error) {
        lastError = clean(error?.message || error || "Local semantic AI unavailable").slice(0, 180);
        extractorPromise = null;
        throw error;
      }
    })();
    return extractorPromise;
  }

  async function getPrototypeVectors() {
    if (prototypePromise) return prototypePromise;
    prototypePromise = (async () => {
      const extractor = await getExtractor();
      const text = INTENT_EXAMPLES.map(row => row[1]);
      const output = await extractor(text, { pooling: "mean", normalize: true });
      const vectors = normalizeRows(output);
      if (vectors.length !== INTENT_EXAMPLES.length) throw new Error("Semantic prototype shape mismatch");
      ready = true;
      return vectors;
    })().catch(error => {
      prototypePromise = null;
      ready = false;
      throw error;
    });
    return prototypePromise;
  }

  function recentVisitorContext(messages) {
    const rows = Array.isArray(messages) ? messages : [];
    const texts = rows
      .filter(m => String(m?.sender_role || "") !== "admin")
      .map(m => clean(m?.body))
      .filter(Boolean)
      .slice(-3, -1);
    return clean(texts.join(" | ")).slice(-MAX_CONTEXT_CHARS);
  }

  function buildSemanticInput(question, messages) {
    const current = clean(question);
    if (!current) return "";
    const followup = current.length < 90 || /^(and|also|what about|how about|that|it|this|why|how|yes|no)\b/i.test(current);
    const context = followup ? recentVisitorContext(messages) : "";
    return context ? `Previous visitor context: ${context}. Current question: ${current}` : current;
  }

  async function analyze(question, messages = []) {
    const current = clean(question);
    if (!current) return fallbackAnalysis(current, messages);
    const fallback = fallbackAnalysis(current, messages);
    try {
      const browserResult = await Promise.race([
        analyzeWithBrowserLanguageModel(current, messages),
        new Promise(resolve => setTimeout(() => resolve(null), 1600))
      ]);
      if (browserResult) return browserResult;
    } catch (_) {}
    try {
      const [extractor, prototypes] = await Promise.all([getExtractor(), getPrototypeVectors()]);
      const semanticInput = buildSemanticInput(current, messages);
      const output = await extractor(semanticInput, { pooling: "mean", normalize: true });
      const rows = normalizeRows(output);
      const queryVector = Array.isArray(rows[0]) ? rows[0] : rows;
      if (!Array.isArray(queryVector) || !queryVector.length) throw new Error("Semantic query shape mismatch");

      const lexical = lexicalBoosts(current);
      const byIntent = new Map();
      INTENT_EXAMPLES.forEach(([intent], index) => {
        const base = clamp01(dot(queryVector, prototypes[index]));
        const adjusted = clamp01(base + (lexical.get(intent) || 0));
        const prior = byIntent.get(intent) || 0;
        if (adjusted > prior) byIntent.set(intent, adjusted);
      });

      const ranked = [...byIntent.entries()]
        .map(([intent, score]) => ({ intent, score: Number(score.toFixed(4)) }))
        .sort((a, b) => b.score - a.score);

      const top = ranked[0]?.score || 0;
      const second = ranked[1]?.score || 0;
      const keep = ranked.filter((row, index) => {
        if (index === 0) return row.score >= 0.34;
        if (index === 1) return row.score >= 0.42 && row.score >= top - 0.105;
        return row.score >= 0.50 && row.score >= top - 0.075;
      }).slice(0, 3);

      const confidence = clamp01(top * 0.88 + Math.max(0, top - second) * 0.55);
      return {
        engine: "transformers_js_minilm",
        model: MODEL_ID,
        neural: true,
        confidence: Number(Math.max(top, confidence).toFixed(4)),
        intents: keep.length ? keep : fallback.intents,
        question_kind: detectQuestionKind(current),
      };
    } catch (_) {
      return fallback;
    }
  }

  async function warmup() {
    const browserPromise = getBrowserLanguageModel().catch(() => null);
    try {
      await getPrototypeVectors();
      await browserPromise;
      return { ok: true, ready: true, engine: browserLanguageModelReady ? "browser_language_model+transformers_js_minilm" : "transformers_js_minilm", model: MODEL_ID };
    } catch (_) {
      await browserPromise;
      return { ok: browserLanguageModelReady, ready: browserLanguageModelReady, engine: browserLanguageModelReady ? "browser_language_model" : "grounded_fallback", error: lastError };
    }
  }

  window.TriplemLiveChatAI = Object.freeze({
    analyze,
    fallbackAnalyze: fallbackAnalysis,
    warmup,
    getStatus: () => ({ ready: ready || browserLanguageModelReady, browser_language_model: browserLanguageModelReady, loading: Boolean(extractorPromise || prototypePromise || browserLanguageModelPromise) && !(ready || browserLanguageModelReady), error: lastError, model: MODEL_ID }),
  });
})();
