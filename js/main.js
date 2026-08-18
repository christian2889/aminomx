/* ==========================================================================
   Aminos MX — Lógica (rediseño Kimi)
   Catálogo bilingüe data-driven, filtros/búsqueda, quick-view, carrito con
   cajón + progreso de envío gratis + toasts, verificación de COA. Sin deps.
   ========================================================================== */
(function () {
  "use strict";
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var LS = window.localStorage;

  var FREE_SHIPPING = 2500, SHIPPING_COST = 189;

  /* -------------------- Datos -------------------- */
  var CATEGORIES = [
    { id: "todos",         es: "Todos",                 en: "All",                 icon: "i-flame" },
    { id: "perdida-peso",  es: "Pérdida de peso",       en: "Weight loss",         icon: "i-trending-down" },
    { id: "recomposicion", es: "Recomposición corporal",en: "Body recomposition",  icon: "i-zap" },
    { id: "metabolicos",   es: "Metabólicos",           en: "Metabolic",           icon: "i-heart-pulse" },
    { id: "regenerativos", es: "Regenerativos",         en: "Regenerative",        icon: "i-syringe" },
    { id: "anti-edad",     es: "Anti-edad",             en: "Anti-aging",          icon: "i-sparkles" },
    { id: "aminoacidos",   es: "Aminoácidos",           en: "Amino acids",         icon: "i-flame" }
  ];

  var P = function (id, name, cat, price, compareAt, purity, presEs, presEn, descEs, descEn, tagsEs, tagsEn, stock, flags) {
    flags = flags || {};
    return { id: id, name: name, category: cat, price: price, compareAt: compareAt || 0, purity: purity,
      presEs: presEs, presEn: presEn, descEs: descEs, descEn: descEn, tagsEs: tagsEs, tagsEn: tagsEn,
      stock: stock, bestseller: !!flags.b, isNew: !!flags.n };
  };

  var PRODUCTS = [
    // Pérdida de peso
    P("semaglutide-5","Semaglutide","perdida-peso",1890,2290,"≥99%","Vial liofilizado 5 mg","Lyophilized vial 5 mg",
      "Análogo GLP-1 estudiado en investigación sobre control de apetito, sensación de saciedad y manejo de peso. Incluye certificado de análisis (COA) por lote.",
      "GLP-1 analog studied in research on appetite control, satiety and weight management. Includes a certificate of analysis (COA) per batch.",
      ["GLP-1","Saciedad","Control de apetito"],["GLP-1","Satiety","Appetite control"],34,{b:1}),
    P("tirzepatide-10","Tirzepatide","perdida-peso",2490,2990,"≥99%","Vial liofilizado 10 mg","Lyophilized vial 10 mg",
      "Agonista dual GIP/GLP-1 de referencia en estudios de reducción de peso y salud metabólica. Liofilizado con pureza verificada por HPLC.",
      "Dual GIP/GLP-1 agonist, a reference in weight-reduction and metabolic-health studies. Lyophilized with HPLC-verified purity.",
      ["GIP/GLP-1","Pérdida de peso","Metabolismo"],["GIP/GLP-1","Weight loss","Metabolism"],27,{b:1}),
    P("retatrutide-10","Retatrutide","perdida-peso",3290,0,"≥99%","Vial liofilizado 10 mg","Lyophilized vial 10 mg",
      "Agonista triple GIP/GLP-1/Glucagón. Compuesto de nueva generación en investigación metabólica y de composición corporal.",
      "Triple GIP/GLP-1/Glucagon agonist. A next-generation compound in metabolic and body-composition research.",
      ["Triple agonista","Nueva generación"],["Triple agonist","Next generation"],15,{n:1}),
    P("cagrilintide-5","Cagrilintide","perdida-peso",2890,0,"≥99%","Vial liofilizado 5 mg","Lyophilized vial 5 mg",
      "Análogo de amilina estudiado en combinación con GLP-1 para investigación de saciedad y control glucémico.",
      "Amylin analog studied in combination with GLP-1 for satiety and glycemic-control research.",
      ["Amilina","Saciedad"],["Amylin","Satiety"],12),
    P("aod9604-5","AOD-9604","perdida-peso",1490,1790,"≥99%","Vial liofilizado 5 mg","Lyophilized vial 5 mg",
      "Fragmento modificado de hGH estudiado en investigación de lipólisis y metabolismo de grasas sin efecto en IGF-1.",
      "Modified hGH fragment studied in lipolysis and fat-metabolism research without an effect on IGF-1.",
      ["Lipólisis","Metabolismo de grasas"],["Lipolysis","Fat metabolism"],41),
    // Recomposición
    P("ipamorelin-5","Ipamorelin","recomposicion",1390,1690,"≥99%","Vial liofilizado 5 mg","Lyophilized vial 5 mg",
      "Secretagogo de GH altamente selectivo. Referencia en estudios de masa magra, recuperación y calidad del sueño.",
      "Highly selective GH secretagogue. A reference in lean-mass, recovery and sleep-quality studies.",
      ["GHRP","Masa magra","Recuperación"],["GHRP","Lean mass","Recovery"],48,{b:1}),
    P("cjc1295-nodac-5","CJC-1295 sin DAC","recomposicion",1490,0,"≥99%","Vial liofilizado 5 mg","Lyophilized vial 5 mg",
      "GHRH modificado de vida media corta. Se estudia comúnmente en sinergia con Ipamorelin para pulsos naturales de GH.",
      "Modified short-half-life GHRH. Commonly studied in synergy with Ipamorelin for natural GH pulses.",
      ["GHRH","Sinergia con Ipamorelin"],["GHRH","Ipamorelin synergy"],39),
    P("tesamorelin-5","Tesamorelin","recomposicion",2790,0,"≥99%","Vial liofilizado 5 mg","Lyophilized vial 5 mg",
      "GHRH estudiado en investigación sobre grasa visceral, cognición y composición corporal.",
      "GHRH studied in research on visceral fat, cognition and body composition.",
      ["GHRH","Grasa visceral"],["GHRH","Visceral fat"],9,{n:1}),
    P("mk677-10","MK-677 (Ibutamoren)","recomposicion",1590,1890,"≥99%","Vial liofilizado 10 mg","Lyophilized vial 10 mg",
      "Secretagogo oral de GH estudiado en investigación de densidad ósea, masa magra y sueño profundo.",
      "Oral GH secretagogue studied in research on bone density, lean mass and deep sleep.",
      ["Secretagogo","Densidad ósea"],["Secretagogue","Bone density"],52),
    P("igf1lr3-1","IGF-1 LR3","recomposicion",3190,0,"≥99%","Vial liofilizado 1 mg","Lyophilized vial 1 mg",
      "Análogo de IGF-1 de vida media prolongada. Referencia en estudios de hipertrofia e hiperplasia muscular.",
      "Long-half-life IGF-1 analog. A reference in muscle hypertrophy and hyperplasia studies.",
      ["IGF-1","Hipertrofia"],["IGF-1","Hypertrophy"],7),
    // Metabólicos
    P("motsc-10","MOTS-c","metabolicos",1890,2190,"≥99%","Vial liofilizado 10 mg","Lyophilized vial 10 mg",
      "Péptido mitocondrial estudiado en investigación de sensibilidad a la insulina, ejercicio y envejecimiento metabólico.",
      "Mitochondrial peptide studied in research on insulin sensitivity, exercise and metabolic aging.",
      ["Mitocondrial","Sensibilidad insulínica"],["Mitochondrial","Insulin sensitivity"],23,{b:1}),
    P("5amino1mq-50","5-Amino-1MQ","metabolicos",1690,0,"≥99%","Vial liofilizado 50 mg","Lyophilized vial 50 mg",
      "Inhibidor de NNMT estudiado en investigación de metabolismo celular, energía y composición corporal.",
      "NNMT inhibitor studied in research on cellular metabolism, energy and body composition.",
      ["NNMT","Energía celular"],["NNMT","Cellular energy"],31),
    P("aicar-50","AICAR","metabolicos",1990,0,"≥99%","Vial liofilizado 50 mg","Lyophilized vial 50 mg",
      "Activador de AMPK de referencia en estudios de resistencia metabólica y metabolismo energético.",
      "AMPK activator, a reference in metabolic-endurance and energy-metabolism studies.",
      ["AMPK","Resistencia metabólica"],["AMPK","Metabolic endurance"],18),
    // Regenerativos
    P("bpc157-5","BPC-157","regenerativos",1290,1590,"≥99%","Vial liofilizado 5 mg","Lyophilized vial 5 mg",
      "Péptido de protección corporal derivado de proteína gástrica. El más estudiado en investigación de reparación de tejidos, tendones y mucosa gastrointestinal.",
      "Body-protection peptide derived from gastric protein. The most studied in research on tissue, tendon and gastrointestinal-mucosa repair.",
      ["Reparación","Tejidos","GI"],["Repair","Tissues","GI"],64,{b:1}),
    P("tb500-5","TB-500","regenerativos",1390,0,"≥99%","Vial liofilizado 5 mg","Lyophilized vial 5 mg",
      "Fragmento de Timosina Beta-4 estudiado en investigación de cicatrización, flexibilidad y recuperación muscular.",
      "Thymosin Beta-4 fragment studied in research on wound healing, flexibility and muscle recovery.",
      ["Tβ4","Cicatrización","Flexibilidad"],["Tβ4","Healing","Flexibility"],57,{b:1}),
    P("ghkcu-50","GHK-Cu","regenerativos",1590,1890,"≥99%","Vial liofilizado 50 mg","Lyophilized vial 50 mg",
      "Tripéptido de cobre estudiado en investigación de colágeno, piel, cabello y procesos de remodelación tisular.",
      "Copper tripeptide studied in research on collagen, skin, hair and tissue-remodeling processes.",
      ["Colágeno","Piel","Cobre"],["Collagen","Skin","Copper"],44,{b:1}),
    P("kpv-10","KPV","regenerativos",1490,0,"≥99%","Vial liofilizado 10 mg","Lyophilized vial 10 mg",
      "Tripéptido derivado de α-MSH estudiado en investigación de inflamación intestinal y procesos inmunomoduladores.",
      "α-MSH-derived tripeptide studied in research on intestinal inflammation and immunomodulatory processes.",
      ["Antiinflamatorio","Inmunomodulador"],["Anti-inflammatory","Immunomodulator"],26),
    P("wolverine-blend","Blend BPC-157 + TB-500","regenerativos",2390,2680,"≥99%","Vial liofilizado 5 mg + 5 mg","Lyophilized vial 5 mg + 5 mg",
      "Combinación “Wolverine” de los dos péptidos regenerativos más estudiados, en un solo vial liofilizado.",
      "“Wolverine” combination of the two most-studied regenerative peptides in a single lyophilized vial.",
      ["Combo","Recuperación avanzada"],["Combo","Advanced recovery"],21,{n:1}),
    // Anti-edad
    P("epitalon-10","Epitalon","anti-edad",1690,0,"≥99%","Vial liofilizado 10 mg","Lyophilized vial 10 mg",
      "Tetrapéptido estudiado en investigación de telomerasa, ritmos circadianos y biogerontología.",
      "Tetrapeptide studied in research on telomerase, circadian rhythms and biogerontology.",
      ["Telomerasa","Longevidad"],["Telomerase","Longevity"],19),
    P("nad500","NAD+","anti-edad",1890,2290,"≥99%","Vial liofilizado 500 mg","Lyophilized vial 500 mg",
      "Coenzima esencial estudiada en investigación de energía mitocondrial, sirtuinas y salud celular.",
      "Essential coenzyme studied in research on mitochondrial energy, sirtuins and cellular health.",
      ["Coenzima","Mitocondria","Energía"],["Coenzyme","Mitochondria","Energy"],33,{b:1}),
    P("thymalin-20","Thymalin","anti-edad",1790,0,"≥99%","Vial liofilizado 20 mg","Lyophilized vial 20 mg",
      "Complejo timótico estudiado en investigación de inmunorregulación y envejecimiento del sistema inmune.",
      "Thymic complex studied in research on immunoregulation and immune-system aging.",
      ["Inmunidad","Timo"],["Immunity","Thymus"],14),
    // Aminoácidos
    P("lcarnitina-500","L-Carnitina","aminoacidos",690,890,"Grado USP","Frasco 500 mg/mL × 10 mL","Bottle 500 mg/mL × 10 mL",
      "Aminoácido esencial en el transporte de ácidos grasos a la mitocondria. Formato inyectable de grado USP.",
      "Essential amino acid in the transport of fatty acids to the mitochondria. USP-grade injectable format.",
      ["Metabolismo de grasas","Energía"],["Fat metabolism","Energy"],70),
    P("glutamina-200","L-Glutamina","aminoacidos",590,0,"Grado USP","Frasco 200 mg/mL × 30 mL","Bottle 200 mg/mL × 30 mL",
      "El aminoácido más abundante del organismo. Apoyo en recuperación muscular y salud intestinal.",
      "The most abundant amino acid in the body. Support for muscle recovery and gut health.",
      ["Recuperación","Intestino"],["Recovery","Gut"],82),
    P("bcaa-blend","BCAA 2:1:1","aminoacidos",790,950,"Grado USP","Frasco × 30 mL","Bottle × 30 mL",
      "Leucina, isoleucina y valina en proporción 2:1:1. Base de suplementación para síntesis proteica.",
      "Leucine, isoleucine and valine in a 2:1:1 ratio. A supplementation base for protein synthesis.",
      ["Síntesis proteica","Base"],["Protein synthesis","Base"],55)
  ];

  var byId = {};
  PRODUCTS.forEach(function (p) { byId[p.id] = p; });

  /* -------------------- Estado -------------------- */
  var state = {
    lang: (LS && LS.getItem("amx_lang")) || "es",
    cat: "todos",
    q: "",
    cart: []
  };
  try { state.cart = JSON.parse(LS.getItem("amx_cart")) || []; } catch (e) { state.cart = []; }

  var T = function (es, en) { return state.lang === "en" ? en : es; };
  var fmt = function (n) { return "$" + Number(n).toLocaleString("en-US"); };
  var catLabel = function (id) { var c = CATEGORIES.filter(function (x) { return x.id === id; })[0]; return c ? T(c.es, c.en) : id; };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function hashHue(id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997; return h % 14; }
  function purityShort(p) { var m = p.match(/\d+/); return m ? m[0] + "%" : "USP"; }

  function vialSVG(purityText) {
    return '<svg class="vial-svg" width="60" height="76" viewBox="0 0 64 80" fill="none" aria-hidden="true">' +
      '<rect x="22" y="4" width="20" height="10" rx="2" fill="hsl(174 84% 45% / .9)"/>' +
      '<rect x="24" y="14" width="16" height="6" fill="hsl(215 25% 30%)"/>' +
      '<path d="M20 20h24v6c0 2-2 4-2 6v34a10 10 0 0 1-10 10 10 10 0 0 1-10-10V32c0-2-2-4-2-6v-6Z" fill="hsl(215 30% 18%)" stroke="hsl(174 84% 45% / .6)" stroke-width="1.5"/>' +
      '<path d="M23 46h18v20a9 9 0 0 1-9 9 9 9 0 0 1-9-9V46Z" fill="hsl(174 84% 45% / .28)"/>' +
      '<rect x="25" y="28" width="14" height="14" rx="2" fill="hsl(215 35% 8%)" stroke="hsl(215 25% 28%)"/>' +
      '<text x="32" y="38" text-anchor="middle" font-size="6" font-weight="700" fill="hsl(174 84% 55%)" font-family="monospace">' + purityText + '</text></svg>';
  }
  function icon(id, cls) { return '<svg class="ico ' + (cls || "") + '"><use href="#' + id + '"/></svg>'; }

  /* -------------------- Idioma -------------------- */
  function applyLang() {
    var en = state.lang === "en";
    $$("[data-en]").forEach(function (n) {
      if (n.dataset.es === undefined) n.dataset.es = n.textContent;
      var next = en ? n.dataset.en : n.dataset.es;
      if (n.textContent !== next) n.textContent = next;
    });
    $$("[data-en-ph]").forEach(function (n) {
      if (n.dataset.esPh === undefined) n.dataset.esPh = n.getAttribute("placeholder") || "";
      n.setAttribute("placeholder", en ? n.dataset.enPh : n.dataset.esPh);
    });
    document.documentElement.lang = en ? "en" : "es-MX";
    $$("[data-lang]").forEach(function (b) { b.classList.toggle("active", b.dataset.lang === state.lang); });
  }
  function setLang(l) {
    state.lang = l; if (LS) LS.setItem("amx_lang", l);
    applyLang(); renderCats(); renderFilters(); renderGrid(); renderCart();
  }

  /* -------------------- Categorías -------------------- */
  function renderCats() {
    var box = $("[data-cats]"); if (!box) return;
    box.innerHTML = CATEGORIES.filter(function (c) { return c.id !== "todos"; }).map(function (c) {
      var count = PRODUCTS.filter(function (p) { return p.category === c.id; }).length;
      return '<button class="cat" data-gocat="' + c.id + '">' +
        '<span class="tile">' + icon(c.icon) + '</span>' +
        '<span class="cname">' + esc(T(c.es, c.en)) + '</span>' +
        '<span class="ccount">' + count + ' ' + T("productos", "products") + '</span></button>';
    }).join("");
  }

  /* -------------------- Filtros -------------------- */
  function renderFilters() {
    var box = $("[data-filters]"); if (!box) return;
    box.innerHTML = CATEGORIES.map(function (c) {
      return '<button class="filter' + (state.cat === c.id ? " active" : "") + '" data-filter="' + c.id + '">' + esc(T(c.es, c.en)) + "</button>";
    }).join("");
  }

  /* -------------------- Grid -------------------- */
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return PRODUCTS.filter(function (p) {
      var mc = state.cat === "todos" || p.category === state.cat;
      var tags = p.tagsEs.concat(p.tagsEn).join(" ").toLowerCase();
      var mq = !q || p.name.toLowerCase().indexOf(q) >= 0 || tags.indexOf(q) >= 0 ||
        (T(p.descEs, p.descEn)).toLowerCase().indexOf(q) >= 0;
      return mc && mq;
    });
  }

  function productCard(p) {
    var tags = (state.lang === "en" ? p.tagsEn : p.tagsEs).slice(0, 3).map(function (t) {
      return '<span class="ptag">' + esc(t) + "</span>";
    }).join("");
    var badges = "";
    if (p.bestseller) badges += '<span class="badge badge-amber">' + icon("i-flame") + T("Más vendido", "Best seller") + "</span>";
    if (p.isNew) badges += '<span class="badge badge-sky">' + icon("i-sparkles") + T("Nuevo", "New") + "</span>";
    var bg = "linear-gradient(135deg, hsl(215 40% " + (10 + hashHue(p.id)) + "%) 0%, hsl(199 60% 12%) 100%)";
    var low = p.stock <= 10;
    var stock = low
      ? '<span class="pcard-stock low">' + icon("i-package") + T("¡Últimas " + p.stock + " piezas!", "Only " + p.stock + " left!") + "</span>"
      : '<span class="pcard-stock">' + icon("i-package") + p.stock + " " + T("piezas disponibles", "in stock") + "</span>";
    return '<article class="pcard" data-card="' + p.id + '">' +
      '<button class="pcard-media" data-view="' + p.id + '" aria-label="' + esc(p.name) + '">' +
        '<span class="bgfill" style="background:' + bg + '"></span>' +
        '<span class="molecule-bg"></span>' +
        '<span class="vial">' + vialSVG(purityShort(p.purity)) + "</span>" +
        '<span class="tl">' + badges + "</span>" +
        '<span class="tr"><span class="badge badge-purity">' + T("Pureza ", "Purity ") + esc(p.purity) + "</span></span>" +
      "</button>" +
      '<div class="pcard-body">' +
        '<p class="pcard-kicker">' + esc(catLabel(p.category)) + " · " + esc(T(p.presEs, p.presEn)) + "</p>" +
        '<button class="pcard-name" data-view="' + p.id + '">' + esc(p.name) + "</button>" +
        '<div class="pcard-tags">' + tags + "</div>" +
        '<div class="pcard-foot">' +
          '<div class="pcard-price">' + (p.compareAt ? '<div class="compare">' + fmt(p.compareAt) + "</div>" : "") +
            '<div class="amt">' + fmt(p.price) + "</div></div>" +
          '<button class="btn btn-primary btn-sm" data-add="' + p.id + '">' + icon("i-cart") + T("Agregar", "Add") + "</button>" +
        "</div>" + stock +
      "</div></article>";
  }

  function renderGrid() {
    var grid = $("[data-grid]"), empty = $("[data-empty]");
    if (!grid) return;
    var list = filtered();
    if (!list.length) {
      grid.innerHTML = "";
      if (empty) { empty.hidden = false; empty.textContent = T('No encontramos productos para “' + state.q + '”. Intenta con otro término.', 'No products found for “' + state.q + '”. Try another term.'); }
      return;
    }
    if (empty) empty.hidden = true;
    grid.innerHTML = list.map(productCard).join("");
  }

  /* -------------------- Quick-view modal -------------------- */
  var modal = $("[data-modal]");
  function openModal(id) {
    var p = byId[id]; if (!p || !modal) return;
    $("[data-modal-name]").textContent = p.name;
    $("[data-modal-meta]").textContent = T(p.presEs, p.presEn) + " · " + T("Pureza ", "Purity ") + p.purity + " · " + catLabel(p.category);
    $("[data-modal-desc]").textContent = T(p.descEs, p.descEn);
    $("[data-modal-tags]").innerHTML = (state.lang === "en" ? p.tagsEn : p.tagsEs).map(function (t) { return '<span class="badge">' + esc(t) + "</span>"; }).join("");
    $("[data-modal-price]").textContent = fmt(p.price);
    $("[data-modal-compare]").textContent = p.compareAt ? fmt(p.compareAt) : "";
    $("[data-modal-add]").setAttribute("data-add-modal", p.id);
    modal.classList.add("show"); modal.setAttribute("aria-hidden", "false");
  }
  function closeModal() { if (modal) { modal.classList.remove("show"); modal.setAttribute("aria-hidden", "true"); } }

  /* -------------------- Carrito -------------------- */
  var drawer = $("[data-drawer]"), overlay = $("[data-overlay]");
  function saveCart() { if (LS) LS.setItem("amx_cart", JSON.stringify(state.cart)); }
  function cartCount() { return state.cart.reduce(function (s, i) { return s + i.qty; }, 0); }
  function cartSubtotal() { return state.cart.reduce(function (s, i) { var p = byId[i.id]; return p ? s + p.price * i.qty : s; }, 0); }

  function addToCart(id, qty) {
    qty = qty || 1;
    var it = state.cart.filter(function (i) { return i.id === id; })[0];
    if (it) it.qty = Math.min(it.qty + qty, 20);
    else state.cart.push({ id: id, qty: qty });
    saveCart(); renderCart();
    var p = byId[id];
    toast(T((p ? p.name : "Producto") + " agregado al carrito", (p ? p.name : "Product") + " added to cart"));
  }
  function setQty(id, qty) {
    if (qty <= 0) { state.cart = state.cart.filter(function (i) { return i.id !== id; }); }
    else { var it = state.cart.filter(function (i) { return i.id === id; })[0]; if (it) it.qty = Math.min(qty, 20); }
    saveCart(); renderCart();
  }

  function renderCart() {
    var count = cartCount();
    $$("[data-cart-count]").forEach(function (el) { el.textContent = count; el.setAttribute("data-empty", count === 0 ? "true" : "false"); });

    var sub = cartSubtotal();
    var shipping = (sub === 0 || sub >= FREE_SHIPPING) ? 0 : SHIPPING_COST;
    var n = state.cart.length;
    var subEl = $("[data-cart-sub]");
    if (subEl) subEl.textContent = n === 0 ? T("Aún no tienes productos.", "No products yet.")
      : (n + " " + T(n === 1 ? "producto en tu pedido." : "productos en tu pedido.", n === 1 ? "product in your order." : "products in your order."));

    var wrap = $("[data-ship-wrap]"), foot = $("[data-drawer-foot]");
    if (wrap) wrap.hidden = n === 0;
    if (foot) foot.hidden = n === 0;

    var bar = $("[data-ship-bar]"), msg = $("[data-ship-msg]");
    if (bar) bar.style.width = Math.min(100, (sub / FREE_SHIPPING) * 100) + "%";
    if (msg) {
      var missing = Math.max(0, FREE_SHIPPING - sub);
      msg.innerHTML = icon("i-snowflake") + (missing > 0
        ? T("Te faltan <b>" + fmt(missing) + "</b> para envío gratis", "You're <b>" + fmt(missing) + "</b> away from free shipping")
        : "<b>" + T("¡Tienes envío refrigerado gratis!", "You have free refrigerated shipping!") + "</b>");
    }

    var box = $("[data-drawer-items]");
    if (box) {
      if (!n) {
        box.innerHTML = '<div class="drawer-empty"><div class="circle">' + icon("i-bag") + "</div><p>" +
          T("Explora el catálogo y agrega tus primeros péptidos.", "Explore the catalog and add your first peptides.") +
          '</p><a class="btn btn-outline" href="#catalogo" data-close-cart>' + T("Ver catálogo", "View catalog") + "</a></div>";
      } else {
        box.innerHTML = state.cart.map(function (i) {
          var p = byId[i.id]; if (!p) return "";
          return '<div class="citem"><div class="thumb">🧪</div><div class="main">' +
            '<div class="cname">' + esc(p.name) + "</div>" +
            '<div class="cpres">' + esc(T(p.presEs, p.presEn)) + "</div>" +
            '<div class="crow"><div class="step">' +
              '<button data-dec="' + p.id + '" aria-label="-">' + icon("i-minus") + "</button>" +
              '<span class="n">' + i.qty + "</span>" +
              '<button data-inc="' + p.id + '" aria-label="+">' + icon("i-plus") + "</button>" +
            "</div><span class=\"camt\">" + fmt(p.price * i.qty) + "</span></div></div>" +
            '<button class="rm" data-rm="' + p.id + '" aria-label="Eliminar">' + icon("i-trash") + "</button></div>";
        }).join("");
      }
    }
    var subOut = $("[data-cart-subtotal]"); if (subOut) subOut.textContent = fmt(sub);
    var shipOut = $("[data-cart-shipping]"); if (shipOut) shipOut.textContent = shipping === 0 ? T("Gratis", "Free") : fmt(shipping);
    var totOut = $("[data-cart-total]"); if (totOut) totOut.textContent = fmt(sub + shipping);
  }

  function openCart() { if (drawer) { drawer.classList.add("show"); drawer.setAttribute("aria-hidden", "false"); if (overlay) overlay.classList.add("show"); } }
  function closeCart() { if (drawer) { drawer.classList.remove("show"); drawer.setAttribute("aria-hidden", "true"); if (overlay) overlay.classList.remove("show"); } }

  /* -------------------- Toasts -------------------- */
  function toast(message) {
    var wrap = $("[data-toast-wrap]"); if (!wrap) return;
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = icon("i-check") + '<span class="tmsg">' + esc(message) + "</span>" +
      '<button class="taction">' + T("Ver carrito", "View cart") + "</button>";
    el.querySelector(".taction").addEventListener("click", function () { openCart(); dismiss(); });
    wrap.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("show"); });
    var t = setTimeout(dismiss, 2800);
    function dismiss() { clearTimeout(t); el.classList.remove("show"); setTimeout(function () { el.remove(); }, 350); }
  }

  /* -------------------- COA verify -------------------- */
  var BATCHES = { "AMX-2608": { p: "BPC-157", purity: "99.42%" }, "AMX-2611": { p: "TB-500", purity: "99.10%" },
    "AMX-2617": { p: "Ipamorelin", purity: "99.60%" }, "AMX-2624": { p: "GHK-Cu", purity: "99.20%" },
    "AMX-2630": { p: "NAD+", purity: "99.80%" }, "AMX-2634": { p: "Semaglutide", purity: "99.30%" } };

  /* -------------------- Eventos -------------------- */
  document.addEventListener("click", function (e) {
    var t = e.target;
    var add = t.closest("[data-add]"); if (add) { addToCart(add.getAttribute("data-add")); return; }
    var view = t.closest("[data-view]"); if (view) { openModal(view.getAttribute("data-view")); return; }
    var addM = t.closest("[data-add-modal]"); if (addM) { addToCart(addM.getAttribute("data-add-modal")); closeModal(); openCart(); return; }
    var goc = t.closest("[data-gocat]"); if (goc) { state.cat = goc.getAttribute("data-gocat"); renderFilters(); renderGrid(); var el = document.getElementById("catalogo"); if (el) el.scrollIntoView({ behavior: "smooth" }); return; }
    var fil = t.closest("[data-filter]"); if (fil) { state.cat = fil.getAttribute("data-filter"); renderFilters(); renderGrid(); return; }
    var inc = t.closest("[data-inc]"); if (inc) { var pi = byId[inc.getAttribute("data-inc")]; var ci = state.cart.filter(function (x) { return x.id === inc.getAttribute("data-inc"); })[0]; setQty(inc.getAttribute("data-inc"), (ci ? ci.qty : 0) + 1); return; }
    var dec = t.closest("[data-dec]"); if (dec) { var cd = state.cart.filter(function (x) { return x.id === dec.getAttribute("data-dec"); })[0]; setQty(dec.getAttribute("data-dec"), (cd ? cd.qty : 0) - 1); return; }
    var rm = t.closest("[data-rm]"); if (rm) { setQty(rm.getAttribute("data-rm"), 0); return; }
    if (t.closest("[data-open-cart]")) { e.preventDefault(); openCart(); return; }
    if (t.closest("[data-close-cart]")) { closeCart(); return; }
    if (t.closest("[data-close-modal]")) { closeModal(); return; }
    var lang = t.closest("[data-lang]"); if (lang) { setLang(lang.getAttribute("data-lang")); return; }
  });

  var searchInput = $("[data-search]");
  if (searchInput) searchInput.addEventListener("input", function () { state.q = this.value; renderGrid(); });

  if (overlay) overlay.addEventListener("click", closeCart);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeCart(); closeModal(); } });

  // Header scroll
  var header = $(".header");
  function onScroll() { if (header) header.setAttribute("data-scrolled", window.scrollY > 12 ? "true" : "false"); }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  // Burger
  var burger = $("[data-burger]"), menu = $("[data-mobile-menu]");
  if (burger && menu) {
    burger.addEventListener("click", function () {
      var open = burger.getAttribute("aria-expanded") === "true";
      burger.setAttribute("aria-expanded", String(!open));
      menu.classList.toggle("show", !open);
    });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) { burger.setAttribute("aria-expanded", "false"); menu.classList.remove("show"); } });
  }

  // Tema claro / oscuro (el script en <head> fija el tema inicial sin parpadeo)
  function currentTheme() { return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"; }
  function syncMeta() { var m = $('meta[name="theme-color"]'); if (m) m.setAttribute("content", currentTheme() === "light" ? "#eef6f7" : "#0a0f16"); }
  function setTheme(t) { document.documentElement.setAttribute("data-theme", t); if (LS) LS.setItem("amx_theme", t); syncMeta(); }
  $$("[data-theme-toggle]").forEach(function (b) {
    b.addEventListener("click", function () { setTheme(currentTheme() === "light" ? "dark" : "light"); });
  });
  syncMeta();

  // Verify
  var vForm = $("[data-verify-form]");
  if (vForm) vForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("[data-verify-input]"), res = $("[data-verify-result]");
    var raw = (input && input.value || "").trim().toUpperCase();
    if (raw && raw.indexOf("AMX") === 0 && raw.indexOf("-") === -1) raw = raw.replace("AMX", "AMX-");
    var hit = BATCHES[raw];
    if (res) {
      res.className = "result show" + (hit ? " ok" : "");
      res.innerHTML = hit
        ? T("Lote <b>" + raw + "</b> · " + hit.p + " · Pureza " + hit.purity + " · válido ✓", "Batch <b>" + raw + "</b> · " + hit.p + " · Purity " + hit.purity + " · valid ✓")
        : T("Lote no encontrado. Revisa el código impreso en el vial (p. ej. AMX-2608).", "Batch not found. Check the code printed on the vial (e.g. AMX-2608).");
    }
  });

  // Newsletter
  $$("[data-subscribe]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = form.querySelector("input"), re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (input && re.test(input.value.trim())) { toast(T("¡Listo! Te avisaremos de nuevos lotes.", "Done! We'll notify you of new batches.")); form.reset(); }
      else if (input) input.focus();
    });
  });

  // PDP (producto.html)
  var pdpAdd = $("[data-add-pdp]");
  if (pdpAdd) {
    var pq = 1, pqEl = $("[data-pdp-qty]");
    var setPq = function (v) { pq = Math.max(1, Math.min(20, v)); if (pqEl) pqEl.textContent = pq; };
    var pdec = $("[data-pdp-dec]"), pinc = $("[data-pdp-inc]");
    if (pdec) pdec.addEventListener("click", function () { setPq(pq - 1); });
    if (pinc) pinc.addEventListener("click", function () { setPq(pq + 1); });
    pdpAdd.addEventListener("click", function () { addToCart(pdpAdd.getAttribute("data-add-pdp"), pq); openCart(); });
    var wish = $("[data-wish]");
    if (wish) wish.addEventListener("click", function () {
      var on = wish.classList.toggle("on");
      var use = wish.querySelector("use");
      if (use) use.setAttribute("href", on ? "#i-heart" : "#i-heart");
    });
    // Thumbnails (visual)
    $$(".pdp-thumbs .t").forEach(function (t) {
      t.addEventListener("click", function () {
        $$(".pdp-thumbs .t").forEach(function (o) { o.classList.remove("active"); });
        if (!t.classList.contains("pdf")) t.classList.add("active");
      });
    });
  }

  // Year
  var y = $("[data-year]"); if (y) y.textContent = String(new Date().getFullYear());

  /* -------------------- Init -------------------- */
  applyLang(); renderCats(); renderFilters(); renderGrid(); renderCart();
})();
