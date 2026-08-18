/* ==========================================================================
   Aminos MX — Interacciones
   Reimplementa la lógica del diseño (Claude Design / DCLogic) en JS vanilla:
   idioma ES/EN, carrito + cajón, toast, selector de presentación y precio,
   stepper de cantidad, filtros, verificación de COA. Sin dependencias.
   ========================================================================== */
(function () {
  "use strict";
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var LS = window.localStorage;

  var FREE_SHIP = 2500;
  var state = {
    lang: (LS && LS.getItem("amx_lang")) || "es",
    cart: []
  };
  try { state.cart = JSON.parse(LS.getItem("amx_cart")) || []; } catch (e) { state.cart = []; }

  var fmt = function (n) { return "$" + Number(n).toLocaleString("en-US"); };
  var T = function (es, en) { return state.lang === "en" ? en : es; };

  /* -------------------- Idioma ES/EN -------------------- */
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
    $$("[data-lang]").forEach(function (b) {
      b.classList.toggle("active", b.dataset.lang === state.lang);
    });
  }
  function setLang(l) {
    state.lang = l;
    if (LS) LS.setItem("amx_lang", l);
    applyLang();
    renderCart();       // re-render dynamic (non-data-en) strings
  }
  $$("[data-lang]").forEach(function (b) {
    b.addEventListener("click", function () { setLang(b.dataset.lang); });
  });

  /* -------------------- Menú móvil -------------------- */
  var burger = $("[data-burger]");
  var menu = $("[data-mobile-menu]");
  if (burger && menu) {
    burger.addEventListener("click", function () {
      var open = burger.getAttribute("aria-expanded") === "true";
      burger.setAttribute("aria-expanded", String(!open));
      menu.classList.toggle("show", !open);
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        burger.setAttribute("aria-expanded", "false");
        menu.classList.remove("show");
      }
    });
  }

  /* -------------------- Carrito -------------------- */
  var drawer = $("[data-drawer]");
  var overlay = $("[data-overlay]");

  function saveCart() { if (LS) LS.setItem("amx_cart", JSON.stringify(state.cart)); }
  function cartQty() { return state.cart.reduce(function (s, i) { return s + i.qty; }, 0); }
  function cartSubtotal() { return state.cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0); }

  function addItem(name, price, batch, qty) {
    qty = qty || 1;
    var found = state.cart.filter(function (i) { return i.name === name && i.price === price; })[0];
    if (found) found.qty += qty;
    else state.cart.push({ name: name, price: price, batch: batch || "", qty: qty });
    saveCart();
    renderCart();
    showToast();
  }
  function changeQty(idx, delta) {
    var it = state.cart[idx];
    if (!it) return;
    it.qty += delta;
    if (it.qty <= 0) state.cart.splice(idx, 1);
    saveCart();
    renderCart();
  }
  function removeItem(idx) { state.cart.splice(idx, 1); saveCart(); renderCart(); }

  function renderCart() {
    var count = cartQty();
    $$("[data-cart-count]").forEach(function (el) { el.textContent = count; });

    var sub = cartSubtotal();
    var subEl = $("[data-cart-subtotal]"); if (subEl) subEl.textContent = fmt(sub);
    var totEl = $("[data-cart-total]");
    if (totEl) totEl.innerHTML = fmt(sub) + '<small>MXN</small>';

    // Free-shipping progress
    var bar = $("[data-ship-bar]");
    var msg = $("[data-ship-msg]");
    if (bar) bar.style.width = Math.min(100, (sub / FREE_SHIP) * 100) + "%";
    if (msg) {
      if (sub === 0) {
        msg.textContent = T("Envío gratis desde $2,500 MXN", "Free shipping from $2,500 MXN");
      } else if (sub >= FREE_SHIP) {
        msg.textContent = T("¡Envío gratis desbloqueado!", "Free shipping unlocked!");
      } else {
        var left = FREE_SHIP - sub;
        msg.textContent = T("Faltan " + fmt(left) + " MXN para envío gratis",
                            fmt(left) + " MXN more for free shipping");
      }
    }

    // Items
    var box = $("[data-drawer-items]");
    if (box) {
      if (!state.cart.length) {
        box.innerHTML = '<div class="drawer-empty">' + T("Tu carrito está vacío.", "Your cart is empty.") + "</div>";
      } else {
        box.innerHTML = "";
        state.cart.forEach(function (it, idx) {
          var el = document.createElement("div");
          el.className = "d-item";
          el.innerHTML =
            '<div class="d-shot"></div>' +
            '<div class="d-main">' +
              '<div class="d-top"><div class="d-name"></div><button class="d-rm" aria-label="' + T("Quitar", "Remove") + '">✕</button></div>' +
              '<div class="d-batch"></div>' +
              '<div class="d-row">' +
                '<div class="d-step"><button data-dec aria-label="−">−</button><span class="n">' + it.qty + '</span><button data-inc aria-label="+">+</button></div>' +
                '<span class="d-amt">' + fmt(it.price * it.qty) + '</span>' +
              '</div>' +
            '</div>';
          el.querySelector(".d-name").textContent = it.name;
          el.querySelector(".d-batch").textContent = it.batch ? T("Lote ", "Batch ") + it.batch : "";
          el.querySelector("[data-dec]").addEventListener("click", function () { changeQty(idx, -1); });
          el.querySelector("[data-inc]").addEventListener("click", function () { changeQty(idx, 1); });
          el.querySelector(".d-rm").addEventListener("click", function () { removeItem(idx); });
          box.appendChild(el);
        });
      }
    }
  }

  function openCart() {
    if (!drawer) return;
    drawer.classList.add("show");
    drawer.setAttribute("aria-hidden", "false");
    if (overlay) overlay.classList.add("show");
  }
  function closeCart() {
    if (!drawer) return;
    drawer.classList.remove("show");
    drawer.setAttribute("aria-hidden", "true");
    if (overlay) overlay.classList.remove("show");
  }
  $$("[data-open-cart]").forEach(function (b) {
    b.addEventListener("click", function (e) { e.preventDefault(); openCart(); });
  });
  $$("[data-close-cart]").forEach(function (b) { b.addEventListener("click", closeCart); });
  if (overlay) overlay.addEventListener("click", closeCart);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCart(); });

  /* -------------------- Toast -------------------- */
  var toast = $("[data-toast]");
  var toastTimer = null;
  function showToast() {
    if (!toast) return;
    var c = $("[data-toast-count]", toast);
    if (c) c.textContent = cartQty() + " " + T("items", "items");
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2200);
  }

  /* -------------------- Añadir (tarjetas de producto) -------------------- */
  $$("[data-add]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      addItem(btn.dataset.name, Number(btn.dataset.price), btn.dataset.batch, 1);
    });
  });

  /* -------------------- Filtros (más vendidos) -------------------- */
  var filterGroup = $("[data-filter-group]");
  if (filterGroup) {
    filterGroup.addEventListener("click", function (e) {
      var chip = e.target.closest("[data-filter]");
      if (!chip) return;
      $$("[data-filter]", filterGroup).forEach(function (c) { c.classList.toggle("active", c === chip); });
      var f = chip.dataset.filter;
      $$("[data-products] .product").forEach(function (p) {
        p.style.display = (f === "all" || p.dataset.cat === f) ? "" : "none";
      });
    });
  }

  /* -------------------- Verificación de COA -------------------- */
  var BATCHES = {
    "AMX-2608": { p: "BPC-157", purity: "99.42%" },
    "AMX-2611": { p: "TB-500", purity: "99.10%" },
    "AMX-2617": { p: "Ipamorelin", purity: "99.60%" },
    "AMX-2620": { p: "CJC-1295 + Ipamorelin", purity: "99.30%" },
    "AMX-2624": { p: "GHK-Cu", purity: "99.20%" },
    "AMX-2630": { p: "NAD+", purity: "99.80%" },
    "AMX-2634": { p: "Semax", purity: "99.30%" }
  };
  var vForm = $("[data-verify-form]");
  if (vForm) {
    vForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = $("[data-verify-input]", vForm.parentElement) || $("[data-verify-input]");
      var res = $("[data-verify-result]");
      var raw = (input && input.value || "").trim().toUpperCase();
      if (raw && raw.indexOf("AMX") === 0 && raw.indexOf("-") === -1) raw = raw.replace("AMX", "AMX-");
      var hit = BATCHES[raw];
      if (res) {
        res.classList.add("show");
        if (hit) {
          res.innerHTML = T(
            "Lote <b>" + raw + "</b> · " + hit.p + " · Pureza " + hit.purity + " · válido ✓",
            "Batch <b>" + raw + "</b> · " + hit.p + " · Purity " + hit.purity + " · valid ✓"
          );
        } else {
          res.innerHTML = T(
            "Lote no encontrado. Revisa el código impreso en el vial (p. ej. AMX-2608).",
            "Batch not found. Check the code printed on the vial (e.g. AMX-2608)."
          );
        }
      }
    });
  }

  /* -------------------- PDP: presentación + precio -------------------- */
  var sizes = $("[data-sizes]");
  if (sizes) {
    var priceEl = $("[data-pdp-price]");
    var addPdp = $("[data-add-pdp]");
    function sizeLabel(v) { return v === "kit" ? "Kit 5×5 mg" : v + " mg"; }
    sizes.addEventListener("click", function (e) {
      var b = e.target.closest(".size");
      if (!b) return;
      $$(".size", sizes).forEach(function (s) { s.classList.toggle("active", s === b); });
      if (priceEl) priceEl.textContent = fmt(Number(b.dataset.price));
    });
    // Qty stepper
    var qtyEl = $("[data-qty]");
    var qty = 1;
    var setQty = function (v) { qty = Math.max(1, v); if (qtyEl) qtyEl.textContent = qty; };
    var dec = $("[data-dec]", $("[data-stepper]"));
    var inc = $("[data-inc]", $("[data-stepper]"));
    if (dec) dec.addEventListener("click", function () { setQty(qty - 1); });
    if (inc) inc.addEventListener("click", function () { setQty(qty + 1); });
    // Add to cart
    if (addPdp) {
      addPdp.addEventListener("click", function () {
        var active = $(".size.active", sizes);
        var v = active ? active.dataset.size : "5";
        var price = active ? Number(active.dataset.price) : 890;
        addItem("BPC-157 " + sizeLabel(v), price, addPdp.dataset.batch, qty);
        openCart();
      });
    }
    // Wishlist
    var wish = $("[data-wish]");
    if (wish) wish.addEventListener("click", function () {
      wish.classList.toggle("on");
      wish.textContent = wish.classList.contains("on") ? "♥" : "♡";
    });
    // Thumbnails
    $$(".thumbs .t").forEach(function (t) {
      t.addEventListener("click", function () {
        $$(".thumbs .t").forEach(function (o) { o.classList.remove("active"); });
        if (!t.classList.contains("pdf")) t.classList.add("active");
      });
    });
  }

  /* -------------------- Suscripción / newsletter -------------------- */
  $$("[data-subscribe]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = form.querySelector("input");
      var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (input && re.test(input.value.trim())) {
        var fine = form.parentElement.querySelector(".fineprint");
        if (fine) fine.textContent = T("¡Listo! Te avisaremos de nuevos lotes.", "Done! We'll notify you of new batches.");
        form.reset();
      } else if (input) {
        input.focus();
      }
    });
  });

  /* -------------------- Init -------------------- */
  applyLang();
  renderCart();
})();
