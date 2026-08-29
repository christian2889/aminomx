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

  var FREE_SHIPPING = 3500, SHIPPING_COST = 189;

  /* -------------------- Datos -------------------- */
  var CATEGORIES = [
    { id: "todos",         es: "Todos",                 en: "All",                 icon: "i-flame" },
    { id: "perdida-peso",  es: "Pérdida de peso",       en: "Weight loss",         icon: "i-trending-down" },
    { id: "recomposicion", es: "Recomposición corporal",en: "Body recomposition",  icon: "i-zap" },
    { id: "metabolicos",   es: "Metabólicos",           en: "Metabolic",           icon: "i-heart-pulse" },
    { id: "regenerativos", es: "Regenerativos",         en: "Regenerative",        icon: "i-syringe" },
    { id: "anti-edad",     es: "Anti-edad",             en: "Anti-aging",          icon: "i-sparkles" },
    { id: "aminoacidos",   es: "Aminoácidos",           en: "Amino acids",         icon: "i-flame" },
    { id: "insumos",       es: "Insumos",               en: "Supplies",            icon: "i-syringe" }
  ];

  var P = function (id, name, cat, price, compareAt, purity, presEs, presEn, descEs, descEn, tagsEs, tagsEn, stock, flags) {
    flags = flags || {};
    return { id: id, name: name, category: cat, price: price, compareAt: compareAt || 0, purity: purity,
      presEs: presEs, presEn: presEn, descEs: descEs, descEn: descEn, tagsEs: tagsEs, tagsEn: tagsEn,
      stock: stock, bestseller: !!flags.b, isNew: !!flags.n, comingSoon: !!flags.s };
  };

  var FALLBACK_PRODUCTS = [
    // Pérdida de peso
    P("retatrutide-5","Retatrutide","perdida-peso",1190,0,"≥99%","Vial liofilizado 5 mg","Lyophilized vial 5 mg",
      "Agonista triple GIP/GLP-1/Glucagón. Compuesto de nueva generación en investigación metabólica y de composición corporal. Incluye COA por lote.",
      "Triple GIP/GLP-1/Glucagon agonist. A next-generation compound in metabolic and body-composition research. Includes a COA per batch.",
      ["Triple agonista","Pérdida de peso"],["Triple agonist","Weight loss"],30,{}),
    P("retatrutide-15","Retatrutide","perdida-peso",2690,0,"≥99%","Vial liofilizado 15 mg","Lyophilized vial 15 mg",
      "Agonista triple GIP/GLP-1/Glucagón en presentación de 15 mg para protocolos de investigación de mayor duración.",
      "Triple GIP/GLP-1/Glucagon agonist in a 15 mg presentation for longer research protocols.",
      ["Triple agonista","Alta concentración"],["Triple agonist","High strength"],30,{b:1}),
    P("retatrutide-20","Retatrutide","perdida-peso",3290,0,"≥99%","Vial liofilizado 20 mg","Lyophilized vial 20 mg",
      "Agonista triple GIP/GLP-1/Glucagón en presentación de 20 mg, la de mayor concentración. Compuesto de nueva generación en investigación metabólica y de composición corporal.",
      "Triple GIP/GLP-1/Glucagon agonist in a 20 mg presentation, the highest strength. A next-generation compound in metabolic and body-composition research.",
      ["Triple agonista","Alta concentración"],["Triple agonist","High strength"],9,{}),
    P("tirzepatide-5","Tirzepatide","perdida-peso",890,0,"≥99%","Vial liofilizado 5 mg","Lyophilized vial 5 mg",
      "Agonista dual GIP/GLP-1 de referencia en estudios de reducción de peso y salud metabólica. Pureza verificada por HPLC.",
      "Dual GIP/GLP-1 agonist, a reference in weight-reduction and metabolic-health studies. HPLC-verified purity.",
      ["GIP/GLP-1","Pérdida de peso"],["GIP/GLP-1","Weight loss"],10,{b:1}),
    P("tirzepatide-15","Tirzepatide","perdida-peso",1790,0,"≥99%","Vial liofilizado 15 mg","Lyophilized vial 15 mg",
      "Agonista dual GIP/GLP-1 en presentación de 15 mg para etapas avanzadas de investigación metabólica.",
      "Dual GIP/GLP-1 agonist in a 15 mg presentation for advanced stages of metabolic research.",
      ["GIP/GLP-1","Alta concentración"],["GIP/GLP-1","High strength"],10,{}),
    P("hgh-fragment-5","HGH Fragment 176-191","perdida-peso",1290,0,"≥99%","Vial liofilizado 5 mg","Lyophilized vial 5 mg",
      "Fragmento C-terminal de la hormona de crecimiento estudiado en investigación de lipólisis y metabolismo de grasas sin efecto en IGF-1.",
      "C-terminal growth-hormone fragment studied in lipolysis and fat-metabolism research without an effect on IGF-1.",
      ["Lipólisis","Fragmento hGH"],["Lipolysis","hGH fragment"],10,{}),
    // Recomposición
    P("tesamorelin-10","Tesamorelin","recomposicion",1990,0,"≥99%","Vial liofilizado 10 mg","Lyophilized vial 10 mg",
      "GHRH estudiado en investigación sobre grasa visceral, cognición y composición corporal. Presentación de 10 mg.",
      "GHRH studied in research on visceral fat, cognition and body composition. 10 mg presentation.",
      ["GHRH","Grasa visceral"],["GHRH","Visceral fat"],10,{}),
    P("ipamorelin-5","Ipamorelin","recomposicion",790,0,"≥99%","Vial liofilizado 5 mg","Lyophilized vial 5 mg",
      "Secretagogo de GH altamente selectivo. Referencia en estudios de masa magra, recuperación y calidad del sueño.",
      "Highly selective GH secretagogue. A reference in lean-mass, recovery and sleep-quality studies.",
      ["GHRP","Masa magra"],["GHRP","Lean mass"],10,{}),
    P("cjc1295-ipamorelin-blend","Blend CJC-1295 sin DAC + Ipamorelin","recomposicion",2490,2880,"≥99%","Vial liofilizado 5 mg + 5 mg","Lyophilized vial 5 mg + 5 mg",
      "La sinergia más estudiada para pulsos naturales de GH: el GHRH de vida media corta junto al secretagogo más selectivo, en un solo vial liofilizado.",
      "The most-studied synergy for natural GH pulses: the short half-life GHRH alongside the most selective secretagogue, in a single lyophilized vial.",
      ["Combo","Recomposición"],["Combo","Recomposition"],8,{b:1}),
    P("pegmgf-2","PEG-MGF","recomposicion",990,0,"≥99%","Vial liofilizado 2 mg","Lyophilized vial 2 mg",
      "Factor de crecimiento mecánico pegilado, estudiado en investigación de reparación y crecimiento del tejido muscular.",
      "PEGylated mechano growth factor studied in muscle-tissue repair and growth research.",
      ["MGF","Recuperación"],["MGF","Recovery"],10,{}),
    P("hgh-24iu","HGH Somatropina 191aa","recomposicion",1390,0,"≥99%","Vial liofilizado 24 UI","Lyophilized vial 24 IU",
      "Hormona de crecimiento humana recombinante (191 aminoácidos) en presentación de 24 UI para investigación de laboratorio.",
      "Recombinant human growth hormone (191 amino acids) in a 24 IU presentation for laboratory research.",
      ["GH","191aa"],["GH","191aa"],10,{}),
    // Metabólicos
    P("motsc-15","MOTS-c","metabolicos",1490,0,"≥99%","Vial liofilizado 15 mg","Lyophilized vial 15 mg",
      "Péptido mitocondrial estudiado en investigación de sensibilidad a la insulina, ejercicio y envejecimiento metabólico.",
      "Mitochondrial peptide studied in research on insulin sensitivity, exercise and metabolic aging.",
      ["Mitocondrial","Sensibilidad insulínica"],["Mitochondrial","Insulin sensitivity"],10,{}),
    P("ss31-10","SS-31 (Elamipretide)","metabolicos",1590,0,"≥99%","Vial liofilizado 10 mg","Lyophilized vial 10 mg",
      "Tetrapéptido dirigido a la membrana mitocondrial, estudiado en investigación de función mitocondrial y estrés oxidativo.",
      "Mitochondria-targeted tetrapeptide studied in mitochondrial-function and oxidative-stress research.",
      ["Mitocondrial","Antioxidante"],["Mitochondrial","Antioxidant"],10,{n:1}),
    // Regenerativos
    P("glow70-blend","Blend Glow70 (BPC-157 + GHK-Cu + TB-500)","regenerativos",2190,0,"≥99%","Vial liofilizado 70 mg (10+50+10)","Lyophilized vial 70 mg (10+50+10)",
      "Combinación “Glow” de los tres péptidos más estudiados en regeneración: BPC-157 10 mg, GHK-Cu 50 mg y TB-500 10 mg en un solo vial.",
      "“Glow” combination of the three most-studied regenerative peptides: BPC-157 10 mg, GHK-Cu 50 mg and TB-500 10 mg in a single vial.",
      ["Combo","Piel y tejidos"],["Combo","Skin & tissue"],10,{n:1}),
    P("kpv-5","KPV","regenerativos",790,0,"≥99%","Vial liofilizado 5 mg","Lyophilized vial 5 mg",
      "Tripéptido derivado de α-MSH estudiado en investigación de inflamación intestinal y procesos inmunomoduladores.",
      "α-MSH-derived tripeptide studied in research on intestinal inflammation and immunomodulatory processes.",
      ["Antiinflamatorio","Inmunomodulador"],["Anti-inflammatory","Immunomodulator"],10,{}),
    P("cartalax-10","Cartalax","regenerativos",890,0,"≥99%","Vial liofilizado 10 mg","Lyophilized vial 10 mg",
      "Tripéptido bioregulador (Ala-Glu-Asp) estudiado en investigación de cartílago, tejido conectivo y salud articular.",
      "Bioregulator tripeptide (Ala-Glu-Asp) studied in cartilage, connective-tissue and joint-health research.",
      ["Cartílago","Articulaciones"],["Cartilage","Joints"],10,{n:1}),
    // Anti-edad
    P("glutation-600","Glutatión","anti-edad",590,0,"≥99%","Vial liofilizado 600 mg","Lyophilized vial 600 mg",
      "Antioxidante maestro del organismo, estudiado en investigación de detoxificación hepática, piel y estrés oxidativo.",
      "The body's master antioxidant, studied in research on liver detoxification, skin and oxidative stress.",
      ["Antioxidante","Detox"],["Antioxidant","Detox"],10,{}),
    P("nad-500","NAD+","anti-edad",890,0,"≥99%","Vial liofilizado 500 mg","Lyophilized vial 500 mg",
      "Coenzima esencial estudiada en investigación de energía mitocondrial, sirtuinas y salud celular.",
      "Essential coenzyme studied in research on mitochondrial energy, sirtuins and cellular health.",
      ["Coenzima","Energía celular"],["Coenzyme","Cellular energy"],10,{}),
    P("ghkcu-50","GHK-Cu","anti-edad",690,0,"≥99%","Vial liofilizado 50 mg","Lyophilized vial 50 mg",
      "Tripéptido de cobre estudiado en investigación de colágeno, piel, cabello y remodelación tisular.",
      "Copper tripeptide studied in research on collagen, skin, hair and tissue remodeling.",
      ["Colágeno","Piel"],["Collagen","Skin"],10,{}),
    // Insumos
    P("agua-bacteriostatica-3ml","Agua bacteriostática","insumos",149,0,"USP","Vial estéril 3 mL","Sterile vial 3 mL",
      "Agua estéril con alcohol bencílico al 0.9% para reconstitución de péptidos liofilizados en laboratorio. Vial de 3 mL.",
      "Sterile water with 0.9% benzyl alcohol for reconstituting lyophilized peptides in the lab. 3 mL vial.",
      ["Reconstitución","Insumo"],["Reconstitution","Supply"],40,{}),
    P("agua-bacteriostatica-10ml","Agua bacteriostática","insumos",249,0,"USP","Vial estéril 10 mL","Sterile vial 10 mL",
      "Agua estéril con alcohol bencílico al 0.9% para reconstitución de péptidos liofilizados en laboratorio. Vial de 10 mL.",
      "Sterile water with 0.9% benzyl alcohol for reconstituting lyophilized peptides in the lab. 10 mL vial.",
      ["Reconstitución","Insumo"],["Reconstitution","Supply"],40,{})
  ];

  var PRODUCTS = FALLBACK_PRODUCTS;
  var byId = {};
  // Un producto por sustancia: las presentaciones (5/15/20 mg…) son variantes
  // del mismo compuesto y se agrupan por nombre. Cada variante conserva su
  // fila propia (precio, stock, SKU), así que carrito y pedidos no cambian.
  var FAMILIES = [];
  function reindex() {
    byId = {}; FAMILIES = [];
    var map = {};
    PRODUCTS.forEach(function (p) {
      byId[p.id] = p;
      var k = p.name + "||" + p.category;
      if (!map[k]) { map[k] = { name: p.name, category: p.category, variants: [] }; FAMILIES.push(map[k]); }
      map[k].variants.push(p);
    });
    FAMILIES.forEach(function (f) {
      f.variants.sort(function (a, b) { return a.price - b.price; });
      f.key = f.variants[0].id;
      f.bestseller = f.variants.some(function (v) { return v.bestseller; });
      f.isNew = f.variants.some(function (v) { return v.isNew; });
      f.comingSoon = f.variants.every(function (v) { return v.comingSoon; });
    });
  }
  reindex();

  /* ------------------ Catálogo en vivo desde Supabase ------------------ */
  var CFG = window.AMX_CONFIG || {};
  function mapRow(r) {
    var imgs = (r.product_images || []).slice().sort(function (a, b) { return (a.position||0) - (b.position||0); });
    return {
      id: r.slug,
      uuid: r.id,
      name: r.name,
      category: r.category_id || "otros",
      price: Math.round((r.price_cents || 0) / 100),
      compareAt: r.compare_at_cents ? Math.round(r.compare_at_cents / 100) : 0,
      purity: r.purity || "",
      presEs: r.presentation_es || "", presEn: r.presentation_en || "",
      descEs: r.desc_es || "", descEn: r.desc_en || "",
      tagsEs: r.tags_es || [], tagsEn: r.tags_en || [],
      stock: r.stock || 0,
      bestseller: !!r.bestseller, isNew: !!r.is_new,
      comingSoon: !!r.coming_soon,
      image: imgs.length ? imgs[0].url : null
    };
  }
  function loadCatalog() {
    if (!CFG.SUPABASE_URL || !window.fetch) return;
    var url = CFG.SUPABASE_URL + "/rest/v1/products" +
      "?select=id,slug,name,category_id,presentation_es,presentation_en,purity," +
      "price_cents,compare_at_cents,desc_es,desc_en,tags_es,tags_en,stock," +
      "bestseller,is_new,coming_soon,sort_order,product_images(url,position)" +
      "&status=eq.active&order=sort_order.asc";
    fetch(url, { headers: { apikey: CFG.SUPABASE_KEY, Authorization: "Bearer " + CFG.SUPABASE_KEY } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (rows) {
        if (!rows || !rows.length) return;
        PRODUCTS = rows.map(mapRow);
        reindex(); renderCats(); renderFilters(); renderGrid(); renderCart();
      })
      .catch(function () { /* sin conexión: se mantiene el catálogo embebido */ });
  }

  /* -------------------- Estado -------------------- */
  var state = {
    lang: (LS && LS.getItem("amx_lang")) || "es",
    cat: "todos",
    q: "",
    cart: [],
    sel: {}   // concentración elegida por familia (key → id de la variante)
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
  // Una categoría sin productos no se muestra (ni tarjeta ni filtro): el
  // catálogo cambia por temporada y las vacías solo llevarían a un grid vacío.
  function catCount(id) {
    return FAMILIES.filter(function (f) { return f.category === id; }).length;
  }
  function renderCats() {
    var box = $("[data-cats]"); if (!box) return;
    box.innerHTML = CATEGORIES.filter(function (c) { return c.id !== "todos" && catCount(c.id) > 0; }).map(function (c) {
      var count = catCount(c.id);
      return '<button class="cat" data-gocat="' + c.id + '">' +
        '<span class="tile">' + icon(c.icon) + '</span>' +
        '<span class="cname">' + esc(T(c.es, c.en)) + '</span>' +
        '<span class="ccount">' + count + ' ' + T("productos", "products") + '</span></button>';
    }).join("");
  }

  /* -------------------- Filtros -------------------- */
  function renderFilters() {
    var box = $("[data-filters]"); if (!box) return;
    box.innerHTML = CATEGORIES.filter(function (c) { return c.id === "todos" || catCount(c.id) > 0; }).map(function (c) {
      return '<button class="filter' + (state.cat === c.id ? " active" : "") + '" data-filter="' + c.id + '">' + esc(T(c.es, c.en)) + "</button>";
    }).join("");
  }

  /* -------------------- Grid -------------------- */
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return FAMILIES.filter(function (f) {
      if (state.cat !== "todos" && f.category !== state.cat) return false;
      if (!q) return true;
      return f.variants.some(function (p) {
        var tags = p.tagsEs.concat(p.tagsEn).join(" ").toLowerCase();
        return p.name.toLowerCase().indexOf(q) >= 0 || tags.indexOf(q) >= 0 ||
          (T(p.descEs, p.descEn)).toLowerCase().indexOf(q) >= 0;
      });
    }).sort(function (a, b) {
      // Lo que se puede comprar va primero; lo demás conserva su orden.
      return (a.comingSoon ? 1 : 0) - (b.comingSoon ? 1 : 0);
    });
  }

  // Variante que muestra la tarjeta: la que eligió el usuario o, por
  // defecto, la más barata con existencias.
  function famSel(f) {
    var v = null, id = state.sel[f.key];
    if (id) v = f.variants.filter(function (x) { return x.id === id; })[0];
    if (!v) v = f.variants.filter(function (x) { return x.stock > 0 && !x.comingSoon; })[0] || f.variants[0];
    return v;
  }
  // "Vial liofilizado 5 mg" → "5 mg": etiqueta corta para el selector.
  function doseLabel(p) {
    var s = T(p.presEs, p.presEn) || "";
    return s.replace(/^\s*vial\s+\S+\s+/i, "") || s;
  }

  function productCard(f) {
    var p = famSel(f);
    var tags = (state.lang === "en" ? p.tagsEn : p.tagsEs).slice(0, 3).map(function (t) {
      return '<span class="ptag">' + esc(t) + "</span>";
    }).join("");
    var soon = !!p.comingSoon;
    var badges = "";
    if (soon) badges += '<span class="badge badge-soon">' + icon("i-timer") + T("Próximamente", "Coming soon") + "</span>";
    else {
      if (f.bestseller) badges += '<span class="badge badge-amber">' + icon("i-flame") + T("Más vendido", "Best seller") + "</span>";
      if (f.isNew) badges += '<span class="badge badge-sky">' + icon("i-sparkles") + T("Nuevo", "New") + "</span>";
    }
    var doses = "";
    if (f.variants.length > 1) {
      doses = '<div class="pcard-doses">' + f.variants.map(function (v) {
        return '<button class="dose' + (v.id === p.id ? " active" : "") +
          (v.stock <= 0 && !v.comingSoon ? " out" : "") +
          '" data-dose="' + v.id + '" data-fam="' + f.key + '">' + esc(doseLabel(v)) + "</button>";
      }).join("") + "</div>";
    }
    var bg = "linear-gradient(135deg, hsl(215 40% " + (10 + hashHue(p.id)) + "%) 0%, hsl(199 60% 12%) 100%)";
    var low = p.stock <= 10;
    var stock = soon
      ? '<span class="pcard-stock soon">' + icon("i-timer") + T("Esperando disponibilidad", "Awaiting availability") + "</span>"
      : low
        ? '<span class="pcard-stock low">' + icon("i-package") + T("¡Últimas " + p.stock + " piezas!", "Only " + p.stock + " left!") + "</span>"
        : '<span class="pcard-stock">' + icon("i-package") + p.stock + " " + T("piezas disponibles", "in stock") + "</span>";
    return '<article class="pcard' + (soon ? " is-soon" : "") + '" data-card="' + f.key + '">' +
      '<button class="pcard-media" data-view="' + p.id + '" aria-label="' + esc(p.name) + '">' +
        '<span class="bgfill" style="background:' + bg + '"></span>' +
        '<span class="molecule-bg"></span>' +
        (p.image
          ? '<img class="pcard-photo" src="' + esc(p.image) + '" alt="" loading="lazy">'
          : '<span class="vial">' + vialSVG(purityShort(p.purity)) + "</span>") +
        '<span class="tl">' + badges + "</span>" +
        '<span class="tr"><span class="badge badge-purity">' + T("Pureza ", "Purity ") + esc(p.purity) + "</span></span>" +
      "</button>" +
      '<div class="pcard-body">' +
        '<p class="pcard-kicker">' + esc(catLabel(p.category)) + " · " + esc(T(p.presEs, p.presEn)) + "</p>" +
        '<a class="pcard-name" href="/producto?p=' + encodeURIComponent(p.id) + '">' + esc(p.name) + "</a>" +
        doses +
        '<div class="pcard-tags">' + tags + "</div>" +
        '<div class="pcard-foot">' +
          '<div class="pcard-price">' +
            (soon ? "" : (p.compareAt ? '<div class="compare">' + fmt(p.compareAt) + "</div>" : "")) +
            '<div class="amt">' + (soon ? T("Por anunciar", "TBA") : fmt(p.price)) + "</div></div>" +
          (soon
            ? '<button class="btn btn-outline btn-sm" disabled aria-disabled="true">' +
                icon("i-timer") + T("Pronto", "Soon") + "</button>"
            : '<button class="btn btn-primary btn-sm" data-add="' + p.id + '">' +
                icon("i-cart") + T("Agregar", "Add") + "</button>") +
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
    $("[data-modal-price]").textContent = p.comingSoon ? T("Por anunciar", "TBA") : fmt(p.price);
    $("[data-modal-compare]").textContent = (p.comingSoon || !p.compareAt) ? "" : fmt(p.compareAt);
    var mAdd = $("[data-modal-add]");
    mAdd.setAttribute("data-add-modal", p.id);
    mAdd.disabled = !!p.comingSoon;
    // El texto vive en un <span data-en>, y applyLang lo reescribe desde
    // dataset.es/en: hay que mover las dos versiones, no sólo el textContent.
    var mLabel = mAdd.querySelector("[data-en]");
    if (mLabel) {
      mLabel.dataset.es = p.comingSoon ? "Esperando disponibilidad" : "Agregar al carrito";
      mLabel.dataset.en = p.comingSoon ? "Awaiting availability" : "Add to cart";
      mLabel.textContent = state.lang === "en" ? mLabel.dataset.en : mLabel.dataset.es;
    }
    var ficha = $(".modal-ficha");
    if (ficha) ficha.href = "/producto?p=" + encodeURIComponent(p.id);
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
    var prod = byId[id];
    // Cortesía en el navegador; el candado de verdad está en create_order.
    if (prod && prod.comingSoon) {
      toast(T(prod.name + " todavía no está disponible.", prod.name + " is not available yet."));
      return;
    }
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
      msg.innerHTML = icon("i-truck") + (missing > 0
        ? T("Te faltan <b>" + fmt(missing) + "</b> para envío gratis", "You're <b>" + fmt(missing) + "</b> away from free shipping")
        : "<b>" + T("¡Tienes envío gratis!", "You have free shipping!") + "</b>");
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
    var dose = t.closest("[data-dose]");
    if (dose) {
      var famK = dose.getAttribute("data-fam");
      state.sel[famK] = dose.getAttribute("data-dose");
      var fam = FAMILIES.filter(function (f) { return f.key === famK; })[0];
      var cardEl = dose.closest(".pcard");
      if (fam && cardEl) {
        var tmp = document.createElement("div");
        tmp.innerHTML = productCard(fam);
        cardEl.replaceWith(tmp.firstElementChild);
      }
      return;
    }
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
  function showVerify(res, raw, hit) {
    if (!res) return;
    res.className = "result show" + (hit ? " ok" : "");
    res.innerHTML = hit
      ? T("Lote <b>" + raw + "</b> \u00b7 " + hit.p + " \u00b7 Pureza " + hit.purity + " \u00b7 v\u00e1lido \u2713",
          "Batch <b>" + raw + "</b> \u00b7 " + hit.p + " \u00b7 Purity " + hit.purity + " \u00b7 valid \u2713")
      : T("Lote no encontrado. Revisa el c\u00f3digo impreso en el vial (p. ej. AMX-2608).",
          "Batch not found. Check the code printed on the vial (e.g. AMX-2608).");
  }
  if (vForm) vForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("[data-verify-input]"), res = $("[data-verify-result]");
    var raw = (input && input.value || "").trim().toUpperCase();
    if (raw && raw.indexOf("AMX") === 0 && raw.indexOf("-") === -1) raw = raw.replace("AMX", "AMX-");
    if (res) { res.className = "result show"; res.textContent = T("Verificando\u2026", "Verifying\u2026"); }
    var localHit = BATCHES[raw] || null;
    if (CFG.SUPABASE_URL && window.fetch) {
      fetch(CFG.SUPABASE_URL + "/rest/v1/rpc/verify_batch", {
        method: "POST",
        headers: { apikey: CFG.SUPABASE_KEY, Authorization: "Bearer " + CFG.SUPABASE_KEY,
                   "Content-Type": "application/json" },
        body: JSON.stringify({ p_code: raw })
      })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (rows) {
          var row = rows && rows[0];
          showVerify(res, raw, row ? { p: row.product_name || raw, purity: (row.purity_hplc || "") + "%" } : null);
        })
        .catch(function () { showVerify(res, raw, localHit); });
    } else {
      showVerify(res, raw, localHit);
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
    pdpAdd.addEventListener("click", function () {
      var slug = pdpAdd.getAttribute("data-add-pdp");
      if (slug) { addToCart(slug, pq); openCart(); }
    });
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
  loadCatalog();
})();
