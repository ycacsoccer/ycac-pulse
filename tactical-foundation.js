/* Three visible language buttons for the standalone tactical page. */
(() => {
  if (!window.YCACI18n) return;
  const buttons = [...document.querySelectorAll("[data-foundation-lang]")];
  const update = () => buttons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.foundationLang === YCACI18n.language));
  });
  buttons.forEach((button) => button.addEventListener("click", () => YCACI18n.setLanguage(button.dataset.foundationLang)));
  YCACI18n.onChange(update);
  update();
})();
