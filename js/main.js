/* ==========================================================================
   Aminos MX — Interacciones
   Sin dependencias. Progresivo: si el JS falla, la página sigue usable.
   ========================================================================== */
(function () {
  "use strict";

  var doc = document;

  /* ---------- Año dinámico en el footer ---------- */
  var yearEl = doc.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- Header: sombra al hacer scroll ---------- */
  var header = doc.getElementById("siteHeader");
  function onScroll() {
    if (!header) return;
    header.setAttribute("data-elevated", window.scrollY > 8 ? "true" : "false");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Menú móvil ---------- */
  var navToggle = doc.getElementById("navToggle");
  var mainNav = doc.getElementById("mainNav");

  function setMenu(open) {
    if (!navToggle || !mainNav) return;
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    navToggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    mainNav.setAttribute("data-open", open ? "true" : "false");
  }

  if (navToggle && mainNav) {
    navToggle.addEventListener("click", function () {
      setMenu(navToggle.getAttribute("aria-expanded") !== "true");
    });
    // Cerrar al elegir un enlace
    mainNav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });
    // Cerrar con Escape
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setMenu(false);
    });
    // Cerrar si se agranda la ventana a escritorio
    window.addEventListener("resize", function () {
      if (window.innerWidth > 720) setMenu(false);
    });
  }

  /* ---------- FAQ: solo un panel abierto a la vez ---------- */
  var faqList = doc.getElementById("faqList");
  if (faqList) {
    var items = faqList.querySelectorAll("details.faq-item");
    items.forEach(function (item) {
      item.addEventListener("toggle", function () {
        if (!item.open) return;
        items.forEach(function (other) {
          if (other !== item) other.open = false;
        });
      });
    });
  }

  /* ---------- Carrito simulado + toast ---------- */
  var toast = doc.getElementById("toast");
  var toastTimer = null;
  var cartCount = 0;

  function showToast(html) {
    if (!toast) return;
    toast.innerHTML = html;
    toast.setAttribute("data-show", "true");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.setAttribute("data-show", "false");
    }, 2600);
  }

  doc.addEventListener("click", function (e) {
    var btn = e.target.closest(".add-to-cart");
    if (!btn) return;
    var name = btn.getAttribute("data-name") || "Producto";
    cartCount += 1;
    showToast(
      "Agregado: <strong>" + escapeHtml(name) + "</strong> · " +
      cartCount + (cartCount === 1 ? " artículo" : " artículos") + " en el carrito"
    );
  });

  /* ---------- Newsletter ---------- */
  var form = doc.getElementById("newsletterForm");
  var formMsg = doc.getElementById("formMsg");
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (form && formMsg) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = doc.getElementById("email");
      var value = (input && input.value ? input.value : "").trim();
      if (!emailRe.test(value)) {
        formMsg.textContent = "Ingresa un correo válido para continuar.";
        formMsg.setAttribute("data-state", "err");
        if (input) input.focus();
        return;
      }
      formMsg.textContent = "¡Listo! Revisa tu correo para tu cupón de 10%.";
      formMsg.setAttribute("data-state", "ok");
      form.reset();
    });
  }

  /* ---------- Reveal al hacer scroll ---------- */
  var revealTargets = doc.querySelectorAll(
    ".section-head, .card, .bundle, .ciencia-panel, .step, .cta-inner"
  );
  revealTargets.forEach(function (el) { el.classList.add("reveal"); });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealTargets.forEach(function (el) { io.observe(el); });
  } else {
    revealTargets.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- Utilidad ---------- */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
